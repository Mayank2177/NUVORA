"""Work and submission views backed by marketplace tasks."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.api.concurrency import offload_database, run_blocking
from src.api.routes import marketplace_tasks
from src.api.routes.auth import require_user
from src.storage.instance import storage
from src.storage.utils import json_loads

router = APIRouter(prefix="/api/work", tags=["work"])


class WorkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=5000)
    status: Literal["draft", "open"] = "draft"


class WorkUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    summary: Optional[str] = Field(default=None, max_length=5000)
    status: Optional[Literal["draft", "open", "closed", "cancelled"]] = None


class WorkReview(BaseModel):
    feedback: str = Field(min_length=10, max_length=5000)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    decision: Optional[Literal["approved", "changes_requested"]] = None
    impact: str = Field(default="", max_length=2000)
    met: list[str] = Field(default_factory=list)


def _work(row) -> dict:
    task = row if "employerId" in row.keys() else marketplace_tasks._serialize_task(row)
    return {"id": task["id"], "title": task["title"],
            "summary": task["summary"] or task["description"], "status": task["status"],
            "task": task}


@router.get("")
@offload_database
def list_work(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
              user: dict = Depends(require_user)):
    if user.get("role") == "employer":
        predicate, owner = "employer_id = ?", user["id"]
    else:
        predicate, owner = "assignee_id = ?", user["id"]
    rows = storage.fetchall(
        f"SELECT * FROM marketplace_tasks WHERE {predicate} ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        (owner, limit, offset),
    )
    total = storage.fetchone(f"SELECT COUNT(*) AS total FROM marketplace_tasks WHERE {predicate}", (owner,))["total"]
    return {"work": [_work(row) for row in rows], "total": int(total)}


@router.get("/{work_id}")
@offload_database
def get_work(work_id: str, user: dict = Depends(require_user)):
    predicate = "employer_id" if user.get("role") == "employer" else "assignee_id"
    row = storage.fetchone(f"SELECT * FROM marketplace_tasks WHERE id = ? AND {predicate} = ?", (work_id, user["id"]))
    if not row:
        raise HTTPException(status_code=404, detail="Work not found")
    return _work(row)


@router.post("", status_code=201)
async def create_work(request: WorkCreate, user: dict = Depends(require_user)):
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Only employers can create work")
    task = marketplace_tasks.TaskCreate(title=request.title, description=request.summary or request.title,
                                        summary=request.summary, status=request.status)
    return _work(await marketplace_tasks.create_task(task, user))


@router.patch("/{work_id}")
async def update_work(work_id: str, request: WorkUpdate, user: dict = Depends(require_user)):
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Only employers can update work")
    updates = request.model_dump(exclude_unset=True)
    if "summary" in updates:
        updates["description"] = updates["summary"]
    return _work(await marketplace_tasks.update_task(work_id, marketplace_tasks.TaskUpdate(**updates), user))


@router.post("/{work_id}/submit", status_code=201)
async def submit_work(work_id: str, request: marketplace_tasks.TaskSubmissionCreate,
                      user: dict = Depends(require_user)):
    if user.get("role") != "developer":
        raise HTTPException(status_code=403, detail="Only developers can submit work")
    return await marketplace_tasks.submit_task(work_id, request, user)


def _owned_task_and_submission(work_id: str, user: dict):
    row = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ?", (work_id,))
    if not row or row["employer_id"] != user["id"] and row["assignee_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Work not found")
    submission = storage.fetchone(
        "SELECT * FROM task_submissions WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1", (work_id,)
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Review not found")
    return row, submission


@router.get("/{work_id}/review")
@offload_database
def get_work_review(work_id: str, user: dict = Depends(require_user)):
    _, submission = _owned_task_and_submission(work_id, user)
    return {"submission": marketplace_tasks._serialize_submission(submission),
            "review": json_loads(submission["review"], None)}


@router.post("/{work_id}/review", status_code=200)
async def post_work_review(work_id: str, request: WorkReview, user: dict = Depends(require_user)):
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Only employers can review work")
    _, submission = await run_blocking(_owned_task_and_submission, work_id, user)
    decision = request.decision or ("approved" if request.rating is None or request.rating >= 4 else "changes_requested")
    criteria = json_loads(submission["criteria"], [])
    met = request.met or ([item["text"] for item in criteria] if decision == "approved" else [])
    review = marketplace_tasks.SubmissionReviewRequest(decision=decision, feedback=request.feedback,
                                                        impact=request.impact, met=met)
    return await marketplace_tasks.review_submission(work_id, submission["id"], review, user)
