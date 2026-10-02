"""Publishing endpoints for NUVORA public project pages."""
from typing import Optional, List
import re
import sqlite3
import html
import hashlib
from fastapi import APIRouter, HTTPException, Request, Depends, Response
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from config import settings
from storage.instance import storage
from storage.utils import new_uuid, json_dumps, json_loads, utc_now_iso, slugify
from storage.security import scan_content
from api.routes.auth import require_user
from api.concurrency import offload_database
from api.routes.projects import public_repo

router = APIRouter(tags=["publishing"])

# Request/Response Models
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class Story(BaseModel):
    model_config = ConfigDict(extra="forbid")
    problem: str = Field(max_length=10000)
    process: str = Field(max_length=10000)
    build: str = Field(max_length=10000)
    challenges: str = Field(max_length=10000)
    result: str = Field(max_length=10000)


class _SlugBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(min_length=3, max_length=50)
    include_blockers: bool = True

    @field_validator("slug")
    @classmethod
    def _slug_format(cls, value: str) -> str:
        if not SLUG_RE.match(value):
            raise ValueError("slug must use lowercase letters and digits separated by single hyphens")
        return value


class PublishRequest(_SlugBody):
    story: Story


class DraftRequest(_SlugBody):
    story: Optional[Story] = None


class PublishStatusResponse(BaseModel):
    published: bool
    publishedAt: Optional[str] = None
    slug: Optional[str] = None
    selectedEvidenceCount: int
    publicUrl: Optional[str] = None


class PublicEvidenceResponse(BaseModel):
    id: str
    kind: str
    title: str
    body: str
    source: str
    when: str
    aiAssisted: bool
    verified: bool


class PublicProjectResponse(BaseModel):
    project: dict
    evidence: List[PublicEvidenceResponse]
    publishedAt: str


# Helper functions
def scan_many(parts: List[tuple[str, str]]) -> dict:
    """Scan multiple content parts and aggregate findings."""
    merged = []
    for text, loc in parts:
        result = scan_content(text or "", loc)
        merged.extend(result["findings"])
    
    blocking = [f for f in merged if f.get("severity") == "block"]
    warnings = [f for f in merged if f.get("severity") == "warn"]
    
    if blocking:
        summary = f"BLOCKED: Found {len(blocking)} critical secret(s) and {len(warnings)} warning(s)."
    elif warnings:
        summary = f"PASSED WITH WARNINGS: Found {len(warnings)} potential PII/path items."
    else:
        summary = "CLEAN: No secrets or PII detected. Ready for publication."
    
    return {
        "has_blocking_findings": bool(blocking),
        "findings": merged,
        "summary": summary,
    }


# Authenticated Publishing Endpoints
@router.get("/api/projects/{project_id}/publish/status", response_model=PublishStatusResponse)
@offload_database
def get_publish_status(project_id: str, user: dict = Depends(require_user)):
    """Check publication status."""
    row = storage.fetchone(
        """
        SELECT projects.status, publications.published_at, publications.slug,
               publications.evidence_ids, publications.public_url
        FROM projects
        LEFT JOIN publications ON publications.project_id = projects.id
        WHERE projects.id = ? AND projects.user_id = ?
          AND projects.deleted_at IS NULL
        """,
        (project_id, user["id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    pub = dict(row) if row["slug"] is not None else None
    
    return PublishStatusResponse(
        published=bool(pub) and row["status"] == "published",
        publishedAt=pub["published_at"] if pub else None,
        slug=pub["slug"] if pub else None,
        selectedEvidenceCount=len(json_loads(pub.get("evidence_ids"), [])) if pub else 0,
        publicUrl=pub["public_url"] if pub else None,
    )


def _blocker_out(row) -> dict:
    return {
        "id": row["id"], "project_id": row["project_id"], "title": row["title"],
        "status": row["status"], "attempts": json_loads(row["attempts"], []),
        "solution": row["solution"], "created_at": row["created_at"],
        "resolved_at": row["resolved_at"],
    }


def _default_slug(name: str) -> str:
    slug = slugify(name)[:50].strip("-") or "project"
    if len(slug) < 3:
        slug = f"{slug}-project"
    return slug[:50].strip("-")


def _lock_suffix() -> str:
    return " FOR UPDATE" if storage._postgres_pool is not None else ""


@router.post("/api/projects/{project_id}/publish", status_code=201)
@offload_database
def publish_project(project_id: str, request: PublishRequest, user: dict = Depends(require_user)):
    """Create/replace the immutable public snapshot for a project (E28)."""
    storage.owned_project(project_id, user["id"])

    def transaction(conn):
        project = conn.execute(
            "SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL" + _lock_suffix(),
            (project_id, user["id"]),
        ).fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        project = dict(project)

        evidence_rows = [dict(r) for r in conn.execute(
            "SELECT * FROM evidence WHERE project_id = ? AND publish = 1 "
            "ORDER BY occurred_at DESC, id DESC", (project_id,)).fetchall()]
        if any(r["sensitive"] for r in evidence_rows):
            raise HTTPException(status_code=400, detail="Sensitive evidence cannot be published")
        blocker_rows = [] if not request.include_blockers else [dict(r) for r in conn.execute(
            "SELECT * FROM blockers WHERE project_id = ? AND status = 'resolved' "
            "ORDER BY created_at DESC, id DESC", (project_id,)).fetchall()]

        # Global slug uniqueness, checked inside the write transaction (I02).
        if conn.execute("SELECT 1 FROM publications WHERE slug = ? AND project_id <> ?",
                        (request.slug, project_id)).fetchone():
            raise HTTPException(status_code=409, detail="Slug already taken")
        existing = conn.execute("SELECT id FROM publications WHERE project_id = ?", (project_id,)).fetchone()
        pub_id = existing["id"] if existing else new_uuid()
        now = utc_now_iso()

        evidence_out = [storage.evidence_canonical(r) for r in evidence_rows]
        blockers_out = [_blocker_out(r) for r in blocker_rows]
        story = request.story.model_dump()
        snapshot = {
            "id": pub_id, "slug": request.slug, "project_id": project_id,
            "name": project["name"],
            "goal": project.get("goal") or project.get("summary") or "",
            "users": project.get("audience") or "",
            "stage": project.get("stage") or "Think",
            "repo": public_repo(project.get("repo")),
            "author": user["name"], "published_at": now,
            "story": story, "evidence": evidence_out, "blockers": blockers_out,
        }

        # Scan every user-controlled string that will become public.
        parts = [(v, f"story/{k}") for k, v in story.items()]
        parts += [(snapshot["name"], "project/name"), (snapshot["goal"], "project/goal"),
                  (snapshot["users"], "project/users"), (snapshot["repo"] or "", "project/repo")]
        for e in evidence_out:
            parts += [(e["text"], f"evidence:{e['id']}/text"), (e["source"], f"evidence:{e['id']}/source")]
        for b in blockers_out:
            parts += [(b["title"], f"blocker:{b['id']}/title"), (b["solution"] or "", f"blocker:{b['id']}/solution")]
            parts += [(a, f"blocker:{b['id']}/attempt") for a in b["attempts"]]
        scan = scan_many(parts)
        if scan["has_blocking_findings"]:
            # Findings carry type/location only, never the matched secret value.
            raise HTTPException(status_code=409, detail={"message": "Secret scan blocked publication", "scan": scan})

        snapshot_json = json_dumps(snapshot)
        if len(snapshot_json.encode("utf-8")) > 1_000_000:
            raise HTTPException(status_code=413, detail="Published project is too large")

        public_url = f"{settings.public_base_url.rstrip('/')}/public/{user['username']}/{request.slug}"
        conn.execute(
            """
            INSERT INTO publications (id, project_id, slug, username, evidence_ids, payload,
                                      public_url, view_count, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(project_id) DO UPDATE SET
              slug = excluded.slug, username = excluded.username,
              evidence_ids = excluded.evidence_ids, payload = excluded.payload,
              public_url = excluded.public_url, published_at = excluded.published_at
            """,
            (pub_id, project_id, request.slug, user["username"],
             json_dumps([e["id"] for e in evidence_out]), snapshot_json, public_url, now),
        )
        # projects.slug is the owner's private project slug; the public slug lives on publications.
        conn.execute("UPDATE projects SET status = 'published', updated_at = ? WHERE id = ?", (now, project_id))
        return snapshot

    try:
        snapshot = storage.executemany_tx(transaction)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Slug already taken")
    return {"snapshot": snapshot}


def _draft_out(row) -> dict:
    return {
        "id": row["id"], "project_id": row["project_id"], "slug": row["slug"],
        "story": json_loads(row["story"], None),
        "include_blockers": bool(row["include_blockers"]), "updated_at": row["updated_at"],
    }


@router.get("/api/projects/{project_id}/publish/draft")
@offload_database
def get_publish_draft(project_id: str, user: dict = Depends(require_user)):
    """Return the project's draft. Policy: created lazily on first read with a derived slug
    and `story: null`, so the documented 200 response always holds (E26)."""
    def transaction(conn):
        project = conn.execute(
            "SELECT id, name FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
            (project_id, user["id"]),
        ).fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        now = utc_now_iso()
        conn.execute(
            "INSERT INTO publish_drafts (id, project_id, slug, story, include_blockers, created_at, updated_at) "
            "VALUES (?, ?, ?, NULL, 1, ?, ?) ON CONFLICT(project_id) DO NOTHING",
            (new_uuid(), project_id, _default_slug(project["name"]), now, now),
        )
        return conn.execute("SELECT * FROM publish_drafts WHERE project_id = ?", (project_id,)).fetchone()
    return {"draft": _draft_out(storage.executemany_tx(transaction))}


@router.put("/api/projects/{project_id}/publish/draft")
@offload_database
def save_publish_draft(project_id: str, request: DraftRequest, user: dict = Depends(require_user)):
    """Atomic upsert; UNIQUE(project_id) guarantees one draft per project (E27, I03)."""
    def transaction(conn):
        if not conn.execute(
            "SELECT 1 FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
            (project_id, user["id"]),
        ).fetchone():
            raise HTTPException(status_code=404, detail="Project not found")
        now = utc_now_iso()
        conn.execute(
            """
            INSERT INTO publish_drafts (id, project_id, slug, story, include_blockers, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
              slug = excluded.slug, story = excluded.story,
              include_blockers = excluded.include_blockers, updated_at = excluded.updated_at
            """,
            (new_uuid(), project_id, request.slug,
             json_dumps(request.story.model_dump()) if request.story else None,
             1 if request.include_blockers else 0, now, now),
        )
        return conn.execute("SELECT * FROM publish_drafts WHERE project_id = ?", (project_id,)).fetchone()
    return {"draft": _draft_out(storage.executemany_tx(transaction))}


@router.get("/api/projects/{project_id}/publish/check-slug/{slug}")
@offload_database
def check_slug(project_id: str, slug: str, user: dict = Depends(require_user)):
    """Advisory availability check across all authors (E31). Publishing re-checks atomically."""
    storage.owned_project(project_id, user["id"])
    if not (3 <= len(slug) <= 50 and SLUG_RE.match(slug)):
        return {"available": False, "reason": "Invalid slug format"}
    taken = storage.fetchone(
        "SELECT 1 AS taken FROM publications WHERE slug = ? AND project_id <> ?", (slug, project_id)
    )
    return {"available": False, "reason": "Slug already taken"} if taken else {"available": True}


@router.delete("/api/projects/{project_id}/publish", status_code=204)
@offload_database
def unpublish_project(project_id: str, user: dict = Depends(require_user)):
    """Unpublish public project page."""
    storage.owned_project(project_id, user["id"])
    
    def transaction(conn):
        published_rows = conn.execute(
            "SELECT id FROM evidence WHERE project_id = ? AND publish = 1",
            (project_id,),
        ).fetchall()
        published_ids = [row["id"] for row in published_rows]
        now = utc_now_iso()
        conn.execute(
            "DELETE FROM publications WHERE project_id = ?", (project_id,)
        )
        conn.execute(
            "UPDATE projects SET status = 'draft', updated_at = ? WHERE id = ?",
            (now, project_id),
        )
        conn.execute(
            "UPDATE evidence SET publish = 0, updated_at = ? WHERE project_id = ?",
            (now, project_id),
        )
        if published_ids:
            placeholders = ",".join("?" * len(published_ids))
            updated_rows = conn.execute(
                f"SELECT * FROM evidence WHERE id IN ({placeholders})",
                tuple(published_ids),
            ).fetchall()
        else:
            updated_rows = []
        for updated in updated_rows:
            storage.append_evidence_audit(
                conn,
                project_id=project_id,
                evidence_id=updated["id"],
                actor_id=user["id"],
                action="update",
                payload=dict(updated),
            )

    storage.executemany_tx(transaction)
    
    return None


# Public Viewing Endpoint (No Auth Required)
def _public_payload(username: str, slug: str) -> dict:
    """Get public project data."""
    pub = storage.fetchone(
        "SELECT * FROM publications WHERE username = ? AND slug = ?",
        (username, slug),
    )
    if not pub:
        raise HTTPException(status_code=404, detail="Not found")

    snapshot = json_loads(dict(pub).get("payload"), None)
    if isinstance(snapshot, dict):
        return snapshot
    # Legacy rows without a scanned snapshot fail closed until republished.
    raise HTTPException(status_code=404, detail="Not found")


def _snapshot_headers(payload: dict) -> dict[str, str]:
    digest = hashlib.sha256(json_dumps(payload).encode("utf-8")).hexdigest()
    return {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "ETag": f'"{digest}"',
    }


@router.get("/api/public/{slug}")
@offload_database
def public_snapshot(slug: str, request: Request):
    """Unauthenticated snapshot lookup by globally unique slug (E30)."""
    pub = storage.fetchone(
        "SELECT payload FROM publications WHERE slug = ? ORDER BY published_at DESC LIMIT 1", (slug,)
    )
    payload = json_loads(pub["payload"], None) if pub else None
    if not isinstance(payload, dict) or "project_id" not in payload:
        raise HTTPException(status_code=404, detail="Project not found")
    headers = _snapshot_headers(payload)
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return JSONResponse({"snapshot": payload}, headers=headers)


@router.get("/public/{username}/{slug}")
@offload_database
def public_page(username: str, slug: str, request: Request):
    """View public project page (no auth required)."""
    payload = _public_payload(username, slug)
    cache_headers = _snapshot_headers(payload)
    if request.headers.get("if-none-match") == cache_headers["ETag"]:
        return Response(status_code=304, headers=cache_headers)
    
    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept and "application/json" not in accept.split(",")[0]:
        if "project_id" in payload:  # canonical snapshot
            ev_html = "".join(
                f"<article><h3>{html.escape(str(e.get('type') or ''))}</h3><p>{html.escape(e['text'])}</p></article>"
                for e in payload["evidence"]
            )
            story_html = "".join(
                f"<section><h2>{html.escape(k.title())}</h2><p>{html.escape(v)}</p></section>"
                for k, v in payload["story"].items()
            )
            ev_html = story_html + ev_html
            username = html.escape(payload["author"])
            project_name = html.escape(payload["name"])
            project_summary = html.escape(payload["goal"])
            stack_display = html.escape(payload["users"])
        else:  # legacy snapshot
            ev_html = "".join(
                f"<article><h3>{html.escape(e['kind'])}: {html.escape(e['title'])}</h3><p>{html.escape(e['body'])}</p></article>"
                for e in payload["evidence"]
            )
            username = html.escape(payload['user']['username'])
            project_name = html.escape(payload['project']['name'])
            project_summary = html.escape(payload['project']['summary'] or '')
            stack_display = ' · '.join(html.escape(s) for s in payload['project']['stack'])
        
        page_html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{project_name} — NUVORA</title>
<style>
 body {{ font-family: ui-sans-serif, system-ui; max-width: 720px; margin: 3rem auto; color: #111; }}
 .meta {{ color: #555; }}
 article {{ border-top: 1px solid #eee; padding: 1rem 0; }}
</style></head><body>
<p class="meta">@{username}</p>
<h1>{project_name}</h1>
<p>{project_summary}</p>
<p class="meta">{stack_display}</p>
{ev_html}
</body></html>"""
        return HTMLResponse(
            page_html,
            headers={
                **cache_headers,
                "Content-Security-Policy": (
                    "default-src 'none'; style-src 'unsafe-inline'; "
                    "img-src https: data:; base-uri 'none'; frame-ancestors 'none'"
                ),
            },
        )
    
    return JSONResponse(payload, headers=cache_headers)


@router.get("/api/public/{username}/{slug}")
@offload_database
def public_page_json(username: str, slug: str, request: Request):
    """Get public project data as JSON."""
    payload = _public_payload(username, slug)
    headers = _snapshot_headers(payload)
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return JSONResponse(payload, headers=headers)
