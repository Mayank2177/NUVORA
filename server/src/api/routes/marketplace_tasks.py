"""Marketplace task endpoints for employer-developer matching."""
from typing import List, Literal, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field, field_validator

from src.storage.instance import storage
from src.storage.sql import UPDATE_FIELDS, build_update
from src.storage.utils import new_id, utc_now_iso, json_dumps, json_loads
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database

router = APIRouter(prefix="/api/tasks", tags=["marketplace-tasks"])


# Request/Response Models
class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    company: str = Field(default="", max_length=200)
    rawNeed: str = Field(default="", max_length=5000)
    summary: str = Field(default="", max_length=1000)
    requirements: List[str] = Field(default_factory=list, max_length=20)
    skillsRequired: List[str] = Field(default_factory=list, max_length=20)
    complexity: Optional[Literal["Small", "Medium", "Large"]] = None
    scope: str = Field(default="", max_length=2000)
    acceptance: List[str] = Field(default_factory=list, max_length=20)
    budgetMin: Optional[int] = Field(default=None, ge=0)
    budgetMax: Optional[int] = Field(default=None, ge=0)
    deadline: Optional[str] = None
    status: Literal["draft", "open"] = "draft"


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    company: Optional[str] = Field(default=None, max_length=200)
    rawNeed: Optional[str] = Field(default=None, max_length=5000)
    summary: Optional[str] = Field(default=None, max_length=1000)
    requirements: Optional[List[str]] = Field(default=None, max_length=20)
    skillsRequired: Optional[List[str]] = Field(default=None, max_length=20)
    complexity: Optional[Literal["Small", "Medium", "Large"]] = None
    scope: Optional[str] = Field(default=None, max_length=2000)
    acceptance: Optional[List[str]] = Field(default=None, max_length=20)
    budgetMin: Optional[int] = Field(default=None, ge=0)
    budgetMax: Optional[int] = Field(default=None, ge=0)
    deadline: Optional[str] = None
    # Assignment and completion are controlled by application and review flows.
    status: Optional[Literal["draft", "open", "closed", "cancelled"]] = None


class TaskResponse(BaseModel):
    id: str
    employerId: str
    company: str
    title: str
    description: str
    rawNeed: str
    summary: str
    requirements: List[str]
    skillsRequired: List[str]
    complexity: Optional[str]
    scope: str
    acceptance: List[str]
    budgetMin: Optional[int]
    budgetMax: Optional[int]
    deadline: Optional[str]
    status: str
    assigneeId: Optional[str]
    createdAt: str
    updatedAt: str
    publishedAt: Optional[str]
    closedAt: Optional[str]


class TaskListResponse(BaseModel):
    tasks: List[TaskResponse]
    total: int


class TaskApplication(BaseModel):
    id: str
    taskId: str
    developerId: str
    status: str
    proposal: str
    createdAt: str
    updatedAt: str


class TaskApplicationCreate(BaseModel):
    proposal: str = Field(min_length=1, max_length=2000)


class CheckInput(BaseModel):
    id: str
    label: str
    status: str = Field(pattern="^(pass|fail|warn)$")
    detail: str


class CriteriaInput(BaseModel):
    text: str
    how: str


class TestRunInput(BaseModel):
    project: str
    file: str
    passed: int
    total: int
    failures: List[str]
    ranAt: str
    ms: int


class ReviewInput(BaseModel):
    decision: str = Field(pattern="^(approved|changes_requested)$")
    feedback: str
    impact: str
    met: List[str]
    at: str


class TaskSubmission(BaseModel):
    id: str
    taskId: str
    developerId: str
    devName: str
    applicationId: str
    round: int
    submittedAt: str
    summary: str
    link: str
    submissionUrl: str
    notes: str
    criteria: List[dict]
    tests: Optional[dict]
    checks: List[dict]
    status: str
    reviewedAt: Optional[str]
    review: Optional[dict]


class TaskSubmissionCreate(BaseModel):
    summary: str = Field(min_length=20, max_length=5000)
    link: str = Field(max_length=500)
    submissionUrl: str = Field(min_length=1, max_length=500)
    notes: str = Field(default="", max_length=2000)
    criteria: List[CriteriaInput] = Field(default_factory=list, max_length=20)
    tests: Optional[TestRunInput] = None
    checks: List[CheckInput] = Field(default_factory=list, max_length=10)

    @field_validator("link", "submissionUrl")
    @classmethod
    def _safe_submission_url(cls, value: str) -> str:
        if not value:
            return value
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Submission links must be http(s) URLs without embedded credentials")
        return value.strip()


class SubmissionReviewRequest(BaseModel):
    decision: str = Field(pattern="^(approved|changes_requested)$")
    feedback: str = Field(min_length=10, max_length=5000)
    impact: str = Field(max_length=2000)
    met: List[str] = Field(default_factory=list)


class DeveloperMatch(BaseModel):
    userId: str
    name: str
    username: str
    avatarUrl: Optional[str]
    matchScore: float
    skillMatch: float
    evidenceMatch: float
    availabilityMatch: float


class TaskMatchesResponse(BaseModel):
    taskId: str
    matches: List[DeveloperMatch]


# Helper functions
def _serialize_task(row) -> dict:
    """Convert database row to task response format."""
    return {
        "id": row["id"],
        "employerId": row["employer_id"],
        "company": row["company"] if "company" in row.keys() and row["company"] else "",
        "title": row["title"],
        "description": row["description"],
        "rawNeed": row["raw_need"] if "raw_need" in row.keys() and row["raw_need"] else "",
        "summary": row["summary"] if "summary" in row.keys() and row["summary"] else "",
        "requirements": json_loads(row["requirements"], []),
        "skillsRequired": json_loads(row["skills_required"], []),
        "complexity": row["complexity"] if "complexity" in row.keys() else None,
        "scope": row["scope"] if "scope" in row.keys() and row["scope"] else "",
        "acceptance": json_loads(row["acceptance"], []) if "acceptance" in row.keys() else [],
        "budgetMin": row["budget_min"] if "budget_min" in row.keys() else None,
        "budgetMax": row["budget_max"] if "budget_max" in row.keys() else None,
        "deadline": row["deadline"] if "deadline" in row.keys() else None,
        "status": row["status"],
        "assigneeId": row["assignee_id"] if "assignee_id" in row.keys() else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "publishedAt": row["published_at"] if "published_at" in row.keys() else None,
        "closedAt": row["closed_at"] if "closed_at" in row.keys() else None,
    }


def _serialize_application(row) -> dict:
    """Convert database row to application response format."""
    return {
        "id": row["id"],
        "taskId": row["task_id"],
        "developerId": row["developer_id"],
        "status": row["status"],
        "proposal": row["proposal"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _serialize_submission(row) -> dict:
    """Convert database row to submission response format."""
    return {
        "id": row["id"],
        "taskId": row["task_id"],
        "developerId": row["developer_id"],
        "devName": row["developer_name"] if "developer_name" in row.keys() else "",
        "applicationId": row["application_id"],
        "round": row["round"] if "round" in row.keys() else 1,
        "submittedAt": row["submitted_at"],
        "summary": row["summary"] if "summary" in row.keys() else "",
        "link": row["link"] if "link" in row.keys() else "",
        "submissionUrl": row["submission_url"],
        "notes": row["notes"],
        "criteria": json_loads(row["criteria"], []) if "criteria" in row.keys() else [],
        "tests": json_loads(row["tests"], None) if "tests" in row.keys() and row["tests"] else None,
        "checks": json_loads(row["checks"], []) if "checks" in row.keys() else [],
        "status": row["status"],
        "reviewedAt": row["reviewed_at"] if "reviewed_at" in row.keys() else None,
        "review": json_loads(row["review"], None) if "review" in row.keys() and row["review"] else None,
    }


# Endpoints
@router.post("", status_code=201, response_model=TaskResponse)
@offload_database
def create_task(request: TaskCreate, user: dict = Depends(require_user)):
    """Create a new marketplace task (employer only)."""
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Employer account required")

    now = utc_now_iso()
    task_id = new_id("tsk")
    
    storage.execute(
        """
        INSERT INTO marketplace_tasks (
            id, employer_id, company, title, description, raw_need, summary,
            requirements, skills_required, complexity, scope, acceptance,
            budget_min, budget_max, deadline, status, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            user["id"],
            request.company,
            request.title,
            request.description,
            request.rawNeed,
            request.summary,
            json_dumps(request.requirements),
            json_dumps(request.skillsRequired),
            request.complexity,
            request.scope,
            json_dumps(request.acceptance),
            request.budgetMin,
            request.budgetMax,
            request.deadline,
            request.status,
            now if request.status == "open" else None,
            now,
            now,
        ),
    )
    
    row = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ?", (task_id,))
    return _serialize_task(row)


@router.get("", response_model=TaskListResponse)
@offload_database
def list_tasks(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_user),
):
    """List marketplace tasks with optional status filter."""
    visibility = "(status = 'open' OR employer_id = ?)"
    if status:
        rows = storage.fetchall(
            f"SELECT * FROM marketplace_tasks WHERE status = ? AND {visibility} "
            "ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (status, user["id"], limit, offset),
        )
        count_row = storage.fetchone(
            f"SELECT COUNT(*) as total FROM marketplace_tasks WHERE status = ? AND {visibility}",
            (status, user["id"]),
        )
    else:
        rows = storage.fetchall(
            f"SELECT * FROM marketplace_tasks WHERE {visibility} "
            "ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (user["id"], limit, offset),
        )
        count_row = storage.fetchone(
            f"SELECT COUNT(*) as total FROM marketplace_tasks WHERE {visibility}",
            (user["id"],),
        )
    
    return {
        "tasks": [_serialize_task(row) for row in rows],
        "total": count_row["total"],
    }


@router.get("/submissions", response_model=List[TaskSubmission])
@offload_database
def list_all_submissions(user: dict = Depends(require_user)):
    """List submissions belonging to the authenticated user."""
    if user.get("role") == "employer":
        rows = storage.fetchall(
            """SELECT s.* FROM task_submissions s
               JOIN marketplace_tasks t ON t.id = s.task_id
               WHERE t.employer_id = ? ORDER BY s.submitted_at DESC""",
            (user["id"],),
        )
    else:
        rows = storage.fetchall(
            "SELECT * FROM task_submissions WHERE developer_id = ? ORDER BY submitted_at DESC",
            (user["id"],),
        )
    return [_serialize_submission(row) for row in rows]


@router.get("/{task_id}", response_model=TaskResponse)
@offload_database
def get_task(task_id: str, user: dict = Depends(require_user)):
    """Get task details by ID."""
    row = storage.fetchone(
        "SELECT * FROM marketplace_tasks WHERE id = ? AND (status = 'open' OR employer_id = ?)",
        (task_id, user["id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return _serialize_task(row)


@router.put("/{task_id}", response_model=TaskResponse)
@offload_database
def update_task(task_id: str, request: TaskUpdate, user: dict = Depends(require_user)):
    """Update an existing task (employer only)."""
    # Check task exists and user owns it
    row = storage.fetchone(
        "SELECT * FROM marketplace_tasks WHERE id = ? AND employer_id = ?",
        (task_id, user["id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found or not authorized")
    
    # Build update query dynamically
    updates = {}
    if request.title is not None:
        updates["title"] = request.title
    if request.description is not None:
        updates["description"] = request.description
    if request.company is not None:
        updates["company"] = request.company
    if request.rawNeed is not None:
        updates["raw_need"] = request.rawNeed
    if request.summary is not None:
        updates["summary"] = request.summary
    if request.requirements is not None:
        updates["requirements"] = json_dumps(request.requirements)
    if request.skillsRequired is not None:
        updates["skills_required"] = json_dumps(request.skillsRequired)
    if request.complexity is not None:
        updates["complexity"] = request.complexity
    if request.scope is not None:
        updates["scope"] = request.scope
    if request.acceptance is not None:
        updates["acceptance"] = json_dumps(request.acceptance)
    if request.budgetMin is not None:
        updates["budget_min"] = request.budgetMin
    if request.budgetMax is not None:
        updates["budget_max"] = request.budgetMax
    if request.deadline is not None:
        updates["deadline"] = request.deadline
    if request.status is not None:
        updates["status"] = request.status
        if request.status in ("completed", "cancelled", "closed"):
            updates["closed_at"] = utc_now_iso()
        elif request.status == "open" and row["status"] == "draft":
            updates["published_at"] = utc_now_iso()
        updates["status"] = request.status
        if request.status in ("completed", "cancelled"):
            updates["closed_at"] = utc_now_iso()
    
    if not updates:
        return _serialize_task(row)
    
    updates["updated_at"] = utc_now_iso()
    
    statement, values = build_update("marketplace_tasks", UPDATE_FIELDS["marketplace_tasks"], updates)
    
    storage.execute(
        f"{statement} WHERE id = ?",
        values + (task_id,),
    )
    
    updated_row = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ?", (task_id,))
    return _serialize_task(updated_row)


@router.post("/{task_id}/accept", status_code=201, response_model=TaskApplication)
@offload_database
def accept_task(task_id: str, request: TaskApplicationCreate, user: dict = Depends(require_user)):
    """Apply for a task (developer)."""
    if user.get("role") != "developer":
        raise HTTPException(status_code=403, detail="Developer account required")

    # Check task exists and is open
    task = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ?", (task_id,))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != "open":
        raise HTTPException(status_code=400, detail="Task is not open for applications")
    
    # Check if already applied
    existing = storage.fetchone(
        "SELECT * FROM task_applications WHERE task_id = ? AND developer_id = ?",
        (task_id, user["id"]),
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already applied to this task")
    
    # Create application
    now = utc_now_iso()
    app_id = new_id("app")
    
    storage.execute(
        """
        INSERT INTO task_applications (
            id, task_id, developer_id, status, proposal, created_at, updated_at
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?)
        """,
        (app_id, task_id, user["id"], request.proposal, now, now),
    )
    
    row = storage.fetchone("SELECT * FROM task_applications WHERE id = ?", (app_id,))
    return _serialize_application(row)


@router.post("/{task_id}/submit", status_code=201, response_model=TaskSubmission)
@offload_database
def submit_task(task_id: str, request: TaskSubmissionCreate, user: dict = Depends(require_user)):
    """Submit completed work for a task (developer)."""
    # Check task exists and is assigned to user
    task = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ?", (task_id,))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["assignee_id"] != user["id"]:
        raise HTTPException(
            status_code=403,
            detail="This task isn't assigned to you.",
        )
    
    if task["status"] not in ("assigned", "changes_requested"):
        raise HTTPException(
            status_code=400,
            detail="This task isn't accepting a submission right now.",
        )
    
    # Check for failing checks
    if any(check.status == "fail" for check in request.checks):
        raise HTTPException(
            status_code=400,
            detail="Fix the failing checks before submitting.",
        )
    
    # Get application (should exist if task is assigned)
    application = storage.fetchone(
        """
        SELECT * FROM task_applications
        WHERE task_id = ? AND developer_id = ? AND status = 'accepted'
        """,
        (task_id, user["id"]),
    )
    if not application:
        raise HTTPException(
            status_code=400,
            detail="No accepted application found for this task",
        )
    
    # Calculate round number
    existing_count = storage.fetchone(
        "SELECT COUNT(*) as count FROM task_submissions WHERE task_id = ?",
        (task_id,),
    )
    round_num = existing_count["count"] + 1
    
    # Create submission
    now = utc_now_iso()
    submission_id = new_id("sub")
    
    # Serialize nested objects
    criteria_json = json_dumps([{"text": c.text, "how": c.how} for c in request.criteria])
    tests_json = json_dumps(request.tests.dict()) if request.tests else None
    checks_json = json_dumps([c.dict() for c in request.checks])
    
    storage.execute(
        """
        INSERT INTO task_submissions (
            id, task_id, developer_id, developer_name, application_id, round,
            submission_url, notes, summary, link, criteria, tests, checks,
            status, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)
        """,
        (
            submission_id,
            task_id,
            user["id"],
            user["name"],
            application["id"],
            round_num,
            request.submissionUrl,
            request.notes,
            request.summary,
            request.link,
            criteria_json,
            tests_json,
            checks_json,
            now,
        ),
    )
    
    # Update task status to in_review
    storage.execute(
        """
        UPDATE marketplace_tasks
        SET status = 'in_review', updated_at = ?
        WHERE id = ?
        """,
        (now, task_id),
    )
    
    row = storage.fetchone("SELECT * FROM task_submissions WHERE id = ?", (submission_id,))
    return _serialize_submission(row)


@router.get("/{task_id}/submissions", response_model=List[TaskSubmission])
@offload_database
def list_task_submissions(task_id: str, user: dict = Depends(require_user)):
    """List all submissions for a task."""
    # Check task exists
    task = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ?", (task_id,))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only employer or assigned developer can view submissions
    if task["employer_id"] != user["id"] and task["assignee_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    rows = storage.fetchall(
        "SELECT * FROM task_submissions WHERE task_id = ? ORDER BY submitted_at DESC",
        (task_id,),
    )
    
    return [_serialize_submission(row) for row in rows]


@router.post("/{task_id}/submissions/{submission_id}/review", response_model=TaskSubmission)
@offload_database
def review_submission(
    task_id: str,
    submission_id: str,
    request: SubmissionReviewRequest,
    user: dict = Depends(require_user),
):
    """Employer reviews a submission."""
    # Check task exists and user owns it
    task = storage.fetchone(
        "SELECT * FROM marketplace_tasks WHERE id = ? AND employer_id = ?",
        (task_id, user["id"]),
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not authorized")
    
    # Check submission exists and belongs to this task
    submission = storage.fetchone(
        "SELECT * FROM task_submissions WHERE id = ? AND task_id = ?",
        (submission_id, task_id),
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    if task["status"] != "in_review":
        raise HTTPException(
            status_code=400,
            detail="This task isn't in review status.",
        )
    
    if submission["review"]:
        raise HTTPException(
            status_code=400,
            detail="This submission was already reviewed.",
        )
    
    approve = request.decision == "approved"
    
    # Validation
    criteria_count = len(json_loads(submission["criteria"], []))
    if approve and len(request.met) != criteria_count:
        raise HTTPException(
            status_code=400,
            detail="Tick every acceptance criterion before approving.",
        )
    
    # Create review object
    now = utc_now_iso()
    review = {
        "decision": request.decision,
        "feedback": request.feedback,
        "impact": request.impact,
        "met": request.met,
        "at": now,
    }
    
    # Update submission with review
    new_status = "approved" if approve else "revision_requested"
    storage.execute(
        """
        UPDATE task_submissions
        SET review = ?, status = ?, reviewed_at = ?
        WHERE id = ?
        """,
        (json_dumps(review), new_status, now, submission_id),
    )
    
    # Update task status
    task_status = "completed" if approve else "changes_requested"
    storage.execute(
        """
        UPDATE marketplace_tasks
        SET status = ?, updated_at = ?, closed_at = ?
        WHERE id = ?
        """,
        (task_status, now, now if approve else None, task_id),
    )
    
    # If approved, add skill verifications
    if approve:
        task_skills = json_loads(task["skills_required"], [])
        for skill in task_skills:
            verification_id = new_id("ver")
            storage.execute(
                """
                INSERT INTO skill_verifications (
                    id, user_id, skill_name, task_id, task_title, company, verified_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    verification_id,
                    submission["developer_id"],
                    skill,
                    task_id,
                    task["title"],
                    task["company"] or "",
                    now,
                    now,
                ),
            )
    
    updated_row = storage.fetchone("SELECT * FROM task_submissions WHERE id = ?", (submission_id,))
    return _serialize_submission(updated_row)


@router.get("/{task_id}/matches", response_model=TaskMatchesResponse)
@offload_database
def get_task_matches(task_id: str, user: dict = Depends(require_user)):
    """Get matched developers for a task (employer only)."""
    # Check task exists and user owns it
    task = storage.fetchone(
        "SELECT * FROM marketplace_tasks WHERE id = ? AND employer_id = ?",
        (task_id, user["id"]),
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not authorized")
    
    # Get match scores with user info
    rows = storage.fetchall(
        """
        SELECT m.*, u.name, u.username, u.avatar_url
        FROM match_scores m
        JOIN users u ON u.id = m.developer_id
        JOIN developer_profiles dp ON dp.user_id = u.id
        WHERE m.task_id = ? AND u.role = 'developer'
          AND u.deleted_at IS NULL AND dp.open_to_work = 1
        ORDER BY m.score DESC
        LIMIT 50
        """,
        (task_id,),
    )
    
    matches = [
        {
            "userId": row["developer_id"],
            "name": row["name"],
            "username": row["username"],
            "avatarUrl": row["avatar_url"] if "avatar_url" in row.keys() else None,
            "matchScore": row["score"],
            "skillMatch": row["skill_match"],
            "evidenceMatch": row["evidence_match"],
            "availabilityMatch": row["availability_match"],
        }
        for row in rows
    ]
    
    return {"taskId": task_id, "matches": matches}


@router.delete("/{task_id}", status_code=204)
@offload_database
def delete_task(task_id: str, user: dict = Depends(require_user)):
    """Delete a task owned by the authenticated employer."""
    task = storage.fetchone(
        "SELECT id FROM marketplace_tasks WHERE id = ? AND employer_id = ?",
        (task_id, user["id"]),
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    storage.execute("DELETE FROM marketplace_tasks WHERE id = ?", (task_id,))
    return None


@router.post("/{task_id}/apply", status_code=201, response_model=TaskApplication)
async def apply_to_task(task_id: str, request: TaskApplicationCreate, user: dict = Depends(require_user)):
    """Apply to a task (alias for accept)."""
    return await accept_task(task_id, request, user)
