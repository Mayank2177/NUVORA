import asyncio

import httpx
import pytest
from fastapi import HTTPException

from api.app import app
from api.routes.github import _parse_github_repo
from config import settings
from storage.instance import storage
from storage.utils import sign_token, verify_token


def test_core_api_contract_and_security():
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            signup = await client.post("/api/auth/signup", json={
                "name": "Admin",
                "email": "admin@nuvora.dev",
                "password": "correct-horse-battery",
            })
            assert signup.status_code == 201
            from api.routes.auth import create_session
            user_id = storage.fetchone("SELECT id FROM users WHERE email = ?", ("admin@nuvora.dev",))["id"]
            headers = {"Authorization": f"Bearer {create_session(user_id)}"}

            # Admin access is provisioned explicitly; owning an address listed in
            # configuration must never grant privileges by itself.
            storage.execute(
                "UPDATE users SET is_admin = 1 WHERE email = ?",
                ("admin@nuvora.dev",),
            )

            me = await client.get("/api/auth/me", headers=headers)
            assert me.status_code == 200
            assert me.json()["email"] == "admin@nuvora.dev"

            project_data = {
                "name": "next.js app",
                "repo": "https://github.com/acme/next.js",
                "summary": "Test project",
                "stack": ["Next.js"],
                "span": "one week",
            }
            project = await client.post("/api/projects", headers=headers, json=project_data)
            assert project.status_code == 201
            assert "createdAt" in project.json()
            project_id = project.json()["id"]

            invalid = await client.post(
                f"/api/projects/{project_id}/commits",
                headers=headers,
                json={"hash": "a" * 40, "message": "x", "when": "2026-09-29T00:00:00Z", "hidden": "", "kind": "bad"},
            )
            assert invalid.status_code == 422

            evidence = await client.post(
                f"/api/projects/{project_id}/evidence",
                headers=headers,
                json={"kind": "proof", "title": "Tests pass", "when": "2026-09-29T00:00:00Z"},
            )
            assert evidence.status_code == 201
            assert evidence.json()["source"] == ""

            published = await client.post(
                f"/api/projects/{project_id}/publish",
                headers=headers,
                json={"evidenceIds": [evidence.json()["id"]], "slug": "next-js"},
            )
            assert published.status_code == 200

            listing = await client.get("/api/projects?limit=1", headers=headers)
            assert listing.status_code == 200
            assert listing.json()["pagination"]["total"] == 1

            await client.delete(f"/api/projects/{project_id}", headers=headers)
            recreated = await client.post("/api/projects", headers=headers, json=project_data)
            assert recreated.status_code == 201

            waitlist = await client.get("/api/waitlist", headers=headers)
            assert waitlist.status_code == 200

            reset = await client.post("/api/auth/password/reset", json={"email": "admin@nuvora.dev"})
            assert reset.status_code == 200
            assert "dev_token" not in reset.json()

            webhook = await client.post("/api/webhooks/github", content=b"{}")
            assert webhook.status_code == 401
            assert webhook.json()["error"] == "Missing signature"

            assert (await client.post("/api/auth/logout", headers=headers)).status_code == 204
            assert (await client.get("/api/auth/me", headers=headers)).status_code == 401

    asyncio.run(run())


def test_token_requires_expiry_and_repo_names_keep_dots():
    secret = "0123456789abcdef0123456789abcdef"
    token = sign_token({"sub": "usr-test"}, secret)
    with pytest.raises(HTTPException):
        verify_token(token, secret)
    assert _parse_github_repo("https://github.com/acme/next.js.git") == ("acme", "next.js")


def test_webhook_without_secret_returns_503(monkeypatch):
    async def run():
        monkeypatch.setattr(settings, "github_webhook_secret", "")
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            response = await client.post("/api/webhooks/github", content=b"{}")
            assert response.status_code == 503
            assert response.json()["error"] == "GitHub webhook is not configured"

    asyncio.run(run())
