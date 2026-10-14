"""Redis Streams queue with consumer groups, retries, and job status."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any

from redis import Redis

from src.config import settings

STREAM = "nuvora:jobs"
DELAYED = "nuvora:jobs:delayed"
GROUP = "nuvora-workers"
STATUS_PREFIX = "nuvora:job:"
WORKER_HEARTBEAT = "nuvora:worker:heartbeat"
MAX_ATTEMPTS = 5


def redis_client() -> Redis:
    if not settings.rate_limit_redis_url:
        raise RuntimeError("NUVORA_RATE_LIMIT_REDIS_URL is required for workers")
    return Redis.from_url(settings.rate_limit_redis_url, decode_responses=True)


def enqueue(client: Redis, kind: str, payload: dict[str, Any], owner_id: str | None = None) -> str:
    job_id = str(uuid.uuid4())
    job = {"id": job_id, "type": kind, "payload": json.dumps(payload), "attempt": "0"}
    fields = {"status": "queued", "type": kind}
    if owner_id:
        fields["owner_id"] = owner_id
    client.hset(STATUS_PREFIX + job_id, mapping=fields)
    client.expire(STATUS_PREFIX + job_id, 7 * 86400)
    client.xadd(STREAM, job)
    return job_id


def set_status(client: Redis, job_id: str, status: str, **fields: str) -> None:
    client.hset(STATUS_PREFIX + job_id, mapping={"status": status, **fields})
    client.expire(STATUS_PREFIX + job_id, 7 * 86400)


def job_status(client: Redis, job_id: str) -> dict[str, str] | None:
    status = client.hgetall(STATUS_PREFIX + job_id)
    return status or None


def create_group(client: Redis) -> None:
    try:
        client.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except Exception as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def schedule_retry(client: Redis, fields: dict[str, str], delay_seconds: int) -> None:
    client.zadd(DELAYED, {json.dumps(fields, separators=(",", ":")): time.time() + delay_seconds})


def promote_retries(client: Redis) -> None:
    client.eval("""
        local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 100)
        for _, job in ipairs(due) do
            if redis.call('ZREM', KEYS[1], job) == 1 then
                redis.call('XADD', KEYS[2], '*', 'job', job)
            end
        end
        return #due
    """, 2, DELAYED, STREAM, str(time.time()))
