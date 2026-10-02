"""Project management endpoints for NUVORA."""
import re
from typing import Annotated, Optional, List, Any, Literal
import sqlite3
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from storage.instance import storage
from storage.utils import (
    decode_cursor,
    encode_cursor,
    json_dumps,
    new_uuid,
    normalize_github_repo_url,
    utc_now_iso,
)
from api.routes.auth import require_user
from schemas.journey import Stage
from api.concurrency import offload_database

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _canonical_repo(value: str) -> str:
    if not value:
        return ""
    try:
        return normalize_github_repo_url(value)
    except ValueError:
        cleaned = value.strip()
        parsed = urlparse(cleaned)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "repo must be a public HTTP(S) or GitHub repository URL"
            )
        return cleaned

_OWNER_REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _store_repo(value: Optional[str]) -> Optional[str]:
    """Accept `owner/repo` (canonical) or a repository URL; store the URL form the
    GitHub integration matches on."""
    if value is None or not value.strip():
        return None
    value = value.strip()
    if _OWNER_REPO.match(value):
        return normalize_github_repo_url(f"https://github.com/{value}")
    return _canonical_repo(value)


def public_repo(stored: Optional[str]) -> Optional[str]:
    """API form: `owner/repo` for GitHub repositories, None when unset."""
    if not stored:
        return None
    m = re.fullmatch(r"https://github\.com/([^/]+)/([^/]+)", stored)
    return f"{m.group(1)}/{m.group(2)}" if m else stored


class _ProjectBody(BaseModel):
    model_config = ConfigDict(extra="forbid")  # unknown fields are rejected, never silently dropped

    @field_validator("repo", check_fields=False)
    @classmethod
    def _valid_repo(cls, value):
        if value is None:
            return None
        try:
            return _store_repo(value)
        except ValueError as exc:
            raise ValueError("repo must be in owner/repo format") from exc


class ProjectCreate(_ProjectBody):
    name: str = Field(min_length=2, max_length=60)
    goal: str = Field(min_length=10, max_length=5000)
    users: str = Field(min_length=1, max_length=2000)
    constraints: Optional[str] = Field(default=None, max_length=5000)
    stage: Stage = "Think"
    repo: Optional[str] = Field(default=None, max_length=500)
    # Optional legacy presentation fields (kept for existing clients)
    stack: List[Annotated[str, Field(min_length=1, max_length=100)]] = Field(default_factory=list, max_length=50)
    span: str = Field(default="", max_length=200)

    @field_validator("name")
    @classmethod
    def _nonblank_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("name must contain at least 2 characters")
        return value


class ProjectUpdate(_ProjectBody):
    name: Optional[str] = Field(default=None, min_length=2, max_length=60)
    goal: Optional[str] = Field(default=None, min_length=10, max_length=5000)
    users: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    constraints: Optional[str] = Field(default=None, max_length=5000)
    stage: Optional[Stage] = None
    repo: Optional[str] = Field(default=None, max_length=500)
    stack: Optional[List[Annotated[str, Field(min_length=1, max_length=100)]]] = Field(default=None, max_length=50)
    span: Optional[str] = Field(default=None, max_length=200)

    @field_validator("name")
    @classmethod
    def _nonblank_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if len(value) < 2:
            raise ValueError("name must contain at least 2 characters")
        return value


class CommitSummary(BaseModel):
    hash: str
    message: str
    when: str
    hidden: str = ""  # Default to empty string
    kind: str = "resource"  # Default to "resource"


class ProjectResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    name: str
    goal: str = ""
    users: str = ""
    constraints: Optional[str] = None
    stage: str = "Think"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    repo: Optional[str]
    summary: str
    stack: List[str]
    span: str
    slug: str
    status: Literal["draft", "published", "archived"]
    commitCount: Optional[int] = None
    evidenceCount: Optional[int] = None
    commits: Optional[List[CommitSummary]] = None
    createdAt: str
    updatedAt: Optional[str] = None
    published: bool = False
    publicUrl: Optional[str] = None


class ProjectEnvelope(BaseModel):
    project: ProjectResponse


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]
    pagination: dict


def _out(row) -> dict:
    data = storage.hydrate_project(row)
    data["repo"] = public_repo(data.get("repo"))
    return data


# Endpoints
@router.get("", response_model=ProjectListResponse)
@offload_database
def list_projects(
    page: int = Query(1, ge=1, le=10000),
    limit: int = Query(100, ge=1, le=100),
    sort: Literal["recent", "name", "oldest"] = "recent",
    q: Optional[str] = Query(None, max_length=200),
    status: Optional[Literal["draft", "published", "archived"]] = None,
    before: Optional[str] = Query(None, max_length=128),
    user: dict = Depends(require_user),
):
    """List all projects for authenticated user."""
    
    where = " FROM projects WHERE user_id = ? AND deleted_at IS NULL"
    conditions = ""
    params: List[Any] = [user["id"]]
    
    if status:
        conditions += " AND status = ?"
        params.append(status)
    
    if q:
        conditions += " AND (name LIKE ? OR summary LIKE ? OR repo LIKE ?)"
        like = f"%{q}%"
        params.extend([like, like, like])
    
    total: Optional[int] = None
    list_conditions = conditions
    list_params = list(params)
    if before:
        total_row = storage.fetchone(
            "SELECT COUNT(*) AS total" + where + conditions, tuple(params)
        )
        total = int(total_row["total"]) if total_row else 0
        if sort != "recent":
            raise HTTPException(
                status_code=400,
                detail="The before cursor is supported only with recent sorting",
            )
        try:
            cursor_time, cursor_id = decode_cursor(before)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid cursor") from exc
        if cursor_id:
            list_conditions += (
                " AND (projects.updated_at < ? OR "
                "(projects.updated_at = ? AND projects.id < ?))"
            )
            list_params.extend([cursor_time, cursor_time, cursor_id])
        else:
            list_conditions += " AND projects.updated_at < ?"
            list_params.append(cursor_time)
    list_from = (
        " FROM projects LEFT JOIN publications ON publications.project_id = projects.id"
        " WHERE projects.user_id = ? AND projects.deleted_at IS NULL"
    )
    order_by = {
        "recent": "projects.updated_at DESC, projects.id DESC",
        "name": "projects.name ASC, projects.id ASC",
        "oldest": "projects.created_at ASC, projects.id ASC",
    }[sort]
    sql = (
        "SELECT projects.*, "
        "COUNT(*) OVER() AS total_count, "
        "(SELECT COUNT(*) FROM commits WHERE commits.project_id = projects.id) AS commit_count, "
        "(SELECT COUNT(*) FROM evidence WHERE evidence.project_id = projects.id) AS evidence_count, "
        "publications.public_url AS publication_url "
        + list_from
        + list_conditions
        + f" ORDER BY {order_by} LIMIT ? OFFSET ?"
    )
    offset = 0 if before else (page - 1) * limit
    list_params.extend([limit + 1, offset])
    
    rows = storage.fetchall(sql, tuple(list_params))
    has_more = len(rows) > limit
    rows = rows[:limit]
    if total is None:
        if rows:
            total = int(rows[0]["total_count"])
        elif offset == 0:
            total = 0
        else:
            total_row = storage.fetchone(
                "SELECT COUNT(*) AS total" + where + conditions, tuple(params)
            )
            total = int(total_row["total"]) if total_row else 0
    
    return ProjectListResponse(
        projects=[_out(r) for r in rows],
        pagination={
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": (total + limit - 1) // limit if total else 0,
            "nextBefore": encode_cursor(rows[-1]["updated_at"], rows[-1]["id"])
            if has_more and rows
            else None,
        }
    )


@router.post("", status_code=201, response_model=ProjectEnvelope)
@offload_database
def create_project(request: ProjectCreate, user: dict = Depends(require_user)):
    """Create a new project."""
    now = utc_now_iso()
    project_id = new_uuid()
    for _ in range(5):
        slug = storage.unique_slug(user["id"], request.name)
        try:
            storage.execute(
                """
                INSERT INTO projects (
                  id, user_id, name, slug, repo, summary, stack, span, status,
                  goal, audience, constraints, stage, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
                """,
                (
                    project_id, user["id"], request.name, slug, request.repo or "",
                    request.goal, json_dumps(request.stack or []), request.span,
                    request.goal, request.users, request.constraints, request.stage, now, now,
                ),
            )
            break
        except sqlite3.IntegrityError as exc:
            if "slug" not in str(exc).lower():
                raise HTTPException(status_code=409, detail="Project could not be created") from exc
    else:
        raise HTTPException(status_code=409, detail="Project slug conflict")
    return {"project": _out(storage.project_overview(project_id, user["id"]))}


@router.get("/{project_id}", response_model=ProjectResponse)
@offload_database
def get_project(project_id: str, user: dict = Depends(require_user)):
    """Get a single project by ID."""
    row = storage.project_overview(project_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return _out(row)


@router.patch("/{project_id}", response_model=ProjectEnvelope)
@offload_database
def update_project(project_id: str, request: ProjectUpdate, user: dict = Depends(require_user)):
    """Update supplied project fields. Omitted = unchanged; explicit null clears only nullable fields."""
    storage.owned_project(project_id, user["id"])
    sent = request.model_fields_set
    nullable = {"constraints", "repo"}
    for name in sent:
        if getattr(request, name) is None and name not in nullable:
            raise HTTPException(status_code=422, detail=f"{name} cannot be null")

    columns = {"name": "name", "goal": "goal", "users": "audience", "constraints": "constraints",
               "stage": "stage", "repo": "repo", "span": "span"}
    data: dict[str, Any] = {}
    for field, column in columns.items():
        if field in sent:
            value = getattr(request, field)
            data[column] = "" if (field == "repo" and value is None) else value
    if "goal" in sent:
        data["summary"] = request.goal          # keep legacy summary in sync
    if "stack" in sent:
        data["stack"] = json_dumps(request.stack)

    if data:
        data["updated_at"] = utc_now_iso()
        sets = ", ".join(f"{k} = ?" for k in data)
        storage.execute(
            f"UPDATE projects SET {sets} WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
            tuple(data.values()) + (project_id, user["id"]),
        )
    return {"project": _out(storage.project_overview(project_id, user["id"]))}


@router.delete("/{project_id}", status_code=204)
@offload_database
def delete_project(project_id: str, user: dict = Depends(require_user)):
    """Delete a project and all associated data."""
    storage.owned_project(project_id, user["id"])
    
    def transaction(conn):
        # Delete all child resources through foreign-key cascades, rather than
        # leaving personal data behind after a frontend deletion request.
        result = conn.execute(
            "DELETE FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
            (project_id, user["id"]),
        )
        if result.rowcount != 1:
            raise HTTPException(status_code=404, detail="Project not found")

    storage.executemany_tx(transaction)
    
    return None
