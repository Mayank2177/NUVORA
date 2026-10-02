"""Regression coverage for the first frontend contract alignment phase."""
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from uuid import UUID, uuid4

import httpx
import pytest
from PIL import Image

from api.app import app
from api.routes.journey import resolve_blocker
from schemas.journey import BlockerResolve
from storage.db import Storage
from storage.instance import storage
from storage.security import redact_text, scan_content
from storage.utils import utc_now_iso


async def _account(client):
    email = f"journey-{uuid4().hex}@example.com"
    response = await client.post("/api/auth/signup", json={
        "name": "Contract User", "email": email,
        "password": "correct-horse-battery",
    })
    assert response.status_code == 201, response.text
    from api.routes.auth import create_session
    user = storage.fetchone("SELECT id FROM users WHERE email = ?", (email,))
    return {"name": "Contract User"}, {"Authorization": f"Bearer {create_session(user['id'])}"}


async def _setup(client):
    user, headers = await _account(client)
    response = await client.post("/api/projects", headers=headers, json={
        "name": "Journey contract", "goal": "Exercise the journey contract end to end",
        "users": "Test users", "stage": "Think",
    })
    assert response.status_code == 201, response.text
    return user, headers, response.json()["project"]["id"]


RESOURCES = [
    ("blockers", "blocker", {"title": "Authentication fails"}),
    ("tasks", "task", {"title": "Practice an exercise", "stage": "Practice"}),
    ("designs", "design", {"title": "Layout", "kind": "Wireframe", "tool": "Balsamiq",
                          "url": "https://example.com/layout", "note": "First draft", "stage": "Prototype"}),
    ("decisions", "decision", {"decision": "Use PostgreSQL", "reason": "Shared persistence", "stage": "Build"}),
]


@pytest.mark.parametrize("plural,singular,payload", RESOURCES)
def test_journey_crud_and_owner_isolation(plural, singular, payload):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            _, headers, project_id = await _setup(client)
            _, other = await _account(client)
            path = f"/api/projects/{project_id}/{plural}"
            assert (await client.get(path)).status_code == 401
            assert (await client.post(path, json=payload)).status_code == 401
            assert (await client.get(path, headers=other)).status_code == 404
            assert (await client.post(path, headers=other, json=payload)).status_code == 404
            assert (await client.post(f"/api/projects/missing/{plural}", headers=headers, json=payload)).status_code == 404
            created = await client.post(path, headers=headers, json=payload)
            assert created.status_code == 201, created.text
            obj = created.json()[singular]
            UUID(obj["id"])
            assert obj["project_id"] == project_id
            assert obj["created_at"].endswith("Z")
            for key, value in payload.items():
                assert obj[key] == value
            second = await client.post(path, headers=headers, json=payload)
            assert second.status_code == 201
            listing = await client.get(path + "?limit=1", headers=headers)
            assert len(listing.json()[plural]) == 1
            assert listing.json()["pagination"] == {"limit": 1, "offset": 0, "total": 2, "hasMore": True}
            page2 = await client.get(path + "?limit=1&offset=1", headers=headers)
            assert page2.json()[plural][0]["id"] != listing.json()[plural][0]["id"]
            empty = await client.get(path + "?offset=10", headers=headers)
            assert empty.json()[plural] == []
            assert empty.json()["pagination"]["total"] == 2
            assert (await client.get(path + "?limit=101", headers=headers)).status_code == 422
            resource_path = f"/api/{plural}/{obj['id']}"
            assert (await client.delete(resource_path)).status_code == 401
            assert (await client.delete(resource_path, headers=other)).status_code == 404
            assert (await client.delete(resource_path, headers=headers)).status_code == 204
            assert (await client.delete(resource_path, headers=headers)).status_code == 404
            assert (await client.delete(f"/api/projects/{project_id}", headers=headers)).status_code == 204
            assert storage.fetchone(f"SELECT COUNT(*) AS total FROM {plural} WHERE project_id = ?", (project_id,))["total"] == 0
    asyncio.run(run())


def test_blocker_resolution_retries_and_audit():
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            _, headers, project_id = await _setup(client)
            _, other = await _account(client)
            created = await client.post(f"/api/projects/{project_id}/blockers", headers=headers, json={"title": "OAuth error"})
            blocker = created.json()["blocker"]
            assert blocker["status"] == "open" and blocker["attempts"] == []
            assert blocker["solution"] is None and blocker["resolved_at"] is None
            path = f"/api/blockers/{blocker['id']}"
            for suffix, payload in (("attempts", {"attempt": "Checked settings"}), ("resolve", {"solution": "Fixed callback"})):
                assert (await client.post(path + "/" + suffix, json=payload)).status_code == 401
                assert (await client.post(path + "/" + suffix, headers=other, json=payload)).status_code == 404
            attempt = await client.post(path + "/attempts", headers=headers, json={"attempt": "Checked settings"})
            assert attempt.json()["blocker"]["attempts"] == ["Checked settings"]
            resolved = await client.post(path + "/resolve", headers=headers, json={"solution": "Fixed callback"})
            assert resolved.status_code == 200, resolved.text
            result = resolved.json()
            assert result["blocker"]["status"] == "resolved"
            assert result["blocker"]["resolved_at"]
            assert result["evidence"]["type"] == "Blocker resolved"
            assert result["evidence"]["provenance"] == "Human"
            assert result["evidence"]["stage"] == "Get unstuck"
            assert result["evidence"]["public"] is False
            again = await client.post(path + "/resolve", headers=headers, json={"solution": "Fixed callback"})
            assert again.json() == result
            assert (await client.post(path + "/resolve", headers=headers, json={"solution": "Other fix"})).status_code == 409
            assert (await client.post(path + "/attempts", headers=headers, json={"attempt": "Too late"})).status_code == 409
            chain = storage.evidence_chain(project_id)
            assert chain["valid"] and chain["totalEntries"] == 1
            # Deleting a blocker retains its evidence; deleting the project cascades it.
            assert (await client.delete(path, headers=headers)).status_code == 204
            assert storage.fetchone("SELECT id FROM evidence WHERE id = ?", (result["evidence"]["id"],))
            assert (await client.delete(f"/api/projects/{project_id}", headers=headers)).status_code == 204
            for table in ("evidence", "evidence_audit", "blockers"):
                assert storage.fetchone(f"SELECT COUNT(*) AS total FROM {table} WHERE project_id = ?", (project_id,))["total"] == 0
    asyncio.run(run())


def test_resolution_rollback_and_concurrent_retry(monkeypatch):
    async def setup():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            user, headers, project_id = await _setup(client)
            blocker = (await client.post(f"/api/projects/{project_id}/blockers", headers=headers, json={"title": "Broken deployment"})).json()["blocker"]
            return user, project_id, blocker["id"]
    user, project_id, blocker_id = asyncio.run(setup())
    from storage.instance import get_storage
    real_storage = get_storage()
    monkeypatch.setattr("api.routes.journey.storage", real_storage)
    original = real_storage.append_evidence_audit
    def fail_audit(*args, **kwargs):
        raise RuntimeError("Simulated audit failure")
    # Patch the shared storage object, not the lazy proxy.
    monkeypatch.setattr(get_storage(), "append_evidence_audit", fail_audit)
    request = BlockerResolve(solution="Fixed deployment")
    with pytest.raises(RuntimeError, match="audit failure"):
        resolve_blocker.__wrapped__(blocker_id, request, user)
    assert storage.fetchone("SELECT status FROM blockers WHERE id = ?", (blocker_id,))["status"] == "open"
    assert storage.fetchone("SELECT COUNT(*) AS total FROM evidence WHERE project_id = ?", (project_id,))["total"] == 0
    monkeypatch.setattr(get_storage(), "append_evidence_audit", original)
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: resolve_blocker.__wrapped__(blocker_id, request, user), range(12)))
    assert len({result["evidence"]["id"] for result in results}) == 1
    assert storage.evidence_chain(project_id)["totalEntries"] == 1


def test_task_toggle_and_nonsequential_stages():
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            _, headers, project_id = await _setup(client)
            _, other = await _account(client)
            stages = ["Contribution", "Think", "Opportunity", "Demonstrate", "Publish", "Document", "Validate", "Build", "Prototype", "Get unstuck", "Practice", "Learn"]
            for stage in stages:
                response = await client.post(f"/api/projects/{project_id}/tasks", headers=headers, json={"title": "Work", "stage": stage})
                assert response.status_code == 201, response.text
                assert response.json()["task"]["stage"] == stage
            task = response.json()["task"]
            assert task["done"] is False and task["done_at"] is None
            path = f"/api/tasks/{task['id']}/toggle"
            assert (await client.patch(path)).status_code == 401
            assert (await client.patch(path, headers=other)).status_code == 404
            on = await client.patch(path, headers=headers)
            assert on.json()["task"]["done"] is True and on.json()["task"]["done_at"]
            off = await client.patch(path, headers=headers)
            assert off.json()["task"]["done"] is False and off.json()["task"]["done_at"] is None
    asyncio.run(run())


@pytest.mark.parametrize("plural,payload", [
    ("blockers", {"title": " "}), ("blockers", {"title": "x" * 141}),
    ("tasks", {"title": "Work", "stage": "Unknown"}),
    ("tasks", {"title": "Work", "stage": "Build", "done": True}),
    ("decisions", {"decision": "x" * 121, "reason": "Reason", "stage": "Build"}),
    ("decisions", {"decision": "Choice", "reason": "x" * 301, "stage": "Build"}),
    ("designs", {"title": "Design", "kind": "Other", "tool": "Other", "url": "javascript:alert(1)", "stage": "Prototype"}),
    ("designs", {"title": "Design", "kind": "Other", "tool": "Other", "url": "https://user:pass@example.com", "stage": "Prototype"}),
    ("designs", {"title": "Design", "kind": "Unknown", "tool": "Other", "url": "https://example.com", "stage": "Prototype"}),
])
def test_invalid_journey_requests(plural, payload):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            _, headers, project_id = await _setup(client)
            response = await client.post(f"/api/projects/{project_id}/{plural}", headers=headers, json=payload)
            assert response.status_code == 422, response.text
            assert response.json()["error"] == "Validation error"
            assert all("input" not in detail for detail in response.json()["details"])
    asyncio.run(run())


def _jpeg(width, height):
    buffer = BytesIO()
    Image.new("RGB", (width, height), color="red").save(buffer, "JPEG", quality=100)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def test_design_image_validation():
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            _, headers, project_id = await _setup(client)
            path = f"/api/projects/{project_id}/designs"
            payload = dict(RESOURCES[2][2])
            payload["image"] = _jpeg(100, 100)
            response = await client.post(path, headers=headers, json=payload)
            assert response.status_code == 201, response.text
            image = response.json()["design"]["image"]
            assert image != payload["image"]  # normalized to quality 80
            with Image.open(BytesIO(base64.b64decode(image.split(",", 1)[1]))) as decoded:
                assert decoded.size == (100, 100) and decoded.format == "JPEG"
            for invalid in ("data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,%%%", "data:image/jpeg;base64,YWJj", _jpeg(1201, 1)):
                response = await client.post(path, headers=headers, json={**payload, "image": invalid})
                assert response.status_code == 422, response.text
    asyncio.run(run())


@pytest.mark.parametrize("secret", ["password=shortsecret", "secret: abc", "api_key = \"123\"", "sk-" + "a" * 16, "ghp_" + "a" * 20, "AKIA" + "A" * 16])
def test_requirement_secret_patterns(secret):
    assert scan_content(secret)["has_blocking_findings"]
    redacted, count = redact_text(secret)
    assert count > 0 and secret not in redacted


def test_password_reset_alias_and_put_cors():
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            reset = await client.post("/api/auth/password-reset-request", json={"email": f"absent-{uuid4().hex}@example.com"})
            assert reset.status_code == 200
            assert reset.json()["message"] == "If an account exists, a password reset email has been sent"
            response = await client.options("/api/projects/example/publish/draft", headers={
                "Origin": "http://localhost:3000", "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization,content-type",
            })
            assert response.status_code == 200
            assert "PUT" in response.headers["access-control-allow-methods"]
            missing = await client.get("/api/not-an-endpoint")
            assert missing.json()["error"] == "Not Found"
    asyncio.run(run())


def test_additive_migration_is_repeatable_and_preserves_rows(tmp_path):
    database = tmp_path / "migration.sqlite3"
    first = Storage(database)
    # Recreate a pre-migration evidence layout, then reopen through the migrator.
    first.execute("ALTER TABLE evidence DROP COLUMN type")
    first.execute("ALTER TABLE evidence DROP COLUMN provenance")
    first.execute("ALTER TABLE evidence DROP COLUMN stage")
    now = utc_now_iso()
    first.execute(
        "INSERT INTO users (id, email, name, username, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ("old-user", "migration@example.com", "Existing User", "existing", now, now),
    )
    first.execute(
        "INSERT INTO projects (id, user_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("old-project", "old-user", "Existing Project", "existing-project", now, now),
    )
    first.execute(
        "INSERT INTO evidence (id, project_id, kind, title, occurred_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("old-evidence", "old-project", "proof", "Existing evidence", now, now, now),
    )
    payload = dict(first.fetchone("SELECT * FROM evidence WHERE id = ?", ("old-evidence",)))
    first.executemany_tx(lambda conn: first.append_evidence_audit(
        conn, project_id="old-project", evidence_id="old-evidence", actor_id="old-user",
        action="baseline", payload=payload,
    ))
    old_chain = first.evidence_chain("old-project")
    first.close()
    for _ in range(2):
        reopened = Storage(database)
        names = {row["name"] for row in reopened.fetchall("PRAGMA table_info(evidence)")}
        assert {"type", "provenance", "stage"} <= names
        assert reopened.fetchone("SELECT COUNT(*) AS total FROM schema_migrations WHERE version = 6")["total"] == 1
        assert reopened.fetchone("SELECT title FROM evidence WHERE id = ?", ("old-evidence",))["title"] == "Existing evidence"
        assert reopened.evidence_chain("old-project") == old_chain
        reopened.close()
