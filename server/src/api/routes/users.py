"""User profile and evidence endpoints."""
from typing import List, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field, field_validator

from src.storage.instance import storage
from src.storage.sql import UPDATE_FIELDS, build_update
from src.storage.utils import json_loads, utc_now_iso
from src.api.routes.auth import require_user, optional_user
from src.api.concurrency import offload_database

router = APIRouter(prefix="/api/users", tags=["users"])


# Request/Response Models
class UserProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    username: str
    avatarUrl: Optional[str]
    emailVerified: bool
    githubConnected: bool
    createdAt: str
    updatedAt: str


class DetailedProfileResponse(BaseModel):
    userId: str
    username: str
    name: str
    headline: str
    bio: str
    location: str
    website: str
    github: str
    linkedin: str
    skills: List[str]
    hidden: List[str]
    isPublic: bool
    joinedAt: str
    updatedAt: str


class DetailedProfileUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=39, pattern=r"^[a-z0-9](-?[a-z0-9])*$")
    headline: Optional[str] = Field(default=None, max_length=80)
    bio: Optional[str] = Field(default=None, max_length=400)
    location: Optional[str] = Field(default=None, max_length=60)
    website: Optional[str] = Field(default=None, max_length=500)
    github: Optional[str] = Field(default=None, max_length=39, pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?$")
    linkedin: Optional[str] = Field(default=None, max_length=500)
    skills: Optional[List[str]] = Field(default=None, max_length=30)
    hidden: Optional[List[str]] = Field(default=None, max_length=100)
    isPublic: Optional[bool] = None

    @field_validator("website", "linkedin")
    @classmethod
    def _safe_profile_url(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("URL must be an http(s) address without embedded credentials")
        return value.strip()


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)


class EvidenceItem(BaseModel):
    id: str
    projectId: str
    kind: str
    title: str
    body: str
    source: str
    occurredAt: str
    aiAssisted: bool
    verified: bool
    publish: bool
    createdAt: str


class UserEvidenceResponse(BaseModel):
    evidence: List[EvidenceItem]
    total: int


class SkillLevel(BaseModel):
    skillName: str
    level: int
    evidenceCount: int
    updatedAt: str


class UserSkillsResponse(BaseModel):
    skills: List[SkillLevel]


class TaskInfo(BaseModel):
    id: str
    title: str
    status: str
    applicationStatus: str
    createdAt: str
    updatedAt: str


class UserTasksResponse(BaseModel):
    tasks: List[TaskInfo]


# Helper functions
def _serialize_detailed_profile(row, is_owner: bool = False) -> dict:
    """Convert database row to detailed profile response format."""
    return {
        "userId": row["id"],
        "username": row["username"],
        "name": row["name"] if is_owner else row["name"],  # Always show name for now
        "headline": row["headline"] if "headline" in row.keys() else "",
        "bio": row["bio"] if "bio" in row.keys() else "",
        "location": row["location"] if "location" in row.keys() else "",
        "website": row["website"] if "website" in row.keys() else "",
        "github": row["github_handle"] if "github_handle" in row.keys() else "",
        "linkedin": row["linkedin_url"] if "linkedin_url" in row.keys() else "",
        "skills": json_loads(row["skills"], []) if "skills" in row.keys() else [],
        "hidden": json_loads(row["hidden_projects"], []) if "hidden_projects" in row.keys() else [],
        "isPublic": bool(row["is_public"]) if "is_public" in row.keys() else False,
        "joinedAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _serialize_evidence(row) -> dict:
    """Convert database row to evidence response format."""
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "kind": row["kind"],
        "title": row["title"],
        "body": row["body"],
        "source": row["source"] if "source" in row.keys() else "",
        "occurredAt": row["occurred_at"],
        "aiAssisted": bool(row["ai_assisted"]),
        "verified": bool(row["verified"]),
        "publish": bool(row["publish"]),
        "createdAt": row["created_at"],
    }


def _serialize_skill(row) -> dict:
    """Convert database row to skill response format."""
    return {
        "skillName": row["skill_name"],
        "level": row["level"],
        "evidenceCount": row["evidence_count"],
        "updatedAt": row["updated_at"],
    }




@router.get("/{user_id}", response_model=UserProfileResponse)
@offload_database
def get_user_by_id(user_id: str, current_user: Optional[dict] = Depends(optional_user)):
    """Get user by ID (lightweight version)."""
    row = storage.fetchone(
        "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
        (user_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_owner = current_user and current_user["id"] == user_id
    if not is_owner and not (row["is_public"] if "is_public" in row.keys() else 0):
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"] if is_owner else "",
        "username": row["username"],
        "avatarUrl": row["avatar_url"] if "avatar_url" in row.keys() else None,
        "emailVerified": bool(row["email_verified"]) if is_owner else False,
        "githubConnected": bool(row["github_login"] if "github_login" in row.keys() else None) if is_owner else False,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }

# Endpoints
def _get_user_profile_data(user_id: str, current_user: Optional[dict]):
    """Get user profile by ID (public for viewing, private for own profile)."""
    row = storage.fetchone(
        "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
        (user_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if viewing own profile or if it should be public
    is_owner = current_user and current_user["id"] == user_id
    if not is_owner and not (row["is_public"] if "is_public" in row.keys() else 0):
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"] if is_owner else "",  # Hide email from others
        "username": row["username"],
        "avatarUrl": row["avatar_url"] if "avatar_url" in row.keys() else None,
        "emailVerified": bool(row["email_verified"]) if is_owner else False,
        "githubConnected": bool(row["github_login"] if "github_login" in row.keys() else None) if is_owner else bool(row["github_login"] if "github_login" in row.keys() else None),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@router.get("/{user_id}/profile", response_model=UserProfileResponse)
@offload_database
def get_user_profile(user_id: str, current_user: Optional[dict] = Depends(optional_user)):
    return _get_user_profile_data(user_id, current_user)


@router.put("/{user_id}/profile", response_model=UserProfileResponse)
@offload_database
def update_user_profile(
    user_id: str,
    request: UserProfileUpdate,
    user: dict = Depends(require_user),
):
    """Update user profile (must be own profile)."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only update own profile")
    
    if not request.name:
        # No updates to make
        return _get_user_profile_data(user_id, user)
    
    storage.execute(
        "UPDATE users SET name = ?, updated_at = ? WHERE id = ?",
        (request.name, utc_now_iso(), user_id),
    )
    
    return _get_user_profile_data(user_id, user)


@router.get("/{user_id}/detailed-profile", response_model=DetailedProfileResponse)
@offload_database
def get_detailed_profile(user_id: str, current_user: Optional[dict] = Depends(optional_user)):
    """Get detailed user profile with all profile fields."""
    row = storage.fetchone(
        "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
        (user_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_owner = current_user and current_user["id"] == user_id
    if not is_owner and not (row["is_public"] if "is_public" in row.keys() else 0):
        raise HTTPException(status_code=404, detail="Profile not found")
    return _serialize_detailed_profile(row, is_owner)


@router.get("/username/{username}/detailed-profile", response_model=DetailedProfileResponse)
@offload_database
def get_detailed_profile_by_username(username: str, current_user: Optional[dict] = Depends(optional_user)):
    """Get detailed user profile by username (for public profiles)."""
    row = storage.fetchone(
        "SELECT * FROM users WHERE username = ? AND deleted_at IS NULL",
        (username,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Only return profile if it's public or if viewing own profile
    is_owner = current_user and current_user["id"] == row["id"]
    is_public = bool(row["is_public"] if "is_public" in row.keys() else 0)
    
    if not is_public and not is_owner:
        raise HTTPException(status_code=404, detail="Profile is private")
    
    return _serialize_detailed_profile(row, is_owner)


@router.put("/{user_id}/detailed-profile", response_model=DetailedProfileResponse)
@offload_database
def update_detailed_profile(
    user_id: str,
    request: DetailedProfileUpdate,
    user: dict = Depends(require_user),
):
    """Update detailed user profile (must be own profile)."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only update own profile")
    
    from src.storage.utils import utc_now_iso, json_dumps
    
    # Get current profile
    row = storage.fetchone("SELECT * FROM users WHERE id = ?", (user_id,))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build update query dynamically
    updates = {}
    if request.username is not None:
        # Check if username is already taken
        existing = storage.fetchone(
            "SELECT id FROM users WHERE username = ? AND id != ?",
            (request.username, user_id),
        )
        if existing:
            raise HTTPException(status_code=400, detail="Username is already taken")
        updates["username"] = request.username
    
    if request.headline is not None:
        updates["headline"] = request.headline
    if request.bio is not None:
        updates["bio"] = request.bio
    if request.location is not None:
        updates["location"] = request.location
    if request.website is not None:
        updates["website"] = request.website
    if request.github is not None:
        updates["github_handle"] = request.github
    if request.linkedin is not None:
        updates["linkedin_url"] = request.linkedin
    if request.skills is not None:
        updates["skills"] = json_dumps(request.skills)
    if request.hidden is not None:
        updates["hidden_projects"] = json_dumps(request.hidden)
    if request.isPublic is not None:
        updates["is_public"] = 1 if request.isPublic else 0
    
    if not updates:
        return _serialize_detailed_profile(row, True)
    
    updates["updated_at"] = utc_now_iso()
    
    statement, values = build_update("users", UPDATE_FIELDS["users"], updates)
    
    def update_profile(conn):
        conn.execute(f"{statement} WHERE id = ?", values + (user_id,))
        if request.username is not None and request.username != row["username"]:
            conn.execute("UPDATE publications SET username = ? WHERE username = ?",
                         (request.username, row["username"]))
    storage.executemany_tx(update_profile)
    
    updated_row = storage.fetchone("SELECT * FROM users WHERE id = ?", (user_id,))
    return _serialize_detailed_profile(updated_row, True)


@router.get("/{user_id}/evidence", response_model=UserEvidenceResponse)
@offload_database
def get_user_evidence(
    user_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: Optional[dict] = Depends(optional_user),
):
    """Get user's evidence items (public or own)."""
    # Check user exists
    user_row = storage.fetchone(
        "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
        (user_id,),
    )
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_owner = current_user and current_user["id"] == user_id
    if not is_owner and not (user_row["is_public"] if "is_public" in user_row.keys() else 0):
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Get evidence from user's projects
    if is_owner:
        # Show all evidence for owner
        rows = storage.fetchall(
            """
            SELECT e.* FROM evidence e
            JOIN projects p ON p.id = e.project_id
            WHERE p.user_id = ? AND p.deleted_at IS NULL
            ORDER BY e.occurred_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        )
        count_row = storage.fetchone(
            """
            SELECT COUNT(*) as total FROM evidence e
            JOIN projects p ON p.id = e.project_id
            WHERE p.user_id = ? AND p.deleted_at IS NULL
            """,
            (user_id,),
        )
    else:
        # Show only public evidence for others
        rows = storage.fetchall(
            """
            SELECT e.* FROM evidence e
            JOIN projects p ON p.id = e.project_id
            WHERE p.user_id = ? AND p.deleted_at IS NULL
              AND p.status = 'published' AND e.publish = 1 AND e.sensitive = 0
            ORDER BY e.occurred_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        )
        count_row = storage.fetchone(
            """
            SELECT COUNT(*) as total FROM evidence e
            JOIN projects p ON p.id = e.project_id
            WHERE p.user_id = ? AND p.deleted_at IS NULL
              AND p.status = 'published' AND e.publish = 1 AND e.sensitive = 0
            """,
            (user_id,),
        )
    
    return {
        "evidence": [_serialize_evidence(row) for row in rows],
        "total": count_row["total"],
    }


@router.post("/{user_id}/evidence", status_code=201)
@offload_database
def add_user_evidence(
    user_id: str,
    user: dict = Depends(require_user),
):
    """Add evidence to user (placeholder - evidence is added via projects)."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only add evidence to own profile")
    
    raise HTTPException(
        status_code=501,
        detail="Evidence must be added via project endpoints: POST /api/projects/{project_id}/evidence",
    )


@router.get("/{user_id}/skills", response_model=UserSkillsResponse)
@offload_database
def get_user_skills(user_id: str, current_user: Optional[dict] = Depends(optional_user)):
    """Get user's skill levels."""
    # Check user exists
    user_row = storage.fetchone(
        "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
        (user_id,),
    )
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get skills from developer_skills table
    rows = storage.fetchall(
        """
        SELECT * FROM developer_skills
        WHERE user_id = ?
        ORDER BY level DESC, skill_name ASC
        """,
        (user_id,),
    )
    
    return {"skills": [_serialize_skill(row) for row in rows]}


@router.get("/{user_id}/tasks", response_model=UserTasksResponse)
@offload_database
def get_user_tasks(user_id: str, user: dict = Depends(require_user)):
    """Get user's active marketplace tasks."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only view own tasks")
    
    # Get tasks where user has applied
    rows = storage.fetchall(
        """
        SELECT t.id, t.title, t.status, a.status as application_status,
               t.created_at, t.updated_at
        FROM marketplace_tasks t
        JOIN task_applications a ON a.task_id = t.id
        WHERE a.developer_id = ?
        ORDER BY t.updated_at DESC
        """,
        (user_id,),
    )
    
    tasks = [
        {
            "id": row["id"],
            "title": row["title"],
            "status": row["status"],
            "applicationStatus": row["application_status"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]
    
    return {"tasks": tasks}


# Goals endpoints
class UserGoalsResponse(BaseModel):
    goals: List[str]


class UserGoalsUpdate(BaseModel):
    goals: List[str]


class CapabilityLevel(BaseModel):
    category: str
    level: int
    evidenceCount: int
    confidence: float


class UserCapabilityResponse(BaseModel):
    userId: str
    capabilities: List[CapabilityLevel]
    overallLevel: int
    lastUpdated: str


@router.get("/{user_id}/capability", response_model=UserCapabilityResponse)
@offload_database
def get_user_capability(user_id: str, user: dict = Depends(require_user)):
    """Get user's capability levels based on evidence and skills."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only view own capability")
    
    # Check user exists
    user_row = storage.fetchone(
        "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
        (user_id,),
    )
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get evidence count
    evidence_count = storage.fetchone(
        """
        SELECT COUNT(*) as total FROM evidence e
        JOIN projects p ON p.id = e.project_id
        WHERE p.user_id = ? AND p.deleted_at IS NULL
        """,
        (user_id,),
    )["total"]
    
    # Get skills count
    skills_count = storage.fetchone(
        "SELECT COUNT(*) as total FROM developer_skills WHERE user_id = ?",
        (user_id,),
    )["total"]
    
    # Calculate overall level (simple heuristic)
    overall = min(10, (evidence_count // 10) + (skills_count // 2))
    
    # Generate capability categories
    capabilities = [
        {
            "category": "Technical Skills",
            "level": min(10, skills_count),
            "evidenceCount": skills_count,
            "confidence": 0.8,
        },
        {
            "category": "Project Experience",
            "level": min(10, evidence_count // 5),
            "evidenceCount": evidence_count,
            "confidence": 0.9,
        },
    ]
    
    return {
        "userId": user_id,
        "capabilities": capabilities,
        "overallLevel": overall,
        "lastUpdated": utc_now_iso(),
    }


@router.post("/{user_id}/capability/refresh", response_model=UserCapabilityResponse)
@offload_database
def refresh_capability(user_id: str, user: dict = Depends(require_user)):
    """Refresh user's capability calculation."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only refresh own capability")
    
    # Check user exists
    user_row = storage.fetchone(
        "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
        (user_id,),
    )
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get evidence count
    evidence_count = storage.fetchone(
        """
        SELECT COUNT(*) as total FROM evidence e
        JOIN projects p ON p.id = e.project_id
        WHERE p.user_id = ? AND p.deleted_at IS NULL
        """,
        (user_id,),
    )["total"]
    
    # Get skills count
    skills_count = storage.fetchone(
        "SELECT COUNT(*) as total FROM developer_skills WHERE user_id = ?",
        (user_id,),
    )["total"]
    
    # Calculate overall level (simple heuristic)
    overall = min(10, (evidence_count // 10) + (skills_count // 2))
    
    # Generate capability categories
    capabilities = [
        {
            "category": "Technical Skills",
            "level": min(10, skills_count),
            "evidenceCount": skills_count,
            "confidence": 0.8,
        },
        {
            "category": "Project Experience",
            "level": min(10, evidence_count // 5),
            "evidenceCount": evidence_count,
            "confidence": 0.9,
        },
    ]
    
    return {
        "userId": user_id,
        "capabilities": capabilities,
        "overallLevel": overall,
        "lastUpdated": utc_now_iso(),
    }


@router.get("/{user_id}/goals", response_model=UserGoalsResponse)
@offload_database
def get_user_goals(user_id: str, user: dict = Depends(require_user)):
    """Get user goals."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only view own goals")
    
    # Goals might be stored in user record or separate table
    # For now, return empty list (placeholder)
    return {"goals": []}


@router.patch("/{user_id}/goals", response_model=UserGoalsResponse)
@offload_database
def update_user_goals(user_id: str, request: UserGoalsUpdate, user: dict = Depends(require_user)):
    """Update user goals."""
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Can only update own goals")
    
    # Placeholder - would store goals somewhere
    return {"goals": request.goals}
