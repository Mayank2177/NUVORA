import asyncio
import hashlib
import hmac
import json
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from api.app import app
from config import Settings
from domain.hash_chain import compute_entry_hash, verify_chain
from storage.encryption import decrypt_token, encrypt_token
from storage.postgres import _postgres_sql
from storage.ratelimit import InMemoryRateLimiter
from storage.instance import storage
from storage.utils import verify_token


def _run(coro):
    return asyncio.run(coro)


async def _signup(client: httpx.AsyncClient, prefix: str = "user"):
    email = f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"
    response = await client.post(
        "/api/auth/signup",
        json={
            "name": "Integration User",
            "email": email,
            "password": "correct-horse-battery",
        },
    )
    assert response.status_code == 201, response.text
    from api.routes.auth import create_session
    user = storage.fetchone("SELECT id FROM users WHERE email = ?", (email,))
    return email, create_session(user["id"])


def test_complete_crud_publish_and_cache_contract():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            _, token = await _signup(client, "crud")
            headers = {"Authorization": f"Bearer {token}"}

            project = await client.post(
                "/api/projects",
                headers=headers,
                json={
                    "name": "Contract Project",
                    "repo": "https://github.com/acme/contract.project",
                    "summary": "Safe summary",
                    "stack": ["FastAPI", "Next.js"],
                    "span": "one week",
                },
            )
            assert project.status_code == 201
            project_id = project.json()["id"]

            commit = await client.post(
                f"/api/projects/{project_id}/commits",
                headers=headers,
                json={
                    "hash": "b" * 40,
                    "message": "test: add contract coverage",
                    "when": "2026-09-29T00:00:00Z",
                },
            )
            assert commit.status_code == 201, commit.text

            commit_list = await client.get(
                f"/api/projects/{project_id}/commits?limit=1",
                headers=headers,
            )
            assert commit_list.status_code == 200
            assert commit_list.json()["pagination"]["total"] == 1

            evidence = await client.post(
                f"/api/projects/{project_id}/evidence",
                headers=headers,
                json={
                    "kind": "proof",
                    "title": "Contract tests pass",
                    "when": "2026-09-29T00:00:00Z",
                    "verified": True,
                },
            )
            assert evidence.status_code == 201
            evidence_id = evidence.json()["id"]

            evidence_list = await client.get(
                f"/api/projects/{project_id}/evidence?limit=1",
                headers=headers,
            )
            assert evidence_list.status_code == 200
            assert evidence_list.json()["pagination"]["total"] == 1

            analytics = await client.get(
                f"/api/projects/{project_id}/analytics", headers=headers
            )
            assert analytics.status_code == 200
            assert analytics.json()["totalCommits"] == 1

            published = await client.post(
                f"/api/projects/{project_id}/publish",
                headers=headers,
                json={"evidenceIds": [evidence_id], "slug": "contract-project"},
            )
            assert published.status_code == 200

            username = (
                await client.get("/api/auth/me", headers=headers)
            ).json()["username"]
            public = await client.get(
                f"/api/public/{username}/contract-project"
            )
            assert public.status_code == 200
            assert "public" in public.headers["cache-control"]
            assert "must-revalidate" in public.headers["cache-control"]
            cached = await client.get(
                f"/api/public/{username}/contract-project",
                headers={"If-None-Match": public.headers["etag"]},
            )
            assert cached.status_code == 304

            html = await client.get(
                f"/public/{username}/contract-project",
                headers={"Accept": "text/html"},
            )
            assert html.status_code == 200
            assert "must-revalidate" in html.headers["cache-control"]
            assert "default-src 'none'" in html.headers["content-security-policy"]
            assert html.headers["x-content-type-options"] == "nosniff"
            assert html.headers["x-frame-options"] == "DENY"

            assert (
                await client.delete(
                    f"/api/projects/{project_id}/publish", headers=headers
                )
            ).status_code == 204
            assert (
                await client.delete(
                    f"/api/projects/{project_id}/evidence/{evidence_id}",
                    headers=headers,
                )
            ).status_code == 204
            assert (
                await client.delete(
                    f"/api/projects/{project_id}/commits/{'b' * 40}",
                    headers=headers,
                )
            ).status_code == 204
            assert (
                await client.delete(
                    f"/api/projects/{project_id}", headers=headers
                )
            ).status_code == 204

    _run(run())


def test_continuity_packages_mcp_and_evidence_chain_contract():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            _, token = await _signup(client, "continuity")
            headers = {"Authorization": f"Bearer {token}"}
            project = await client.post(
                "/api/projects",
                headers=headers,
                json={
                    "name": "Continuity Project",
                    "summary": "A production API with verifiable project evidence.",
                    "stack": ["FastAPI", "PostgreSQL"],
                },
            )
            assert project.status_code == 201
            project_id = project.json()["id"]

            evidence = await client.post(
                f"/api/projects/{project_id}/evidence",
                headers=headers,
                json={
                    "kind": "proof",
                    "title": "Continuity contract",
                    "body": "All continuity routes passed.",
                    "when": "2026-09-29T00:00:00Z",
                    "verified": True,
                },
            )
            assert evidence.status_code == 201, evidence.text
            evidence_id = evidence.json()["id"]

            updated = await client.patch(
                f"/api/projects/{project_id}/evidence/{evidence_id}",
                headers=headers,
                json={"body": "Continuity and provenance routes passed."},
            )
            assert updated.status_code == 200, updated.text

            chain = await client.get(
                f"/api/projects/{project_id}/continuity/evidence-chain",
                headers=headers,
            )
            assert chain.status_code == 200, chain.text
            assert chain.json()["valid"] is True
            assert chain.json()["totalEntries"] == 2
            assert [item["action"] for item in chain.json()["entries"]] == [
                "create",
                "update",
            ]

            guidance = await client.get(
                f"/api/projects/{project_id}/continuity/guidance",
                headers=headers,
            )
            skills = await client.get(
                f"/api/projects/{project_id}/continuity/skills",
                headers=headers,
            )
            project_md = await client.get(
                f"/api/projects/{project_id}/continuity/project.md",
                headers=headers,
            )
            assert guidance.status_code == skills.status_code == 200
            assert project_md.status_code == 200
            assert guidance.json()["projectId"] == project_id
            assert {claim["skill"] for claim in skills.json()["claims"]} == {
                "FastAPI",
                "PostgreSQL",
            }
            assert "# Continuity Project" in project_md.text

            unauthorized = await client.post(
                "/v1/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            )
            assert unauthorized.status_code == 401
            tools_list = await client.post(
                "/v1/mcp",
                headers=headers,
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            )
            assert tools_list.status_code == 200
            assert len(tools_list.json()["result"]["tools"]) == 3
            tool_call = await client.post(
                "/v1/mcp",
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "nuvora.project.evidence_chain",
                        "arguments": {"projectId": project_id},
                    },
                },
            )
            assert tool_call.status_code == 200
            assert tool_call.json()["result"]["valid"] is True

            deleted = await client.delete(
                f"/api/projects/{project_id}/evidence/{evidence_id}",
                headers=headers,
            )
            assert deleted.status_code == 204
            final_chain = await client.get(
                f"/api/projects/{project_id}/continuity/evidence-chain",
                headers=headers,
            )
            assert final_chain.json()["valid"] is True
            assert final_chain.json()["totalEntries"] == 3
            assert final_chain.json()["entries"][-1]["action"] == "delete"

    _run(run())


def test_password_reset_confirmation(monkeypatch):
    captured = {}

    def capture_email(**kwargs):
        captured["token"] = kwargs["reset_token"]
        return True

    monkeypatch.setattr(
        "api.routes.auth.send_password_reset_email", capture_email
    )

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            email, _ = await _signup(client, "reset")
            reset = await client.post(
                "/api/auth/password/reset", json={"email": email}
            )
            assert reset.status_code == 200
            assert "dev_token" not in reset.json()
            assert captured["token"]

            confirmed = await client.post(
                "/api/auth/password/confirm",
                json={
                    "token": captured["token"],
                    "password": "new-correct-horse-battery",
                },
            )
            assert confirmed.status_code == 200

            login = await client.post(
                "/api/auth/login",
                json={
                    "email": email,
                    "password": "new-correct-horse-battery",
                },
            )
            assert login.status_code == 200

    _run(run())


def test_signed_webhook_is_idempotent_and_uses_full_sha():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            _, token = await _signup(client, "webhook")
            headers = {"Authorization": f"Bearer {token}"}
            project = await client.post(
                "/api/projects",
                headers=headers,
                json={
                    "name": "Webhook Project",
                    "repo": "https://github.com/acme/next.js",
                },
            )
            project_id = project.json()["id"]
            commit_hash = "c" * 40
            payload = {
                "repository": {"html_url": "https://github.com/acme/next.js"},
                "commits": [
                    {
                        "id": commit_hash,
                        "message": "feat: webhook",
                        "timestamp": "2026-09-29T00:00:00Z",
                    }
                ],
            }
            body = json.dumps(payload).encode()
            signature = "sha256=" + hmac.new(
                b"test-webhook-secret", body, hashlib.sha256
            ).hexdigest()
            webhook_headers = {
                "X-Hub-Signature-256": signature,
                "X-GitHub-Event": "push",
            }

            first = await client.post(
                "/api/webhooks/github",
                content=body,
                headers=webhook_headers,
            )
            second = await client.post(
                "/api/webhooks/github",
                content=body,
                headers=webhook_headers,
            )
            assert first.status_code == second.status_code == 200
            assert first.json()["commits_synced"] >= 1
            assert second.json()["commits_synced"] == 0

            commits = await client.get(
                f"/api/projects/{project_id}/commits", headers=headers
            )
            assert commits.json()["pagination"]["total"] == 1
            assert commits.json()["commits"][0]["hash"] == commit_hash

            oversized = await client.post(
                "/api/webhooks/github",
                content=b"x" * 1_000_001,
                headers=webhook_headers,
            )
            assert oversized.status_code == 413

    _run(run())


def test_configuration_and_portable_sql_contracts():
    env_example = open(".env.example", encoding="utf-8").read()
    assert "CONTINUITY_" not in env_example
    assert "NUVORA_SEED_DEMO=false" in env_example
    production_env = Path(".env.production.example").read_text(encoding="utf-8")
    assert "NUVORA_ENVIRONMENT=production" in production_env
    assert "NUVORA_DATABASE_POOL_SIZE=" in production_env
    assert "NUVORA_RATE_LIMIT_ENABLED=true" in production_env
    assert "NUVORA_SEED_DEMO=false" in production_env
    assert "http://" not in production_env
    assert Path("Dockerfile").is_file()
    assert Path(".dockerignore").is_file()
    assert Path(".github/workflows/backend.yml").is_file()
    assert "build: ." in Path("compose.yaml").read_text(encoding="utf-8")

    settings = Settings(
        _env_file=None,
        environment="production",
        database_url="postgresql://user:pass@db/nuvora",
        database_pool_size=10,
        secret_key="0123456789abcdef0123456789abcdef",
        encryption_key="fedcba9876543210fedcba9876543210",
        public_base_url="https://api.example.com",
        frontend_base_url="https://app.example.com",
        cors_origins=["https://app.example.com"],
        github_redirect_uri="https://app.example.com/api/auth/github/callback",
        github_client_id="github-client-id",
        github_client_secret="github-client-secret-12345",
        github_webhook_secret="webhook-9876543210-abcdef-123456789",
        rate_limit_redis_url="rediss://cache.example.com/0",
        smtp_host="smtp.example.com",
        smtp_user="smtp-user",
        smtp_password="smtp-password",
        smtp_from_email="noreply@example.com",
    )
    assert settings.environment == "production"
    assert _postgres_sql("SELECT * FROM users WHERE id = ?").endswith(
        "id = %s"
    )
    migration = storage.fetchone("SELECT MAX(version) AS version FROM schema_migrations")
    assert int(migration["version"]) >= 4


def test_evidence_hash_chain_detects_tampering():
    entry = {
        "id": "audit-1",
        "project_id": "project-1",
        "evidence_id": "evidence-1",
        "actor_id": "user-1",
        "action": "create",
        "payload": {"title": "Verified proof"},
        "position": 1,
        "created_at": "2026-09-29T00:00:00Z",
        "prev_hash": None,
    }
    entry["entry_hash"] = compute_entry_hash(None, entry)
    assert verify_chain([entry])["valid"] is True

    tampered = {**entry, "payload": {"title": "Changed proof"}}
    result = verify_chain([tampered])
    assert result["valid"] is False
    assert result["brokenPosition"] == 1


def test_rate_limiter_and_encryption_primitives():
    limiter = InMemoryRateLimiter()
    assert limiter.is_allowed("ip", 2, 60)
    assert limiter.is_allowed("ip", 2, 60)
    assert not limiter.is_allowed("ip", 2, 60)

    pytest.importorskip("cryptography")
    secret = "2" * 32
    first = encrypt_token("github-token", secret)
    second = encrypt_token("github-token", secret)
    assert first != second
    assert decrypt_token(first, secret) == "github-token"
    assert decrypt_token(first, "3" * 32) is None


def test_concurrent_authenticated_reads():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            _, token = await _signup(client, "concurrent")
        headers = {"Authorization": f"Bearer {token}"}

        async def read_profile():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                started = time.perf_counter()
                response = await client.get("/api/auth/me", headers=headers)
                return response, (time.perf_counter() - started) * 1000

        results = await asyncio.wait_for(
            asyncio.gather(*[read_profile() for _ in range(20)]),
            timeout=10,
        )
        assert all(response.status_code == 200 for response, _ in results)
        latencies = sorted(elapsed for _, elapsed in results)
        assert latencies[int(len(latencies) * 0.95) - 1] < 250

    _run(run())


def test_global_rate_limit_and_cors(monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_api_max", 1)
    monkeypatch.setattr(settings, "rate_limit_api_window", 60)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            headers = {"X-Forwarded-For": f"198.51.100.{uuid.uuid4().int % 200 + 1}"}
            first = await client.get("/api/public/missing/project", headers=headers)
            second = await client.get("/api/public/missing/project", headers=headers)
            assert first.status_code == 404
            assert second.status_code == 429
            assert second.headers["retry-after"] == "60"
            assert second.headers["x-content-type-options"] == "nosniff"

            preflight = await client.options(
                "/api/projects",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": "GET",
                    "X-Forwarded-For": f"203.0.113.{uuid.uuid4().int % 200 + 1}",
                },
            )
            assert preflight.status_code == 200
            assert (
                preflight.headers["access-control-allow-origin"]
                == "http://localhost:3000"
            )

    _run(run())


def test_admin_requires_explicit_database_privilege():
    email = f"admin-candidate-{uuid.uuid4().hex[:8]}@example.com"

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            signup = await client.post(
                "/api/auth/signup",
                json={
                    "name": "Configured Admin",
                    "email": email,
                    "password": "correct-horse-battery",
                },
            )
            assert signup.status_code == 201
            user_id = storage.fetchone("SELECT id FROM users WHERE email = ?", (email,))["id"]
            from api.routes.auth import create_session
            headers = {"Authorization": f"Bearer {create_session(user_id)}"}
            assert (await client.get("/api/waitlist", headers=headers)).status_code == 403

            storage.execute("UPDATE users SET is_admin = 1 WHERE email = ?", (email,))
            assert (await client.get("/api/waitlist", headers=headers)).status_code == 200

    _run(run())


def test_request_limits_validation_and_stable_cursor_pagination():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            oversized = await client.post(
                "/api/auth/signup",
                content=b"x" * 1_048_577,
                headers={"Content-Type": "application/json"},
            )
            assert oversized.status_code == 413

            _, token = await _signup(client, "validation")
            headers = {"Authorization": f"Bearer {token}"}
            invalid_repo = await client.post(
                "/api/projects",
                headers=headers,
                json={"name": "Unsafe", "repo": "https://user:pass@example.com/repo"},
            )
            assert invalid_repo.status_code == 422

            project = await client.post(
                "/api/projects", headers=headers, json={"name": "Cursor Project"}
            )
            project_id = project.json()["id"]
            bad_time = await client.post(
                f"/api/projects/{project_id}/commits",
                headers=headers,
                json={"hash": "d" * 40, "message": "bad time", "when": "today"},
            )
            assert bad_time.status_code == 422

            when = "2026-09-29T00:00:00Z"
            for char in ("e", "f"):
                created = await client.post(
                    f"/api/projects/{project_id}/commits",
                    headers=headers,
                    json={"hash": char * 40, "message": char, "when": when},
                )
                assert created.status_code == 201

            first = await client.get(
                f"/api/projects/{project_id}/commits?limit=1", headers=headers
            )
            cursor = first.json()["pagination"]["nextBefore"]
            second = await client.get(
                f"/api/projects/{project_id}/commits?limit=1&before={cursor}",
                headers=headers,
            )
            assert first.json()["commits"][0]["id"] != second.json()["commits"][0]["id"]

    _run(run())


def test_publication_flags_and_oauth_state_binding(monkeypatch):
    monkeypatch.setattr("api.routes.github.settings.github_client_id", "client-id")
    monkeypatch.setattr("api.routes.github.settings.github_client_secret", "client-secret")

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, token = await _signup(client, "publish-state")
            headers = {"Authorization": f"Bearer {token}"}
            project = await client.post(
                "/api/projects", headers=headers, json={"name": "Flag Project"}
            )
            project_id = project.json()["id"]
            evidence_ids = []
            for index in range(2):
                item = await client.post(
                    f"/api/projects/{project_id}/evidence",
                    headers=headers,
                    json={
                        "kind": "proof",
                        "title": f"Evidence {index}",
                        "when": "2026-09-29T00:00:00Z",
                    },
                )
                evidence_ids.append(item.json()["id"])

            for selected in evidence_ids:
                published = await client.post(
                    f"/api/projects/{project_id}/publish",
                    headers=headers,
                    json={"evidenceIds": [selected], "slug": "flag-project"},
                )
                assert published.status_code == 200
                rows = storage.fetchall(
                    "SELECT id, publish FROM evidence WHERE project_id = ?", (project_id,)
                )
                flags = {row["id"]: bool(row["publish"]) for row in rows}
                assert sum(flags.values()) == 1
                assert flags[selected]

            public_path = urlparse(published.json()["publicUrl"]).path
            before_edit = await client.get(public_path)
            assert before_edit.status_code == 200
            snapshot_body = before_edit.json()["evidence"][0]["body"]
            edited = await client.patch(
                f"/api/projects/{project_id}/evidence/{evidence_ids[-1]}",
                headers=headers,
                json={"body": "api_key=abcdefghijklmnopqrstuvwxyz123456"},
            )
            assert edited.status_code == 200
            after_edit = await client.get(public_path)
            assert after_edit.json()["evidence"][0]["body"] == snapshot_body
            assert "abcdefghijklmnopqrstuvwxyz" not in after_edit.text

            blocked = await client.post(
                f"/api/projects/{project_id}/publish",
                headers=headers,
                json={"evidenceIds": [evidence_ids[-1]], "slug": "flag-project"},
            )
            assert blocked.status_code == 409
            assert "matched_text_preview" not in blocked.text

            authorize = await client.get(
                "/api/integrations/github/authorize", headers=headers
            )
            assert authorize.status_code == 200
            state = parse_qs(urlparse(authorize.json()["authorizeUrl"]).query)["state"][0]
            payload = verify_token(state, "0123456789abcdef0123456789abcdef")
            assert payload["purpose"] == "github-oauth"

            _, other_token = await _signup(client, "other-state")
            rejected = await client.post(
                "/api/integrations/github/connect",
                headers={"Authorization": f"Bearer {other_token}"},
                json={"code": "not-used", "state": state},
            )
            assert rejected.status_code == 401

            assert (
                await client.delete(
                    f"/api/projects/{project_id}/publish", headers=headers
                )
            ).status_code == 204
            remaining = storage.fetchone(
                "SELECT COUNT(*) AS total FROM evidence WHERE project_id = ? AND publish = 1",
                (project_id,),
            )
            assert int(remaining["total"]) == 0

    _run(run())


def test_per_ip_email_login_throttle_and_reset_cooldown(monkeypatch):
    monkeypatch.setattr("api.routes.auth.settings.login_max_failures", 2)
    monkeypatch.setattr("api.routes.auth.settings.login_lock_minutes", 15)
    monkeypatch.setattr(
        "api.routes.auth.settings.password_reset_min_interval_seconds", 300
    )
    delivered = []

    def capture_email(**kwargs):
        delivered.append(kwargs["reset_token"])
        return True

    monkeypatch.setattr("api.routes.auth.send_password_reset_email", capture_email)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            email, _ = await _signup(client, "lockout")
            for _ in range(2):
                failed = await client.post(
                    "/api/auth/login",
                    json={"email": email, "password": "definitely-wrong"},
                )
                assert failed.status_code == 401
            throttled = await client.post(
                "/api/auth/login",
                json={"email": email, "password": "definitely-wrong"},
            )
            assert throttled.status_code == 429
            # A correct credential remains usable; failures never lock the account.
            assert (await client.post(
                "/api/auth/login", json={"email": email, "password": "correct-horse-battery"}
            )).status_code == 200

            storage.execute(
                "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?",
                (email,),
            )
            first = await client.post("/api/auth/password/reset", json={"email": email})
            second = await client.post("/api/auth/password/reset", json={"email": email})
            assert first.status_code == second.status_code == 200
            assert len(delivered) == 1

    _run(run())
