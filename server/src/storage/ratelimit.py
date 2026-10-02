"""Rate limiting with Redis in production and an in-memory development fallback."""
from __future__ import annotations

import threading
import time
from ipaddress import ip_address
from collections import defaultdict
from typing import Dict, Tuple

from config import settings


class InMemoryRateLimiter:
    """Single-process fallback used only for development and tests."""

    def __init__(self) -> None:
        self._buckets: Dict[str, Tuple[float, int]] = defaultdict(
            lambda: (time.time(), 0)
        )
        self._lock = threading.Lock()
        self._checks = 0

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        with self._lock:
            now = time.time()
            self._checks += 1
            if self._checks % 1000 == 0:
                stale = [
                    bucket_key
                    for bucket_key, (started, _) in self._buckets.items()
                    if now - started > max(window_seconds, 3600)
                ]
                for bucket_key in stale:
                    del self._buckets[bucket_key]

            window_start, count = self._buckets[key]
            if now - window_start >= window_seconds:
                self._buckets[key] = (now, 1)
                return True
            if count >= max_requests:
                return False
            self._buckets[key] = (window_start, count + 1)
            return True


_memory_limiter = InMemoryRateLimiter()
_redis_client = None
_redis_rate_limit_script = None
_redis_lock = threading.Lock()

_RATE_LIMIT_LUA = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


def _get_redis_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not settings.rate_limit_redis_url:
        return None
    with _redis_lock:
        if _redis_client is None:
            from redis.asyncio import Redis

            _redis_client = Redis.from_url(
                settings.rate_limit_redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
    return _redis_client


async def check_rate_limit(
    identifier: str,
    max_requests: int,
    window_seconds: int,
) -> bool:
    """Atomically check a fixed-window limit."""
    client = _get_redis_client()
    if client is None:
        if settings.environment.lower() == "production":
            raise RuntimeError("Redis rate limiting is required in production")
        return _memory_limiter.is_allowed(
            identifier, max_requests, window_seconds
        )

    bucket = int(time.time()) // window_seconds
    key = f"nuvora:rate-limit:{identifier}:{window_seconds}:{bucket}"
    global _redis_rate_limit_script
    if _redis_rate_limit_script is None:
        _redis_rate_limit_script = client.register_script(_RATE_LIMIT_LUA)
    count = await _redis_rate_limit_script(
        keys=[key], args=[window_seconds + 1]
    )
    return int(count) <= max_requests


def get_client_identifier(request_or_ip: str) -> str:
    return f"ip:{request_or_ip}"


def get_request_ip(request) -> str:
    direct_ip = request.client.host if request.client else "unknown"
    if direct_ip in settings.trusted_proxy_ips:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            parsed = []
            for value in forwarded.split(","):
                try:
                    parsed.append(ip_address(value.strip()).compressed)
                except ValueError:
                    continue
            # Trusted proxies append addresses to the right. Walk backwards so
            # a client-controlled value at the left cannot spoof rate limits.
            for candidate in reversed(parsed):
                if candidate not in settings.trusted_proxy_ips:
                    return candidate
    try:
        return ip_address(direct_ip).compressed
    except ValueError:
        return direct_ip[:128]


async def close_rate_limiter() -> None:
    global _redis_client, _redis_rate_limit_script
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        _redis_rate_limit_script = None


async def ping_rate_limiter() -> None:
    """Fail startup when the required production Redis service is unavailable."""
    client = _get_redis_client()
    if settings.environment.lower() == "production":
        if client is None:
            raise RuntimeError("Redis rate limiting is required in production")
        await client.ping()
