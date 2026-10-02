"""Owner-scoped blockers, tasks, designs and decisions for the frontend API."""
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from api.concurrency import offload_database
from api.routes.auth import require_user
from schemas.journey import (
    BlockerAttempt, BlockerCreate, BlockerResolve, DecisionCreate, DesignCreate, TaskCreate,
    normalize_design_image,
)
from storage.instance import storage
from storage.utils import json_dumps, json_loads, utc_now_iso

router = APIRouter(prefix="/api", tags=["journey"])
Resource = Literal["blockers", "tasks", "designs", "decisions"]


def _project(conn, project_id: str, user_id: str):
    sql = "SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
    if storage._postgres_pool is not None:
        sql += " FOR UPDATE"
    row = conn.execute(sql, (project_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "Project not found")
    return row


def _resource(conn, table: Resource, resource_id: str, user_id: str):
    # Table names are internal literals, never request input.
    sql = (
        f"SELECT r.* FROM {table} r JOIN projects p ON p.id = r.project_id "
        "WHERE r.id = ? AND p.user_id = ? AND p.deleted_at IS NULL"
    )
    row = conn.execute(sql, (resource_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "Resource not found")
    # Always lock parents before children, as deletion and audit append do.
    _project(conn, row["project_id"], user_id)
    if storage._postgres_pool is not None:
        row = conn.execute(sql + " FOR UPDATE OF r", (resource_id, user_id)).fetchone()
        if not row:
            raise HTTPException(404, "Resource not found")
    return row


def _serialize(table: Resource, row) -> dict[str, Any]:
    result = dict(row)
    result.pop("total", None)
    if table == "tasks":
        result["done"] = bool(result["done"])
    elif table == "blockers":
        result["attempts"] = json_loads(result["attempts"], [])
        result.pop("resolution_evidence_id", None)
    return result


def _list(table: Resource, project_id: str, user_id: str, limit: int, offset: int, order: str = "desc"):
    direction = "ASC" if order == "asc" else "DESC"
    storage.owned_project(project_id, user_id)
    # Ownership is repeated in the data query to protect against concurrent deletion.
    rows = storage.fetchall(
        f"SELECT r.*, COUNT(*) OVER() AS total FROM {table} r "
        "JOIN projects p ON p.id = r.project_id WHERE p.id = ? AND p.user_id = ? "
        f"AND p.deleted_at IS NULL ORDER BY r.created_at {direction}, r.id {direction} LIMIT ? OFFSET ?",
        (project_id, user_id, limit, offset),
    )
    total = int(rows[0]["total"]) if rows else int(storage.fetchone(
        f"SELECT COUNT(*) AS total FROM {table} r JOIN projects p ON p.id = r.project_id "
        "WHERE p.id = ? AND p.user_id = ? AND p.deleted_at IS NULL",
        (project_id, user_id),
    )["total"])
    return {
        table: [_serialize(table, row) for row in rows],
        "pagination": {"limit": limit, "offset": offset, "total": total,
                       "hasMore": offset + len(rows) < total},
    }


def _create(table: Resource, project_id: str, user_id: str, fields: dict):
    now = utc_now_iso()
    data = {"id": str(uuid4()), "project_id": project_id, **fields, "created_at": now, "updated_at": now}
    def transaction(conn):
        _project(conn, project_id, user_id)
        columns = ", ".join(data)
        placeholders = ", ".join("?" for _ in data)
        conn.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", tuple(data.values()))
        return _serialize(table, conn.execute(f"SELECT * FROM {table} WHERE id = ?", (data["id"],)).fetchone())
    return storage.executemany_tx(transaction)


def _delete(table: Resource, resource_id: str, user_id: str):
    def transaction(conn):
        _resource(conn, table, resource_id, user_id)
        conn.execute(f"DELETE FROM {table} WHERE id = ?", (resource_id,))
    storage.executemany_tx(transaction)


@router.get("/projects/{project_id}/blockers")
@offload_database
def list_blockers(project_id: str, limit: int = Query(100, ge=1, le=100),
                  offset: int = Query(0, ge=0, le=10000), order: Literal["asc", "desc"] = "desc",
    user: dict = Depends(require_user)):
    return _list("blockers", project_id, user["id"], limit, offset, order)


@router.post("/projects/{project_id}/blockers", status_code=201)
@offload_database
def create_blocker(project_id: str, request: BlockerCreate, user: dict = Depends(require_user)):
    return {"blocker": _create("blockers", project_id, user["id"], request.model_dump())}


@router.post("/blockers/{blocker_id}/attempts")
@offload_database
def add_attempt(blocker_id: str, request: BlockerAttempt, user: dict = Depends(require_user)):
    def transaction(conn):
        row = _resource(conn, "blockers", blocker_id, user["id"])
        if row["status"] != "open":
            raise HTTPException(409, "Cannot add an attempt to a resolved blocker")
        attempts = json_loads(row["attempts"], [])
        if len(attempts) >= 100:
            raise HTTPException(409, "A blocker can have at most 100 attempts")
        attempts.append(request.attempt)
        conn.execute("UPDATE blockers SET attempts = ?, updated_at = ? WHERE id = ?",
                     (json_dumps(attempts), utc_now_iso(), blocker_id))
        return _serialize("blockers", conn.execute("SELECT * FROM blockers WHERE id = ?", (blocker_id,)).fetchone())
    return {"blocker": storage.executemany_tx(transaction)}


def _resolution_evidence(row) -> dict:
    return {
        "id": row["id"], "project_id": row["project_id"], "type": row["type"],
        "text": row["title"], "date": row["occurred_at"], "source": row["source"],
        "provenance": row["provenance"], "stage": row["stage"],
        "public": bool(row["publish"]), "created_at": row["created_at"],
    }


@router.post("/blockers/{blocker_id}/resolve")
@offload_database
def resolve_blocker(blocker_id: str, request: BlockerResolve, user: dict = Depends(require_user)):
    def transaction(conn):
        row = _resource(conn, "blockers", blocker_id, user["id"])
        if row["status"] == "resolved":
            if row["solution"] != request.solution:
                raise HTTPException(409, "Blocker has already been resolved with a different solution")
            evidence = conn.execute("SELECT * FROM evidence WHERE id = ?", (row["resolution_evidence_id"],)).fetchone()
            if not evidence:
                raise HTTPException(409, "The resolution evidence has been deleted")
            return {"blocker": _serialize("blockers", row), "evidence": _resolution_evidence(evidence)}
        now, evidence_id = utc_now_iso(), str(uuid4())
        conn.execute(
            "INSERT INTO evidence (id, project_id, kind, title, body, source, occurred_at, "
            "created_at, updated_at, type, provenance, stage) "
            "VALUES (?, ?, 'snag', ?, ?, ?, ?, ?, ?, 'Blocker resolved', 'Human', 'Get unstuck')",
            (evidence_id, row["project_id"], row["title"], request.solution,
             f"blocker:{blocker_id}", now, now, now),
        )
        evidence = conn.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        storage.append_evidence_audit(
            conn, project_id=row["project_id"], evidence_id=evidence_id,
            actor_id=user["id"], action="create", payload=dict(evidence),
        )
        conn.execute(
            "UPDATE blockers SET status = 'resolved', solution = ?, resolved_at = ?, "
            "resolution_evidence_id = ?, updated_at = ? WHERE id = ?",
            (request.solution, now, evidence_id, now, blocker_id),
        )
        updated = conn.execute("SELECT * FROM blockers WHERE id = ?", (blocker_id,)).fetchone()
        return {"blocker": _serialize("blockers", updated), "evidence": _resolution_evidence(evidence)}
    return storage.executemany_tx(transaction)


@router.delete("/blockers/{blocker_id}", status_code=204)
@offload_database
def delete_blocker(blocker_id: str, user: dict = Depends(require_user)):
    _delete("blockers", blocker_id, user["id"])


@router.get("/projects/{project_id}/tasks")
@offload_database
def list_tasks(project_id: str, limit: int = Query(100, ge=1, le=100),
               offset: int = Query(0, ge=0, le=10000), order: Literal["asc", "desc"] = "desc",
    user: dict = Depends(require_user)):
    return _list("tasks", project_id, user["id"], limit, offset, order)


@router.post("/projects/{project_id}/tasks", status_code=201)
@offload_database
def create_task(project_id: str, request: TaskCreate, user: dict = Depends(require_user)):
    return {"task": _create("tasks", project_id, user["id"], request.model_dump())}


@router.patch("/tasks/{task_id}/toggle")
@offload_database
def toggle_task(task_id: str, user: dict = Depends(require_user)):
    def transaction(conn):
        row = _resource(conn, "tasks", task_id, user["id"])
        done = not bool(row["done"])
        now = utc_now_iso()
        conn.execute("UPDATE tasks SET done = ?, done_at = ?, updated_at = ? WHERE id = ?",
                     (int(done), now if done else None, now, task_id))
        return _serialize("tasks", conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
    return {"task": storage.executemany_tx(transaction)}


@router.delete("/tasks/{task_id}", status_code=204)
@offload_database
def delete_task(task_id: str, user: dict = Depends(require_user)):
    _delete("tasks", task_id, user["id"])


@router.get("/projects/{project_id}/designs")
@offload_database
def list_designs(project_id: str, limit: int = Query(100, ge=1, le=100),
                 offset: int = Query(0, ge=0, le=10000), order: Literal["asc", "desc"] = "desc",
    user: dict = Depends(require_user)):
    return _list("designs", project_id, user["id"], limit, offset, order)


@router.post("/projects/{project_id}/designs", status_code=201)
@offload_database
def create_design(project_id: str, request: DesignCreate, user: dict = Depends(require_user)):
    # Reject unowned projects before doing potentially costly image decoding.
    storage.owned_project(project_id, user["id"])
    fields = request.model_dump()
    try:
        fields["image"] = normalize_design_image(fields["image"])
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"design": _create("designs", project_id, user["id"], fields)}


@router.delete("/designs/{design_id}", status_code=204)
@offload_database
def delete_design(design_id: str, user: dict = Depends(require_user)):
    _delete("designs", design_id, user["id"])


@router.get("/projects/{project_id}/decisions")
@offload_database
def list_decisions(project_id: str, limit: int = Query(100, ge=1, le=100),
                   offset: int = Query(0, ge=0, le=10000), order: Literal["asc", "desc"] = "desc",
    user: dict = Depends(require_user)):
    return _list("decisions", project_id, user["id"], limit, offset, order)


@router.post("/projects/{project_id}/decisions", status_code=201)
@offload_database
def create_decision(project_id: str, request: DecisionCreate, user: dict = Depends(require_user)):
    return {"decision": _create("decisions", project_id, user["id"], request.model_dump())}


@router.delete("/decisions/{decision_id}", status_code=204)
@offload_database
def delete_decision(decision_id: str, user: dict = Depends(require_user)):
    _delete("decisions", decision_id, user["id"])