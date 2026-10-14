"""Commit management endpoints for NUVORA."""
from typing import Literal, Optional, List
import sqlite3
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field, field_validator

from src.storage.instance import storage
from src.storage.utils import (
    decode_cursor,
    encode_cursor,
    new_id,
    normalize_iso_timestamp,
    utc_now_iso,
)
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database

router = APIRouter(prefix="/api/projects/{project_id}/commits", tags=["commits"])

# Request/Response Models
class CommitCreate(BaseModel):
    hash: str = Field(pattern=r"^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$")
    message: str = Field(min_length=1, max_length=2000)
    when: str = Field(max_length=64)
    hidden: str = Field(default="", max_length=5000)
    kind: Literal["resource", "snag", "proof", "ai"] = "resource"

    @field_validator("when")
    @classmethod
    def _valid_when(cls, value: str) -> str:
        return normalize_iso_timestamp(value)

    @field_validator("message")
    @classmethod
    def _nonblank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value


class CommitUpdate(BaseModel):
    message: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    when: Optional[str] = Field(default=None, max_length=64)
    hidden: Optional[str] = Field(default=None, max_length=5000)
    kind: Optional[Literal["resource", "snag", "proof", "ai"]] = None

    @field_validator("when")
    @classmethod
    def _valid_when(cls, value: Optional[str]) -> Optional[str]:
        return normalize_iso_timestamp(value) if value is not None else None

    @field_validator("message")
    @classmethod
    def _nonblank_message(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("message cannot be blank")
        return value


class CommitResponse(BaseModel):
    id: str
    projectId: str
    hash: str
    message: str
    author: Optional[str] = None
    when: str
    hidden: str = ""  # Default to empty string
    kind: str = "resource"  # Default to "resource"
    createdAt: str
    updatedAt: str


class CommitListResponse(BaseModel):
    commits: List[CommitResponse]
    pagination: dict


# Endpoints
@router.get("", response_model=CommitListResponse)
@offload_database
def list_commits(
    project_id: str,
    kind: Optional[str] = Query(None, pattern="^(resource|snag|proof|ai)$"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    before: Optional[str] = Query(None, max_length=128),
    user: dict = Depends(require_user),
):
    """Get all commits for a project."""
    storage.owned_project(project_id, user["id"])
    
    count_sql = "SELECT COUNT(*) AS total FROM commits WHERE project_id = ?"
    count_params = (project_id,)
    total: Optional[int] = None
    where = " WHERE project_id = ?"
    list_params: list = [project_id]
    if kind:
        count_sql += " AND kind = ?"
        count_params = (project_id, kind)
        where += " AND kind = ?"
        list_params.append(kind)
    if before:
        total_row = storage.fetchone(count_sql, count_params)
        total = int(total_row["total"] or 0)
        try:
            cursor_time, cursor_id = decode_cursor(before)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid cursor") from exc
        if cursor_id:
            where += " AND (committed_at < ? OR (committed_at = ? AND id < ?))"
            list_params.extend([cursor_time, cursor_time, cursor_id])
        else:
            where += " AND committed_at < ?"
            list_params.append(cursor_time)
        offset = 0
    rows = storage.fetchall(
        "SELECT *, COUNT(*) OVER() AS total_count FROM commits"
        + where
        + " ORDER BY committed_at DESC, id DESC LIMIT ? OFFSET ?",
        tuple(list_params + [limit + 1, offset]),
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    
    if total is None:
        if rows:
            total = int(rows[0]["total_count"])
        elif offset == 0:
            total = 0
        else:
            total_row = storage.fetchone(count_sql, count_params)
            total = int(total_row["total"] or 0)
    return CommitListResponse(
        commits=[storage.commit_row(r, include_hidden=True) for r in rows],
        pagination={
            "limit": limit,
            "offset": offset,
            "total": total,
            "nextBefore": encode_cursor(rows[-1]["committed_at"], rows[-1]["id"])
            if has_more and rows
            else None,
        },
    )


@router.post("", status_code=201, response_model=CommitResponse)
@offload_database
def create_commit(project_id: str, request: CommitCreate, user: dict = Depends(require_user)):
    """Add a new commit to a project."""
    storage.owned_project(project_id, user["id"])
    
    now = utc_now_iso()
    commit_id = new_id("cmt")
    committed_at = request.when or now

    def transaction(conn):
        conn.execute(
            """
            INSERT INTO commits (
              id, project_id, hash, message, author, committed_at, hidden, kind,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                commit_id,
                project_id,
                request.hash.strip().lower(),
                request.message,
                None,
                committed_at,
                request.hidden,
                request.kind,
                now,
                now,
            ),
        )
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?",
            (now, project_id),
        )
        return conn.execute(
            "SELECT * FROM commits WHERE id = ?", (commit_id,)
        ).fetchone()

    try:
        row = storage.executemany_tx(transaction)
    except sqlite3.IntegrityError as exc:
        message = str(exc).lower()
        if "unique" not in message and "duplicate" not in message:
            raise HTTPException(status_code=400, detail="Invalid commit data") from exc
        raise HTTPException(
            status_code=409,
            detail="Commit hash already exists on this project"
        ) from exc
    
    return storage.commit_row(row)


@router.patch("/{commit_hash}", response_model=CommitResponse)
@offload_database
def update_commit(
    project_id: str,
    commit_hash: str,
    request: CommitUpdate,
    user: dict = Depends(require_user),
):
    """Update commit details (especially the hidden context)."""
    storage.owned_project(project_id, user["id"])
    
    row = storage.fetchone(
        "SELECT * FROM commits WHERE project_id = ? AND hash = ?",
        (project_id, commit_hash.lower()),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Commit not found")
    
    data = {}
    if request.message is not None:
        data["message"] = request.message
    if request.hidden is not None:
        data["hidden"] = request.hidden
    if request.kind is not None:
        data["kind"] = request.kind
    if request.when is not None:
        data["committed_at"] = request.when
    
    if not data:
        return storage.commit_row(row)
    
    data["updated_at"] = utc_now_iso()
    sets = ", ".join(f"{k} = ?" for k in data)
    
    storage.execute(
        f"UPDATE commits SET {sets} WHERE id = ?",
        tuple(data.values()) + (row["id"],),
    )
    
    updated = storage.fetchone("SELECT * FROM commits WHERE id = ?", (row["id"],))
    return storage.commit_row(updated)


@router.delete("/{commit_hash}", status_code=204)
@offload_database
def delete_commit(project_id: str, commit_hash: str, user: dict = Depends(require_user)):
    """Delete a commit record."""
    storage.owned_project(project_id, user["id"])
    
    cur = storage.fetchone(
        "SELECT id FROM commits WHERE project_id = ? AND hash = ?",
        (project_id, commit_hash.lower()),
    )
    if not cur:
        raise HTTPException(status_code=404, detail="Commit not found")
    
    storage.execute("DELETE FROM commits WHERE id = ?", (cur["id"],))
    return None
