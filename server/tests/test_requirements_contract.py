"""Contract tests for api-requirements.md alignment (project, evidence, publishing, auth)."""
import asyncio
from uuid import UUID, uuid4

import httpx
import jwt
import pytest

from api.app import app
from config import settings
from storage.instance import storage
from storage.utils import _hash_password_pbkdf2, verify_password, hash_password

PROJECT = {"name": "EduBoost AI", "goal": "Build an AI-powered learning platform",
           "users": "African students and developers", "constraints": "Small team",
           "stage": "Think", "repo": "ada/eduboost-ai"}
STORY = {"problem": "p", "process": "q", "build": "b", "challenges": "c", "result": "r"}


def _client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def _account(client, name="Ada"):
    email = f"req-{uuid4().hex}@example.com"
    r = await client.post("/api/auth/signup", json={
        "name": name, "email": email, "password": "correct-horse-battery"})
    assert r.status_code == 201, r.text
    from api.routes.auth import create_session, get_user_by_id
    user_id = storage.fetchone("SELECT id FROM users WHERE email = ?", (email,))["id"]
    user = storage.user_public(get_user_by_id(user_id), owner=True)
    return {"user": user}, {"Authorization": f"Bearer {create_session(user_id)}"}


async def _project(client, headers, **over):
    r = await client.post("/api/projects", headers=headers, json={**PROJECT, **over})
    assert r.status_code == 201, r.text
    return r.json()["project"]


async def _evidence(client, headers, pid, **over):
    body = {"type": "Screenshot", "text": "Dashboard done", "date": "2026-09-30T10:00:00Z",
            "source": "CleanShot", "provenance": "Human", "stage": "Build", "public": False, **over}
    r = await client.post(f"/api/projects/{pid}/evidence", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["evidence"]


def test_signup_generic_response_login_jwt_and_validation():
    async def run():
        async with _client() as c:
            email = f"check-{uuid4().hex}@example.com"
            created = await c.post("/api/auth/signup", json={"name": "Ada", "email": email, "password": "correct-horse-battery"})
            assert created.status_code == 201 and created.json()["ok"] is True
            assert "token" not in created.json() and "user" not in created.json()
            auth = await c.post("/api/auth/login", json={"email": email, "password": "correct-horse-battery"})
            claims = jwt.decode(auth.json()["token"], settings.secret_key, algorithms=["HS256"])
            assert claims["exp"] - claims["iat"] == 7 * 24 * 3600
            with pytest.raises(jwt.InvalidTokenError):
                jwt.decode(auth.json()["token"], "wrong-secret-wrong-secret-wrong-secret", algorithms=["HS256"])
            bad = await c.post("/api/auth/signup", json={"name": "x", "email": "nope", "password": "short"})
            assert bad.status_code == 400 and "error" in bad.json()
            email = f"dup-{uuid4().hex}@example.com"
            body = {"name": "D", "email": email, "password": "correct-horse-battery"}
            first = await c.post("/api/auth/signup", json=body)
            duplicate = await c.post("/api/auth/signup", json=body)
            assert first.status_code == duplicate.status_code == 201
            assert first.json() == duplicate.json()
    asyncio.run(run())


def test_argon2_for_new_hashes_and_pbkdf2_upgraded_on_login():
    assert hash_password("correct-horse-battery").startswith("$argon2")
    legacy = _hash_password_pbkdf2("correct-horse-battery")
    assert verify_password("correct-horse-battery", legacy)

    async def run():
        async with _client() as c:
            auth, _ = await _account(c)
            email = auth["user"]["email"]
            storage.execute("UPDATE users SET password_hash = ? WHERE email = ?", (legacy, email))
            r = await c.post("/api/auth/login", json={"email": email, "password": "correct-horse-battery"})
            assert r.status_code == 200
            assert storage.fetchone("SELECT password_hash FROM users WHERE email = ?", (email,))[
                "password_hash"].startswith("$argon2")
            bad = await c.post("/api/auth/login", json={"email": email, "password": "wrong-password-123"})
            assert bad.status_code == 401
    asyncio.run(run())


def test_email_change_requires_current_password():
    async def run():
        async with _client() as c:
            _, headers = await _account(c)
            profile = await c.get("/api/auth/me", headers=headers)
            email = f"changed-{uuid4().hex}@example.com"
            missing = await c.patch("/api/auth/me", headers=headers, json={"email": email})
            wrong = await c.patch("/api/auth/me", headers=headers, json={"email": email, "current_password": "wrong-password"})
            assert missing.status_code == wrong.status_code == 401
            changed = await c.patch("/api/auth/me", headers=headers, json={
                "email": email, "current_password": "correct-horse-battery"
            })
            assert changed.status_code == 200 and changed.json()["email"] == email
            assert profile.json()["email"] != changed.json()["email"]
            other_email = f"other-{uuid4().hex}@example.com"
            assert (await c.post("/api/auth/signup", json={
                "name": "Other", "email": other_email, "password": "correct-horse-battery"
            })).status_code == 201
            duplicate = await c.patch("/api/auth/me", headers=headers, json={
                "email": other_email, "current_password": "correct-horse-battery"
            })
            assert duplicate.status_code == 200
            assert duplicate.json()["email"] == email
    asyncio.run(run())


def test_expired_legacy_lockout_is_cleared_on_login():
    async def run():
        async with _client() as c:
            _, headers = await _account(c)
            email = (await c.get("/api/auth/me", headers=headers)).json()["email"]
            storage.execute(
                "UPDATE users SET failed_login_attempts = 9, locked_until = '2000-01-01T00:00:00Z' WHERE email = ?",
                (email,),
            )
            logged_in = await c.post("/api/auth/login", json={
                "email": email, "password": "correct-horse-battery"
            })
            assert logged_in.status_code == 200
            state = storage.fetchone(
                "SELECT failed_login_attempts, locked_until FROM users WHERE email = ?", (email,)
            )
            assert state["failed_login_attempts"] == 0 and state["locked_until"] is None
    asyncio.run(run())


def test_project_contract_persists_all_fields_and_rejects_unknown():
    async def run():
        async with _client() as c:
            _, h = await _account(c)
            p = await _project(c, h)
            UUID(p["id"])
            for k in ("user_id", "goal", "users", "constraints", "stage", "repo", "created_at"):
                assert k in p
            assert p["repo"] == "ada/eduboost-ai" and p["stage"] == "Think"
            patched = await c.patch(f"/api/projects/{p['id']}", headers=h,
                                    json={"stage": "Build", "constraints": "Updated constraints"})
            assert patched.status_code == 200
            got = patched.json()["project"]
            assert got["stage"] == "Build" and got["constraints"] == "Updated constraints"
            assert (await c.patch(f"/api/projects/{p['id']}", headers=h, json={"bogus": 1})).status_code == 422
            assert (await c.patch(f"/api/projects/{p['id']}", headers=h, json={"stage": None})).status_code == 422
            for bad in ({"name": "x"}, {"name": "n" * 61}, {"goal": "short"}, {"stage": "Nope"}, {"repo": "not a repo"}):
                assert (await c.post("/api/projects", headers=h, json={**PROJECT, **bad})).status_code == 422
            listing = await c.get("/api/projects", headers=h)
            assert listing.json()["pagination"]["limit"] == 100
    asyncio.run(run())


def test_evidence_contract_filters_toggle_delete_and_isolation():
    async def run():
        async with _client() as c:
            _, h = await _account(c)
            _, other = await _account(c)
            pid = (await _project(c, h))["id"]
            a = await _evidence(c, h, pid)
            await _evidence(c, h, pid, type="Commit", provenance="AI-assisted", stage="Learn", text="x" * 140)
            assert a["public"] is False and a["type"] == "Screenshot"
            too_long = await c.post(f"/api/projects/{pid}/evidence", headers=h, json={
                "type": "Test", "text": "x" * 141, "date": "2026-09-30T10:00:00Z", "source": "",
                "provenance": "Human", "stage": "Build"})
            assert too_long.status_code == 422
            base = f"/api/projects/{pid}/evidence"
            assert len((await c.get(base, headers=h)).json()["evidence"]) == 2
            assert len((await c.get(base + "?stage=Build", headers=h)).json()["evidence"]) == 1
            assert len((await c.get(base + "?provenance=AI-assisted", headers=h)).json()["evidence"]) == 1
            assert len((await c.get(base + "?type=Screenshot&stage=Build&provenance=Human&public=false", headers=h)).json()["evidence"]) == 1
            assert len((await c.get(base + "?public=true", headers=h)).json()["evidence"]) == 0

            t = f"/api/evidence/{a['id']}/toggle-public"
            assert (await c.patch(t)).status_code == 401
            assert (await c.patch(t, headers=other)).status_code == 404
            assert (await c.patch(t, headers=h)).json()["evidence"]["public"] is True
            assert (await c.patch(t, headers=h)).json()["evidence"]["public"] is False
            assert (await c.delete(f"/api/evidence/{a['id']}", headers=other)).status_code == 404
            gone = await c.delete(f"/api/evidence/{a['id']}", headers=h)
            assert gone.status_code == 204 and gone.content == b""
            assert storage.evidence_chain(pid)["valid"] is True
    asyncio.run(run())


def test_draft_publish_public_and_global_slug_uniqueness():
    async def run():
        async with _client() as c:
            user, h = await _account(c, "Ada Lovelace")
            _, h2 = await _account(c, "Grace")
            p1 = (await _project(c, h))["id"]
            p2 = (await _project(c, h2, name="Other Project"))["id"]

            d = await c.get(f"/api/projects/{p1}/publish/draft", headers=h)
            assert d.status_code == 200 and d.json()["draft"]["story"] is None
            assert d.json()["draft"]["include_blockers"] is True
            body = {"slug": "eduboost-ai", "story": STORY, "include_blockers": True}
            first = (await c.put(f"/api/projects/{p1}/publish/draft", headers=h, json=body)).json()["draft"]
            second = (await c.put(f"/api/projects/{p1}/publish/draft", headers=h, json=body)).json()["draft"]
            assert first["id"] == second["id"]
            assert storage.fetchone("SELECT COUNT(*) AS n FROM publish_drafts WHERE project_id = ?", (p1,))["n"] == 1
            assert (await c.put(f"/api/projects/{p1}/publish/draft", headers=h2, json=body)).status_code == 404

            for bad in ("ab", "Has-Upper", "double--hyphen", "under_score", "x" * 51):
                assert (await c.put(f"/api/projects/{p1}/publish/draft", headers=h,
                                    json={**body, "slug": bad})).status_code == 422

            pub_ev = await _evidence(c, h, p1, text="Public proof")
            await _evidence(c, h, p1, text="Private proof")
            await c.patch(f"/api/evidence/{pub_ev['id']}/toggle-public", headers=h)
            b_open = (await c.post(f"/api/projects/{p1}/blockers", headers=h, json={"title": "Open"})).json()["blocker"]
            b_done = (await c.post(f"/api/projects/{p1}/blockers", headers=h, json={"title": "Solved"})).json()["blocker"]
            await c.post(f"/api/blockers/{b_done['id']}/resolve", headers=h, json={"solution": "fixed"})

            assert (await c.get(f"/api/projects/{p1}/publish/check-slug/eduboost-ai", headers=h)).json() == {"available": True}
            published = await c.post(f"/api/projects/{p1}/publish", headers=h, json=body)
            assert published.status_code == 201, published.text
            snap = published.json()["snapshot"]
            assert snap["author"] == "Ada Lovelace" and snap["story"] == STORY
            assert [e["text"] for e in snap["evidence"]] == ["Public proof"]
            assert [b["title"] for b in snap["blockers"]] == ["Solved"] and b_open["id"] not in str(snap)

            pub = await c.get("/api/public/eduboost-ai")           # no auth
            assert pub.status_code == 200 and pub.json()["snapshot"]["id"] == snap["id"]
            assert (await c.get("/api/public/missing-slug")).json() == {"error": "Project not found"}

            taken = await c.get(f"/api/projects/{p2}/publish/check-slug/eduboost-ai", headers=h2)
            assert taken.json() == {"available": False, "reason": "Slug already taken"}
            clash = await c.post(f"/api/projects/{p2}/publish", headers=h2, json=body)
            assert clash.status_code == 409
            # same project may republish its own slug
            assert (await c.post(f"/api/projects/{p1}/publish", headers=h, json=body)).status_code == 201

            no_blockers = await c.post(f"/api/projects/{p1}/publish", headers=h, json={**body, "include_blockers": False})
            assert no_blockers.json()["snapshot"]["blockers"] == []

            assert (await c.delete(f"/api/projects/{p1}/publish", headers=h)).status_code == 204
            assert (await c.get("/api/public/eduboost-ai")).status_code == 404
    asyncio.run(run())


def test_secret_in_story_blocks_publication_without_echoing_it():
    async def run():
        async with _client() as c:
            _, h = await _account(c)
            pid = (await _project(c, h))["id"]
            secret = "ghp_" + "a1B2c3D4" * 4
            story = {**STORY, "build": f"token {secret}"}
            r = await c.post(f"/api/projects/{pid}/publish", headers=h,
                             json={"slug": "leaky-one", "story": story, "include_blockers": True})
            assert r.status_code == 409 and secret not in r.text
    asyncio.run(run())


def test_journey_list_order_and_updated_at():
    async def run():
        async with _client() as c:
            _, h = await _account(c)
            pid = (await _project(c, h))["id"]
            for title in ("first", "second"):
                await c.post(f"/api/projects/{pid}/tasks", headers=h, json={"title": title, "stage": "Build"})
            desc = (await c.get(f"/api/projects/{pid}/tasks", headers=h)).json()["tasks"]
            asc = (await c.get(f"/api/projects/{pid}/tasks?order=asc", headers=h)).json()["tasks"]
            assert [t["id"] for t in desc] == [t["id"] for t in reversed(asc)]
            assert "updated_at" in desc[0]
    asyncio.run(run())


def test_unexpected_exception_returns_json_envelope(monkeypatch):
    import api.routes.projects as projects_module

    def boom(*_a, **_k):
        raise RuntimeError("secret internal detail")
    async def run():
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            _, h = await _account(c)
            monkeypatch.setattr(projects_module.storage, "fetchall", boom, raising=False)
            r = await c.get("/api/projects", headers=h)
            assert r.status_code == 500
            assert r.headers["content-type"].startswith("application/json")
            assert r.json() == {"error": "Internal server error"}
    asyncio.run(run())
