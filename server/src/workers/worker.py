"""Run with ``python -m src.workers.worker`` (or the compose worker service)."""
from __future__ import annotations

import json
import logging
import socket
import time

import httpx

from src.config import settings
from src.storage.email import get_email_provider, send_password_reset_email
from src.storage.encryption import decrypt_token
from src.storage.instance import get_storage
from src.storage.security import scan_content
from src.storage.utils import utc_now_iso
from src.api.routes.github import _store_synced_commits
from src.workers.queue import (
    GROUP, MAX_ATTEMPTS, STREAM, WORKER_HEARTBEAT, create_group, promote_retries, redis_client,
    schedule_retry, set_status,
)

logger = logging.getLogger("nuvora.workers")


def _handle(job_type: str, payload: dict) -> dict:
    storage = get_storage()
    if job_type == "password_reset_email":
        token = decrypt_token(payload["token_enc"], settings.encryption_key or settings.secret_key)
        provider = get_email_provider(
            smtp_host=settings.smtp_host, smtp_port=settings.smtp_port,
            smtp_user=settings.smtp_user, smtp_password=settings.smtp_password,
            from_email=settings.smtp_from_email, from_name=settings.smtp_from_name,
        )
        delivered = send_password_reset_email(
            provider=provider, to_email=payload["email"], reset_token=token,
            base_url=settings.frontend_base_url,
            ttl_minutes=settings.password_reset_ttl_minutes,
        )
        if not delivered:
            raise RuntimeError("Password reset email delivery failed")
        return {"delivered": True}

    if job_type == "github_sync":
        user = storage.fetchone(
            "SELECT github_token_enc, github_login FROM users WHERE id = ? AND deleted_at IS NULL",
            (payload["user_id"],),
        )
        storage.owned_project(payload["project_id"], payload["user_id"])
        if not user or not user["github_token_enc"]:
            raise RuntimeError("GitHub connection is no longer available")
        owner, name = payload["owner"], payload["name"]
        token = decrypt_token(user["github_token_enc"], settings.encryption_key or settings.secret_key)
        with httpx.Client(timeout=20.0, headers={"User-Agent": "nuvora"}) as client:
            response = client.get(
                f"https://api.github.com/repos/{owner}/{name}/commits",
                params={"per_page": 30, "sha": payload["branch"]},
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            )
            response.raise_for_status()
            commits = response.json()
        if not isinstance(commits, list):
            raise RuntimeError("Unexpected GitHub commits response")
        login = str(user["github_login"] or "").casefold()
        attributed = [c for c in commits if isinstance(c, dict) and isinstance(c.get("author"), dict)
                      and str(c["author"].get("login") or "").casefold() == login]
        inserted = _store_synced_commits(payload["project_id"], attributed)
        return {"inserted": inserted, "fetched": len(attributed)}

    if job_type == "github_webhook":
        from src.api.routes.github import _matching_projects, _store_webhook_commits
        projects = _matching_projects(payload["repo_url"])
        count = _store_webhook_commits(projects, payload["commits"])
        return {"projects_updated": len(projects), "commits_synced": count}

    if job_type == "secret_scan":
        findings = []
        for part in payload["parts"]:
            findings.extend(scan_content(part["text"], part["location"])["findings"])
        return {"has_blocking_findings": any(f["severity"] == "block" for f in findings),
                "findings": findings}

    if job_type == "analytics_aggregate":
        rows = storage.fetchall("""
            SELECT p.id, COUNT(e.id) AS evidence_items,
                   SUM(CASE WHEN e.ai_assisted = 1 THEN 1 ELSE 0 END) AS ai_assisted,
                   SUM(CASE WHEN e.kind = 'snag' AND e.verified = 0 THEN 1 ELSE 0 END) AS open_blockers,
                   SUM(CASE WHEN e.kind = 'snag' AND e.verified = 1 THEN 1 ELSE 0 END) AS resolved_blockers
            FROM projects p LEFT JOIN evidence e ON e.project_id = p.id
            WHERE p.deleted_at IS NULL GROUP BY p.id
        """)
        client = redis_client()
        try:
            pipe = client.pipeline()
            for row in rows:
                pipe.setex(f"nuvora:analytics:{row['id']}", 86400, json.dumps(dict(row), default=str))
            pipe.execute()
        finally:
            client.close()
        return {"projects_aggregated": len(rows)}

    if job_type == "cleanup":
        now = utc_now_iso()
        removed = {}
        for table in ("sessions", "password_resets", "oauth_states"):
            removed[table] = max(storage.execute(f"DELETE FROM {table} WHERE expires_at <= ?", (now,)), 0)
        return removed
    raise ValueError(f"Unknown job type: {job_type}")


def run() -> None:
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
    client = redis_client()
    create_group(client)
    consumer = f"{socket.gethostname()}-{int(time.time())}"
    next_cleanup = 0.0
    next_analytics = 0.0
    logger.info("Worker started as %s", consumer)
    while True:
        client.set(WORKER_HEARTBEAT, consumer, ex=300)
        promote_retries(client)
        now = time.monotonic()
        if now >= next_cleanup:
            slot = int(time.time() // 3600)
            if client.set(f"nuvora:schedule:cleanup:{slot}", "1", nx=True, ex=3600):
                client.xadd(STREAM, {"id": f"scheduled-cleanup-{slot}", "type": "cleanup", "payload": "{}", "attempt": "0"})
            next_cleanup = now + 3600
        if now >= next_analytics:
            slot = int(time.time() // 3600)
            if client.set(f"nuvora:schedule:analytics:{slot}", "1", nx=True, ex=3600):
                client.xadd(STREAM, {"id": f"scheduled-analytics-{slot}", "type": "analytics_aggregate", "payload": "{}", "attempt": "0"})
            next_analytics = now + 3600
        claimed = client.xautoclaim(STREAM, GROUP, consumer, min_idle_time=60_000, start_id="0-0", count=10)
        batches = [(STREAM, claimed[1])] if claimed and claimed[1] else client.xreadgroup(
            GROUP, consumer, {STREAM: ">"}, count=10, block=5000
        )
        for _, entries in batches:
            for message_id, fields in entries:
                if "job" in fields:
                    fields = json.loads(fields["job"])
                job_id = fields["id"]
                try:
                    client.set(WORKER_HEARTBEAT, consumer, ex=300)
                    set_status(client, job_id, "running", attempt=fields.get("attempt", "0"))
                    result = _handle(fields["type"], json.loads(fields["payload"]))
                    set_status(client, job_id, "complete", result=json.dumps(result, default=str))
                    logger.info("Job %s (%s) completed", job_id, fields["type"])
                except Exception as exc:
                    attempt = int(fields.get("attempt", "0")) + 1
                    logger.exception("Job %s failed (attempt %d)", job_id, attempt)
                    if attempt < MAX_ATTEMPTS:
                        retry = {**fields, "attempt": str(attempt)}
                        schedule_retry(client, retry, min(5 * (2 ** (attempt - 1)), 300))
                        set_status(client, job_id, "retrying", error=type(exc).__name__)
                    else:
                        set_status(client, job_id, "failed", error=type(exc).__name__)
                        if fields["type"] == "password_reset_email":
                            payload = json.loads(fields["payload"])
                            get_storage().execute(
                                "DELETE FROM password_resets WHERE token_hash = ?",
                                (payload["token_hash"],),
                            )
                client.xack(STREAM, GROUP, message_id)


if __name__ == "__main__":
    run()
