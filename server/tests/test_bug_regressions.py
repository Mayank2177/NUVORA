import asyncio
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from pydantic import ValidationError
from starlette.requests import Request

from api.app import app
from api.routes.github import _store_synced_commits
from config import Settings, settings
from storage.instance import get_storage, storage
from storage.ratelimit import get_request_ip
from storage.postgres import PostgresConnection
from storage.utils import verify_token


def _run(coroutine):
    return asyncio.run(coroutine)


async def _signup(client: httpx.AsyncClient, prefix: str):
    email = f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"
    response = await client.post(
        "/api/auth/signup",
        json={
            "name": "Regression User",
            "email": email,
            "password": "correct-horse-battery",
        },
    )
    assert response.status_code == 201, response.text
    from api.routes.auth import create_session
    user = get_storage().fetchone("SELECT id FROM users WHERE email = ?", (email,))
    return email, {"Authorization": f"Bearer {create_session(user['id'])}"}


def test_every_project_scoped_route_hides_other_users_resources():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, owner = await _signup(client, "owner-isolation")
            _, attacker = await _signup(client, "attacker-isolation")
            project = await client.post(
                "/api/projects",
                headers=owner,
                json={"name": "Private Project", "repo": "https://github.com/acme/private"},
            )
            project_id = project.json()["id"]
            commit_hash = "1" * 40
            commit = await client.post(
                f"/api/projects/{project_id}/commits",
                headers=owner,
                json={
                    "hash": commit_hash,
                    "message": "private commit",
                    "when": "2026-09-29T00:00:00Z",
                },
            )
            assert commit.status_code == 201
            evidence = await client.post(
                f"/api/projects/{project_id}/evidence",
                headers=owner,
                json={
                    "kind": "proof",
                    "title": "Private proof",
                    "when": "2026-09-29T00:00:00Z",
                },
            )
            evidence_id = evidence.json()["id"]

            attempts = [
                ("GET", f"/api/projects/{project_id}", None),
                ("PATCH", f"/api/projects/{project_id}", {"name": "Stolen"}),
                ("GET", f"/api/projects/{project_id}/commits", None),
                (
                    "POST",
                    f"/api/projects/{project_id}/commits",
                    {
                        "hash": "2" * 40,
                        "message": "injected",
                        "when": "2026-09-29T00:00:00Z",
                    },
                ),
                ("PATCH", f"/api/projects/{project_id}/commits/{commit_hash}", {"message": "changed"}),
                ("DELETE", f"/api/projects/{project_id}/commits/{commit_hash}", None),
                ("GET", f"/api/projects/{project_id}/evidence", None),
                (
                    "POST",
                    f"/api/projects/{project_id}/evidence",
                    {
                        "kind": "proof",
                        "title": "Injected",
                        "when": "2026-09-29T00:00:00Z",
                    },
                ),
                ("GET", f"/api/projects/{project_id}/evidence/{evidence_id}", None),
                ("PATCH", f"/api/projects/{project_id}/evidence/{evidence_id}", {"title": "Changed"}),
                ("DELETE", f"/api/projects/{project_id}/evidence/{evidence_id}", None),
                ("POST", f"/api/projects/{project_id}/evidence/scan", {"evidenceIds": [evidence_id]}),
                ("GET", f"/api/projects/{project_id}/publish/status", None),
                (
                    "POST",
                    f"/api/projects/{project_id}/publish",
                    {"evidenceIds": [evidence_id], "slug": "stolen"},
                ),
                ("DELETE", f"/api/projects/{project_id}/publish", None),
                ("GET", f"/api/projects/{project_id}/analytics", None),
                ("GET", f"/api/projects/{project_id}/continuity/guidance", None),
                ("GET", f"/api/projects/{project_id}/continuity/skills", None),
                ("GET", f"/api/projects/{project_id}/continuity/evidence-chain", None),
                ("GET", f"/api/projects/{project_id}/continuity/project.md", None),
                ("POST", f"/api/projects/{project_id}/sync", {}),
                ("DELETE", f"/api/projects/{project_id}", None),
            ]
            for method, path, payload in attempts:
                response = await client.request(
                    method, path, headers=attacker, json=payload
                )
                assert response.status_code == 404, (method, path, response.text)

            mcp = await client.post(
                "/v1/mcp",
                headers=attacker,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {
                        "name": "nuvora.project.evidence_chain",
                        "arguments": {"projectId": project_id},
                    },
                },
            )
            assert mcp.status_code == 200
            assert mcp.json()["error"]["code"] == -32001
            assert "Project not found" in mcp.json()["error"]["message"]

            assert (
                await client.get(f"/api/projects/{project_id}", headers=owner)
            ).status_code == 200

    _run(run())


def test_failed_evidence_audit_rolls_back_the_evidence(monkeypatch):
    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit storage failed")

    monkeypatch.setattr(storage, "append_evidence_audit", fail_audit, raising=False)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            _, headers = await _signup(client, "rollback-audit")
            project = await client.post(
                "/api/projects", headers=headers, json={"name": "Rollback Project"}
            )
            project_id = project.json()["id"]
            response = await client.post(
                f"/api/projects/{project_id}/evidence",
                headers=headers,
                json={
                    "kind": "proof",
                    "title": "Must roll back",
                    "when": "2026-09-29T00:00:00Z",
                },
            )
            assert response.status_code == 500
            count = storage.fetchone(
                "SELECT COUNT(*) AS total FROM evidence WHERE project_id = ?",
                (project_id,),
            )
            assert int(count["total"]) == 0

    _run(run())


def test_publication_slug_conflict_rolls_back_project_and_flags():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "publish-rollback")
            records = []
            for index in range(2):
                project = await client.post(
                    "/api/projects",
                    headers=headers,
                    json={"name": f"Publication {index}"},
                )
                project_id = project.json()["id"]
                evidence = await client.post(
                    f"/api/projects/{project_id}/evidence",
                    headers=headers,
                    json={
                        "kind": "proof",
                        "title": f"Proof {index}",
                        "when": "2026-09-29T00:00:00Z",
                    },
                )
                records.append((project_id, evidence.json()["id"]))

            first = await client.post(
                f"/api/projects/{records[0][0]}/publish",
                headers=headers,
                json={"evidenceIds": [records[0][1]], "slug": "same-slug"},
            )
            assert first.status_code == 200
            conflict = await client.post(
                f"/api/projects/{records[1][0]}/publish",
                headers=headers,
                json={"evidenceIds": [records[1][1]], "slug": "same-slug"},
            )
            assert conflict.status_code == 409
            project_row = storage.fetchone(
                "SELECT status FROM projects WHERE id = ?", (records[1][0],)
            )
            evidence_row = storage.fetchone(
                "SELECT publish FROM evidence WHERE id = ?", (records[1][1],)
            )
            assert project_row["status"] == "draft"
            assert int(evidence_row["publish"]) == 0

    _run(run())


def test_password_reset_delivery_failure_and_replay(monkeypatch):
    delivered = []

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            email, headers = await _signup(client, "reset-replay")
            monkeypatch.setattr(
                "api.routes.auth.send_password_reset_email", lambda **kwargs: False
            )
            failed = await client.post("/api/auth/password/reset", json={"email": email})
            assert failed.status_code == 200
            pending = storage.fetchone(
                "SELECT COUNT(*) AS total FROM password_resets WHERE user_id = "
                "(SELECT id FROM users WHERE email = ?)",
                (email,),
            )
            assert int(pending["total"]) == 0

            def capture(**kwargs):
                delivered.append(kwargs["reset_token"])
                return True

            monkeypatch.setattr("api.routes.auth.send_password_reset_email", capture)
            sent = await client.post("/api/auth/password/reset", json={"email": email})
            assert sent.status_code == 200
            assert len(delivered) == 1
            payload = {"token": delivered[0], "password": "new-correct-horse-battery"}
            assert (await client.post("/api/auth/password/confirm", json=payload)).status_code == 200
            assert (await client.post("/api/auth/password/confirm", json=payload)).status_code == 400
            assert (await client.get("/api/auth/me", headers=headers)).status_code == 401

    _run(run())


def test_signup_retries_a_transient_username_conflict(monkeypatch):
    original = storage.executemany_tx
    calls = 0

    def conflict_once(callback):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise sqlite3.IntegrityError("UNIQUE constraint failed: users.username")
        return original(callback)

    monkeypatch.setattr(storage, "executemany_tx", conflict_once)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/auth/signup",
                json={
                    "name": "Concurrent Signup",
                    "email": f"retry-{uuid.uuid4().hex}@example.com",
                    "password": "correct-horse-battery",
                },
            )
            assert response.status_code == 201, response.text
            assert calls == 2

    _run(run())


def test_authenticated_profile_uses_one_database_lookup(monkeypatch):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "auth-query-count")
            actual_storage = get_storage()
            original = actual_storage.fetchone
            calls = 0

            def counted_fetchone(*args, **kwargs):
                nonlocal calls
                calls += 1
                return original(*args, **kwargs)

            monkeypatch.setattr(actual_storage, "fetchone", counted_fetchone)
            response = await client.get("/api/auth/me", headers=headers)
            assert response.status_code == 200
            assert calls == 1

    _run(run())


def test_project_detail_and_analytics_use_bounded_query_counts(monkeypatch):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "bounded-project-queries")
            created = await client.post(
                "/api/projects", headers=headers, json={"name": "Query Budget"}
            )
            project_id = created.json()["id"]
            actual_storage = get_storage()
            original = actual_storage.fetchone
            calls = 0

            def counted_fetchone(*args, **kwargs):
                nonlocal calls
                calls += 1
                return original(*args, **kwargs)

            monkeypatch.setattr(actual_storage, "fetchone", counted_fetchone)
            detail = await client.get(f"/api/projects/{project_id}", headers=headers)
            assert detail.status_code == 200
            assert calls == 2  # authentication + one project overview query

            calls = 0
            analytics = await client.get(
                f"/api/projects/{project_id}/analytics", headers=headers
            )
            assert analytics.status_code == 200
            assert calls == 2  # authentication + one aggregate query

    _run(run())


def test_list_endpoints_avoid_separate_count_queries(monkeypatch):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            email, headers = await _signup(client, "bounded-list-queries")
            created = await client.post(
                "/api/projects", headers=headers, json={"name": "List Query Budget"}
            )
            project_id = created.json()["id"]
            actual_storage = get_storage()
            original_fetchone = actual_storage.fetchone
            original_fetchall = actual_storage.fetchall
            calls = 0

            def counted_fetchone(*args, **kwargs):
                nonlocal calls
                calls += 1
                return original_fetchone(*args, **kwargs)

            def counted_fetchall(*args, **kwargs):
                nonlocal calls
                calls += 1
                return original_fetchall(*args, **kwargs)

            monkeypatch.setattr(actual_storage, "fetchone", counted_fetchone)
            monkeypatch.setattr(actual_storage, "fetchall", counted_fetchall)

            projects = await client.get("/api/projects?limit=20", headers=headers)
            assert projects.status_code == 200
            assert calls == 2  # authentication + window-count listing

            calls = 0
            commits = await client.get(
                f"/api/projects/{project_id}/commits", headers=headers
            )
            assert commits.status_code == 200
            assert calls == 3  # authentication + ownership + listing

            calls = 0
            evidence = await client.get(
                f"/api/projects/{project_id}/evidence", headers=headers
            )
            assert evidence.status_code == 200
            assert calls == 3  # authentication + ownership + listing

            actual_storage.execute(
                "UPDATE users SET is_admin = 1 WHERE email = ?", (email,)
            )
            calls = 0
            waitlist = await client.get("/api/waitlist", headers=headers)
            assert waitlist.status_code == 200
            assert calls == 2  # authentication + window-count listing

    _run(run())


def test_oauth_state_is_random_and_upstream_failure_is_safe(monkeypatch):
    monkeypatch.setattr(settings, "github_client_id", "client-id")
    monkeypatch.setattr(settings, "github_client_secret", "client-secret-value-long")

    class FailingGitHubClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, **kwargs):
            return httpx.Response(503, request=httpx.Request("POST", url))

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            email, headers = await _signup(client, "oauth-failure")
            first = await client.get("/api/integrations/github/authorize", headers=headers)
            second = await client.get("/api/integrations/github/authorize", headers=headers)
            first_state = parse_qs(urlparse(first.json()["authorizeUrl"]).query)["state"][0]
            second_state = parse_qs(urlparse(second.json()["authorizeUrl"]).query)["state"][0]
            assert first_state != second_state
            first_payload = verify_token(first_state, settings.secret_key)
            second_payload = verify_token(second_state, settings.secret_key)
            assert first_payload["nonce"] != second_payload["nonce"]

            monkeypatch.setattr("api.routes.github.httpx.AsyncClient", FailingGitHubClient)
            failed = await client.post(
                "/api/integrations/github/connect",
                headers=headers,
                json={"code": "bad-code", "state": first_state},
            )
            assert failed.status_code == 502
            user = storage.fetchone("SELECT github_id FROM users WHERE email = ?", (email,))
            assert user["github_id"] is None

    _run(run())


def test_malformed_github_author_objects_do_not_abort_commit_sync():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "github-shape")
            project = await client.post(
                "/api/projects", headers=headers, json={"name": "GitHub Shapes"}
            )
            project_id = project.json()["id"]
            inserted = _store_synced_commits(
                project_id,
                [
                    {
                        "sha": "a" * 40,
                        "author": "unexpected-string",
                        "commit": {
                            "author": {
                                "name": None,
                                "date": "not-an-iso-timestamp",
                            },
                            "message": "valid despite malformed author",
                        },
                    }
                ],
            )
            assert inserted == 1
            row = storage.fetchone(
                "SELECT author, message, committed_at FROM commits WHERE project_id = ? AND hash = ?",
                (project_id, "a" * 40),
            )
            assert row["author"] is None
            assert row["message"] == "valid despite malformed author"
            assert row["committed_at"].endswith("Z")

    _run(run())


def test_signed_webhook_rejects_non_string_repository_url():
    async def run():
        import hashlib
        import hmac
        import json

        body = json.dumps(
            {
                "repository": {"html_url": ["https://github.com/acme/repo"]},
                "commits": [{"id": "a" * 40}],
            }
        ).encode()
        signature = "sha256=" + hmac.new(
            settings.github_webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/webhooks/github",
                content=body,
                headers={
                    "X-GitHub-Event": "push",
                    "X-Hub-Signature-256": signature,
                    "Content-Type": "application/json",
                },
            )
            assert response.status_code == 400
            assert response.json()["error"] == "Invalid repository URL in payload"

    _run(run())


def test_production_configuration_rejects_placeholder_credentials():
    base = {
        "_env_file": None,
        "environment": "production",
        "database_url": "postgresql://user:pass@db/nuvora",
        "secret_key": "0123456789abcdef0123456789abcdef",
        "encryption_key": "fedcba9876543210fedcba9876543210",
        "public_base_url": "https://api.example.com",
        "frontend_base_url": "https://app.example.com",
        "cors_origins": ["https://app.example.com"],
        "github_redirect_uri": "https://app.example.com/api/auth/github/callback",
        "github_client_id": "real-client-id",
        "github_client_secret": "real-client-secret-value",
        "github_webhook_secret": "webhook-9876543210-abcdef-123456789",
        "rate_limit_redis_url": "rediss://cache.example.com/0",
        "smtp_host": "smtp.example.com",
        "smtp_user": "real-smtp-user",
        "smtp_password": "real-smtp-password",
        "smtp_from_email": "noreply@example.com",
    }
    for field, placeholder in (
        ("github_client_id", "replace-with-github-client-id"),
        ("github_client_secret", "change-me-github-client-secret"),
        ("smtp_user", "your-smtp-user"),
        ("smtp_password", "placeholder-smtp-password"),
    ):
        with pytest.raises(ValidationError):
            Settings(**{**base, field: placeholder})


def test_scan_rejects_missing_evidence_instead_of_returning_partial_success():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "scan-completeness")
            project = await client.post(
                "/api/projects", headers=headers, json={"name": "Scan Completeness"}
            )
            response = await client.post(
                f"/api/projects/{project.json()['id']}/evidence/scan",
                headers=headers,
                json={"evidenceIds": ["evd-does-not-exist"]},
            )
            assert response.status_code == 400
            assert "do not belong" in response.json()["error"]

    _run(run())


def test_forwarded_ip_uses_nearest_untrusted_hop(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_ips", ["127.0.0.1", "10.0.0.2"])
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [
                (b"x-forwarded-for", b"192.0.2.99, 198.51.100.20, 10.0.0.2")
            ],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )
    assert get_request_ip(request) == "198.51.100.20"


def test_redis_rate_limit_reuses_one_atomic_script(monkeypatch):
    import storage.ratelimit as ratelimit

    class FakeRedis:
        def __init__(self):
            self.registered = 0
            self.calls = 0

        def register_script(self, source):
            assert "INCR" in source and "EXPIRE" in source
            self.registered += 1

            async def execute(*, keys, args):
                assert len(keys) == 1
                assert args == [61]
                self.calls += 1
                return self.calls

            return execute

    fake = FakeRedis()
    monkeypatch.setattr(ratelimit, "_redis_client", fake)
    monkeypatch.setattr(ratelimit, "_redis_rate_limit_script", None)

    async def run():
        assert await ratelimit.check_rate_limit("atomic", 2, 60)
        assert await ratelimit.check_rate_limit("atomic", 2, 60)
        assert not await ratelimit.check_rate_limit("atomic", 2, 60)
        assert fake.registered == 1

    _run(run())


def test_crud_routes_reject_malformed_and_missing_resources():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "malformed")
            assert (
                await client.post("/api/projects", headers=headers, json={"name": "   "})
            ).status_code == 422
            assert (
                await client.post(
                    "/api/projects",
                    headers=headers,
                    json={
                        "name": "Leaky repository",
                        "repo": "https://example.com/repo?token=secret",
                    },
                )
            ).status_code == 422
            assert (
                await client.get("/api/projects?page=0", headers=headers)
            ).status_code == 422

            missing_project = "prj-does-not-exist"
            for method, path, payload in (
                ("GET", f"/api/projects/{missing_project}", None),
                ("PATCH", f"/api/projects/{missing_project}", {"name": "Missing"}),
                ("DELETE", f"/api/projects/{missing_project}", None),
                ("GET", f"/api/projects/{missing_project}/commits", None),
                ("GET", f"/api/projects/{missing_project}/evidence", None),
                ("GET", f"/api/projects/{missing_project}/analytics", None),
            ):
                response = await client.request(method, path, headers=headers, json=payload)
                assert response.status_code == 404, (method, path, response.text)

            project = await client.post(
                "/api/projects", headers=headers, json={"name": "Validation Project"}
            )
            project_id = project.json()["id"]
            for path in (
                "/api/projects?before=not-a-date",
                f"/api/projects/{project_id}/commits?before=not-a-date",
                f"/api/projects/{project_id}/evidence?before=not-a-date",
            ):
                response = await client.get(path, headers=headers)
                assert response.status_code == 400, (path, response.text)
            for payload in (
                {"hash": "short", "message": "bad", "when": "2026-09-29T00:00:00Z"},
                {"hash": "a" * 40, "message": "   ", "when": "2026-09-29T00:00:00Z"},
                {"hash": "a" * 40, "message": "bad", "when": "not-a-date"},
                {
                    "hash": "a" * 40,
                    "message": "bad",
                    "when": "2026-09-29T00:00:00Z",
                    "kind": "invalid",
                },
            ):
                response = await client.post(
                    f"/api/projects/{project_id}/commits", headers=headers, json=payload
                )
                assert response.status_code == 422, response.text

            missing_hash = "f" * 40
            assert (
                await client.patch(
                    f"/api/projects/{project_id}/commits/{missing_hash}",
                    headers=headers,
                    json={"message": "missing"},
                )
            ).status_code == 404
            assert (
                await client.delete(
                    f"/api/projects/{project_id}/commits/{missing_hash}", headers=headers
                )
            ).status_code == 404

            for payload in (
                {"kind": "invalid", "title": "Bad", "when": "2026-09-29T00:00:00Z"},
                {"kind": "proof", "title": "   ", "when": "2026-09-29T00:00:00Z"},
                {"kind": "proof", "title": "Bad", "when": "not-a-date"},
            ):
                response = await client.post(
                    f"/api/projects/{project_id}/evidence", headers=headers, json=payload
                )
                assert response.status_code == 422, response.text

            missing_evidence = "evd-does-not-exist"
            assert (
                await client.get(
                    f"/api/projects/{project_id}/evidence/{missing_evidence}",
                    headers=headers,
                )
            ).status_code == 404
            assert (
                await client.patch(
                    f"/api/projects/{project_id}/evidence/{missing_evidence}",
                    headers=headers,
                    json={"title": "Missing"},
                )
            ).status_code == 404
            assert (
                await client.delete(
                    f"/api/projects/{project_id}/evidence/{missing_evidence}",
                    headers=headers,
                )
            ).status_code == 404
            assert (
                await client.post(
                    f"/api/projects/{project_id}/publish",
                    headers=headers,
                    json={"evidenceIds": [], "slug": "empty"},
                )
            ).status_code == 422
            assert (
                await client.post(
                    "/api/waitlist", json={"email": "not-an-email", "tools": "none"}
                )
            ).status_code == 422
            assert (
                await client.post(
                    "/api/auth/password/confirm",
                    json={"token": "x" * 20, "password": "correct-horse-battery"},
                )
            ).status_code == 400

            mcp = await client.post(
                "/v1/mcp",
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {"name": "nuvora.project.guidance", "arguments": {}},
                },
            )
            assert mcp.status_code == 200
            assert mcp.json()["error"]["code"] == -32602

    _run(run())


def test_concurrent_sqlite_audit_appends_preserve_hash_chain():
    async def create_project():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "audit-concurrency")
            project = await client.post(
                "/api/projects", headers=headers, json={"name": "Concurrent Audit"}
            )
            me = await client.get("/api/auth/me", headers=headers)
            return project.json()["id"], me.json()["id"]

    project_id, user_id = _run(create_project())

    def append(index: int):
        def transaction(conn):
            storage.append_evidence_audit(
                conn,
                project_id=project_id,
                evidence_id=None,
                actor_id=user_id,
                action="baseline",
                payload={"index": index},
            )

        storage.executemany_tx(transaction)

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(append, range(24)))

    chain = storage.evidence_chain(project_id)
    assert chain["valid"] is True
    assert chain["totalEntries"] == 24
    assert [entry["position"] for entry in chain["entries"]] == list(range(1, 25))


def test_publish_and_unpublish_changes_are_recorded_in_evidence_chain():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, headers = await _signup(client, "publish-audit")
            project = await client.post(
                "/api/projects", headers=headers, json={"name": "Publish Audit"}
            )
            project_id = project.json()["id"]
            evidence = await client.post(
                f"/api/projects/{project_id}/evidence",
                headers=headers,
                json={
                    "kind": "proof",
                    "title": "Audited proof",
                    "when": "2026-09-29T00:00:00Z",
                },
            )
            evidence_id = evidence.json()["id"]
            assert (
                await client.post(
                    f"/api/projects/{project_id}/publish",
                    headers=headers,
                    json={"evidenceIds": [evidence_id], "slug": "publish-audit"},
                )
            ).status_code == 200
            assert (
                await client.delete(
                    f"/api/projects/{project_id}/publish", headers=headers
                )
            ).status_code == 204
            chain = await client.get(
                f"/api/projects/{project_id}/continuity/evidence-chain",
                headers=headers,
            )
            assert chain.status_code == 200
            assert chain.json()["valid"] is True
            assert [entry["action"] for entry in chain.json()["entries"]] == [
                "create",
                "update",
                "update",
            ]

    _run(run())


def test_postgres_adapter_wraps_multi_statement_work_in_explicit_transaction():
    events = []

    class Transaction:
        def __enter__(self):
            events.append("begin")

        def __exit__(self, exc_type, exc, traceback):
            events.append("rollback" if exc_type else "commit")
            return False

    class Connection:
        def transaction(self):
            return Transaction()

        def execute(self, sql, params=()):
            events.append((sql, params))
            return self

    class Pool:
        connection = Connection()

        def getconn(self):
            return self.connection

        def putconn(self, connection):
            assert connection is self.connection
            events.append("returned")

    connection = PostgresConnection(Pool())
    with connection:
        connection.execute("UPDATE projects SET name = ?", ("Fast",))
    connection.close()
    assert events == [
        "begin",
        ("UPDATE projects SET name = %s", ("Fast",)),
        "commit",
        "returned",
    ]


def test_filtered_pagination_queries_use_composite_indexes():
    actual_storage = get_storage()
    plans = {
        "idx_projects_user_status_updated": actual_storage.fetchall(
            """
            EXPLAIN QUERY PLAN
            SELECT * FROM projects
            WHERE user_id = ? AND status = ? AND deleted_at IS NULL
            ORDER BY updated_at DESC, id DESC LIMIT 20
            """,
            ("user", "draft"),
        ),
        "idx_commits_project_kind_time": actual_storage.fetchall(
            """
            EXPLAIN QUERY PLAN
            SELECT * FROM commits
            WHERE project_id = ? AND kind = ?
            ORDER BY committed_at DESC, id DESC LIMIT 50
            """,
            ("project", "proof"),
        ),
        "idx_evidence_project_kind_time": actual_storage.fetchall(
            """
            EXPLAIN QUERY PLAN
            SELECT * FROM evidence
            WHERE project_id = ? AND kind = ?
            ORDER BY occurred_at DESC, id DESC LIMIT 50
            """,
            ("project", "proof"),
        ),
    }
    for index_name, rows in plans.items():
        details = " ".join(row["detail"] for row in rows)
        assert index_name in details
