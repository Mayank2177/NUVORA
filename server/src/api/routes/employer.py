"""Employer dashboard and task management endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.api.concurrency import offload_database, run_blocking
from src.api.routes import marketplace_tasks, offers
from src.api.routes.auth import require_user
from src.storage.instance import storage
from src.storage.utils import json_loads

router = APIRouter(prefix="/api/employer", tags=["employer"])


def _require_employer(user: dict) -> None:
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Employer account required")


@router.get("/dashboard")
@offload_database
def employer_dashboard(user: dict = Depends(require_user)):
    _require_employer(user)
    counts = storage.fetchone(
        """SELECT COUNT(*) AS total,
                  SUM(CASE WHEN status IN ('draft','open') THEN 1 ELSE 0 END) AS active,
                  SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) AS in_review,
                  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
           FROM marketplace_tasks WHERE employer_id = ?""",
        (user["id"],),
    )
    recent = storage.fetchall(
        "SELECT * FROM marketplace_tasks WHERE employer_id = ? ORDER BY updated_at DESC LIMIT 5",
        (user["id"],),
    )
    return {"stats": {key: int(counts[key] or 0) for key in ("total", "active", "in_review", "completed")},
            "recent": [marketplace_tasks._serialize_task(row) for row in recent]}


@router.get("/developers")
@offload_database
def list_developers(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                    user: dict = Depends(require_user)):
    _require_employer(user)
    rows = storage.fetchall(
        """SELECT u.id, u.name, u.username, u.avatar_url, p.skills, p.interests, p.github_handle
           FROM developer_profiles p JOIN users u ON u.id = p.user_id
           WHERE p.open_to_work = 1 AND u.deleted_at IS NULL
           ORDER BY p.updated_at DESC LIMIT ? OFFSET ?""",
        (limit, offset),
    )
    developers = [{"userId": row["id"], "name": row["name"], "username": row["username"],
                   "avatarUrl": row["avatar_url"], "skills": json_loads(row["skills"], []),
                   "interests": json_loads(row["interests"], []), "githubHandle": row["github_handle"] or ""}
                  for row in rows]
    total = storage.fetchone(
        "SELECT COUNT(*) AS total FROM developer_profiles p JOIN users u ON u.id = p.user_id "
        "WHERE p.open_to_work = 1 AND u.deleted_at IS NULL"
    )["total"]
    return {"developers": developers, "total": int(total)}


@router.get("/developers/{developer_id}")
@offload_database
def get_developer(developer_id: str, user: dict = Depends(require_user)):
    _require_employer(user)
    row = storage.fetchone(
        """SELECT u.id, u.name, u.username, u.avatar_url, p.*
           FROM developer_profiles p JOIN users u ON u.id = p.user_id
           WHERE p.user_id = ? AND p.open_to_work = 1 AND u.deleted_at IS NULL""",
        (developer_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Developer not found")
    return {"userId": row["id"], "name": row["name"], "username": row["username"],
            "avatarUrl": row["avatar_url"], "skills": json_loads(row["skills"], []),
            "interests": json_loads(row["interests"], []), "githubHandle": row["github_handle"] or "",
            "goals": json_loads(row["goals"], [])}


@router.get("/tasks")
@offload_database
def list_employer_tasks(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                        user: dict = Depends(require_user)):
    _require_employer(user)
    rows = storage.fetchall(
        "SELECT * FROM marketplace_tasks WHERE employer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (user["id"], limit, offset),
    )
    total = storage.fetchone("SELECT COUNT(*) AS total FROM marketplace_tasks WHERE employer_id = ?", (user["id"],))["total"]
    return {"tasks": [marketplace_tasks._serialize_task(row) for row in rows], "total": int(total)}


@router.get("/tasks/{task_id}")
@offload_database
def get_employer_task(task_id: str, user: dict = Depends(require_user)):
    _require_employer(user)
    row = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ? AND employer_id = ?", (task_id, user["id"]))
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return marketplace_tasks._serialize_task(row)


@router.post("/tasks", status_code=201)
async def create_employer_task(request: marketplace_tasks.TaskCreate, user: dict = Depends(require_user)):
    _require_employer(user)
    return await marketplace_tasks.create_task(request, user)


@router.patch("/tasks/{task_id}")
@router.put("/tasks/{task_id}")
async def update_employer_task(task_id: str, request: marketplace_tasks.TaskUpdate, user: dict = Depends(require_user)):
    _require_employer(user)
    return await marketplace_tasks.update_task(task_id, request, user)


class InviteRequest(BaseModel):
    developerId: str


@router.post("/tasks/{task_id}/invite", status_code=201)
async def invite_developer(task_id: str, request: InviteRequest, user: dict = Depends(require_user)):
    _require_employer(user)
    developer = storage.fetchone("SELECT name FROM users WHERE id = ?", (request.developerId,))
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    return await offers.invite_developer(
        offers.InviteDeveloperRequest(taskId=task_id, developerId=request.developerId,
                                      developerName=developer["name"] or "Developer"), user
    )


class ReviewFeedback(BaseModel):
    feedback: str = Field(min_length=10, max_length=5000)
    impact: str = Field(default="", max_length=2000)
    met: list[str] = Field(default_factory=list)


async def _review_task(task_id: str, feedback: ReviewFeedback, approved: bool, user: dict):
    owned = await run_blocking(storage.fetchone,
                               "SELECT 1 FROM marketplace_tasks WHERE id = ? AND employer_id = ?",
                               (task_id, user["id"]))
    if not owned:
        raise HTTPException(status_code=404, detail="Task not found")
    submission = await run_blocking(
        storage.fetchone,
        "SELECT id FROM task_submissions WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1", (task_id,)
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    criteria = await run_blocking(storage.fetchone,
                                  "SELECT criteria FROM task_submissions WHERE id = ?", (submission["id"],))
    met = feedback.met
    if approved and not met:
        met = [item["text"] for item in json_loads(criteria["criteria"], [])]
    request = marketplace_tasks.SubmissionReviewRequest(
        decision="approved" if approved else "changes_requested", feedback=feedback.feedback,
        impact=feedback.impact, met=met,
    )
    return await marketplace_tasks.review_submission(task_id, submission["id"], request, user)


@router.post("/tasks/{task_id}/approve")
async def approve_submission(task_id: str, request: ReviewFeedback, user: dict = Depends(require_user)):
    _require_employer(user)
    return await _review_task(task_id, request, True, user)


@router.post("/tasks/{task_id}/request-changes")
async def request_changes(task_id: str, request: ReviewFeedback, user: dict = Depends(require_user)):
    _require_employer(user)
    return await _review_task(task_id, request, False, user)
