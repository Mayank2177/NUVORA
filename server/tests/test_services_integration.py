import asyncio
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from storage.db import Storage
from storage.utils import utc_now_iso


POSTGRES_URL = os.getenv("NUVORA_TEST_POSTGRES_URL")
REDIS_URL = os.getenv("NUVORA_TEST_REDIS_URL")


@pytest.mark.skipif(not POSTGRES_URL, reason="PostgreSQL service not configured")
def test_postgres_storage_and_portable_analytics(monkeypatch):
    storage = Storage(
        Path("/tmp/unused-nuvora.sqlite3"),
        database_url=POSTGRES_URL,
        database_pool_size=4,
    )
    suffix = uuid.uuid4().hex
    user_id = f"usr-{suffix}"
    project_id = f"prj-{suffix}"
    evidence_id = f"evd-{suffix}"
    now = utc_now_iso()
    try:
        storage.execute(
            """
            INSERT INTO users (
              id, email, name, username, password_hash, email_verified,
              is_admin, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
            """,
            (
                user_id,
                f"{suffix}@example.com",
                "Postgres Test",
                f"user{suffix[:12]}",
                "test-only",
                now,
                now,
            ),
        )
        storage.execute(
            """
            INSERT INTO projects (
              id, user_id, name, slug, repo, summary, stack, span, status,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, '[]', '', 'draft', ?, ?)
            """,
            (
                project_id,
                user_id,
                "Postgres Test",
                f"postgres-{suffix}",
                "",
                "",
                now,
                now,
            ),
        )
        storage.execute(
            """
            INSERT INTO evidence (
              id, project_id, kind, title, body, source, occurred_at,
              ai_assisted, verified, publish, sensitive, commit_hash,
              created_at, updated_at
            ) VALUES (?, ?, 'proof', 'Works', '', '', ?, 0, 1, 1, 0, NULL, ?, ?)
            """,
            (evidence_id, project_id, now, now, now),
        )
        row = storage.fetchone(
            """
            SELECT
              SUM(CASE WHEN kind = 'proof' THEN 1 ELSE 0 END) AS proof,
              SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS verified
            FROM evidence WHERE project_id = ?
            """,
            (project_id,),
        )
        assert int(row["proof"]) == 1
        assert int(row["verified"]) == 1

        def append_audit(index: int):
            def transaction(conn):
                storage.append_evidence_audit(
                    conn,
                    project_id=project_id,
                    evidence_id=evidence_id,
                    actor_id=user_id,
                    action="baseline",
                    payload={"index": index},
                )

            storage.executemany_tx(transaction)

        with ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(append_audit, range(12)))
        chain = storage.evidence_chain(project_id)
        assert chain["valid"] is True
        assert chain["totalEntries"] == 12
        assert [entry["position"] for entry in chain["entries"]] == list(range(1, 13))
        # Exercise the new parent/child row-lock ordering and resolution
        # idempotency on real PostgreSQL, not merely the SQLite fallback.
        from api.routes.journey import create_blocker, resolve_blocker
        from schemas.journey import BlockerCreate, BlockerResolve
        monkeypatch.setattr("api.routes.journey.storage", storage)
        blocker = create_blocker.__wrapped__(
            project_id, BlockerCreate(title="PostgreSQL blocker"), {"id": user_id},
        )["blocker"]
        request = BlockerResolve(solution="Verified transaction")
        with ThreadPoolExecutor(max_workers=6) as executor:
            resolutions = list(executor.map(
                lambda _: resolve_blocker.__wrapped__(blocker["id"], request, {"id": user_id}),
                range(12),
            ))
        assert len({item["evidence"]["id"] for item in resolutions}) == 1
        assert storage.evidence_chain(project_id)["totalEntries"] == 13
        assert storage.evidence_chain(project_id)["valid"] is True
    finally:
        storage.execute("DELETE FROM evidence WHERE project_id = ?", (project_id,))
        storage.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        storage.execute("DELETE FROM users WHERE id = ?", (user_id,))
        storage.close()


@pytest.mark.skipif(not REDIS_URL, reason="Redis service not configured")
def test_redis_rate_limit_is_shared(monkeypatch):
    import storage.ratelimit as ratelimit

    async def run():
        monkeypatch.setattr(ratelimit.settings, "environment", "production")
        monkeypatch.setattr(ratelimit.settings, "rate_limit_redis_url", REDIS_URL)
        ratelimit._redis_client = None
        identifier = f"integration-{uuid.uuid4().hex}"
        assert await ratelimit.check_rate_limit(identifier, 2, 60)
        assert await ratelimit.check_rate_limit(identifier, 2, 60)
        assert not await ratelimit.check_rate_limit(identifier, 2, 60)
        await ratelimit.close_rate_limiter()

    asyncio.run(run())