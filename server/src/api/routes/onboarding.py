"""Developer and employer onboarding endpoints."""
from typing import List, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator

from src.storage.instance import storage
from src.storage.sql import UPDATE_FIELDS, build_update
from src.storage.utils import utc_now_iso, json_dumps, json_loads
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


# Request/Response Models - Developer
class SkillInput(BaseModel):
    name: str
    level: str = Field(pattern="^(Beginner|Intermediate|Advanced)$")


class DeveloperProfileCreate(BaseModel):
    name: Optional[str] = None
    goals: List[str] = Field(default_factory=list, max_length=10)
    interests: List[str] = Field(default_factory=list, max_length=20)
    skills: List[SkillInput] = Field(default_factory=list, max_length=30)
    githubHandle: str = Field(default="", max_length=39, pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?$")
    openToWork: bool = False


class DeveloperProfileUpdate(BaseModel):
    name: Optional[str] = None
    goals: Optional[List[str]] = Field(default=None, max_length=10)
    interests: Optional[List[str]] = Field(default=None, max_length=20)
    skills: Optional[List[SkillInput]] = Field(default=None, max_length=30)
    githubHandle: Optional[str] = Field(default=None, max_length=39, pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?$")
    openToWork: Optional[bool] = None


class DeveloperProfileResponse(BaseModel):
    userId: str
    name: Optional[str]
    goals: List[str]
    interests: List[str]
    skills: List[dict]
    githubHandle: str
    openToWork: bool
    completedAt: str
    createdAt: str
    updatedAt: str


# Request/Response Models - Employer
class EmployerProfileCreate(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    industry: str = Field(min_length=1, max_length=100)
    teamSize: str = Field(min_length=1, max_length=50)
    website: str = Field(default="", max_length=500)
    needs: List[str] = Field(default_factory=list, max_length=20)

    @field_validator("website")
    @classmethod
    def _safe_website(cls, value: str) -> str:
        if not value:
            return value
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Website must be an http(s) URL without embedded credentials")
        return value.strip()


class EmployerProfileUpdate(BaseModel):
    company: Optional[str] = Field(default=None, min_length=1, max_length=200)
    industry: Optional[str] = Field(default=None, min_length=1, max_length=100)
    teamSize: Optional[str] = Field(default=None, min_length=1, max_length=50)
    website: Optional[str] = Field(default=None, max_length=500)
    needs: Optional[List[str]] = Field(default=None, max_length=20)

    @field_validator("website")
    @classmethod
    def _safe_website(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Website must be an http(s) URL without embedded credentials")
        return value.strip()


class EmployerProfileResponse(BaseModel):
    userId: str
    company: str
    industry: str
    teamSize: str
    website: str
    needs: List[str]
    completedAt: str
    createdAt: str
    updatedAt: str


# Helper functions
def _serialize_developer_profile(row) -> dict:
    """Convert database row to developer profile response format."""
    return {
        "userId": row["user_id"],
        "name": row["name"] if "name" in row.keys() and row["name"] else None,
        "goals": json_loads(row["goals"], []),
        "interests": json_loads(row["interests"], []),
        "skills": json_loads(row["skills"], []),
        "githubHandle": row["github_handle"] if "github_handle" in row.keys() else "",
        "openToWork": bool(row["open_to_work"]),
        "completedAt": row["completed_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _serialize_employer_profile(row) -> dict:
    """Convert database row to employer profile response format."""
    return {
        "userId": row["user_id"],
        "company": row["company"],
        "industry": row["industry"],
        "teamSize": row["team_size"],
        "website": row["website"] if "website" in row.keys() else "",
        "needs": json_loads(row["needs"], []),
        "completedAt": row["completed_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


# Developer Endpoints
@router.post("/developer", status_code=201, response_model=DeveloperProfileResponse)
@offload_database
def create_developer_profile(
    request: DeveloperProfileCreate,
    user: dict = Depends(require_user),
):
    """Create or update developer onboarding profile."""
    if user.get("role") != "developer":
        raise HTTPException(status_code=403, detail="Developer account required")
    # Check if profile already exists
    existing = storage.fetchone(
        "SELECT * FROM developer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    
    now = utc_now_iso()
    skills_json = json_dumps([{"name": s.name, "level": s.level} for s in request.skills])
    
    if existing:
        # Update existing profile
        storage.execute(
            """
            UPDATE developer_profiles
            SET name = ?, goals = ?, interests = ?, skills = ?, github_handle = ?,
                open_to_work = ?, completed_at = ?, updated_at = ?
            WHERE user_id = ?
            """,
            (
                request.name,
                json_dumps(request.goals),
                json_dumps(request.interests),
                skills_json,
                request.githubHandle,
                1 if request.openToWork else 0,
                now,
                now,
                user["id"],
            ),
        )
    else:
        # Create new profile
        storage.execute(
            """
            INSERT INTO developer_profiles (
                user_id, name, goals, interests, skills, github_handle,
                open_to_work, completed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                request.name,
                json_dumps(request.goals),
                json_dumps(request.interests),
                skills_json,
                request.githubHandle,
                1 if request.openToWork else 0,
                now,
                now,
                now,
            ),
        )
    
    row = storage.fetchone(
        "SELECT * FROM developer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    return _serialize_developer_profile(row)


@router.get("/developer", response_model=DeveloperProfileResponse)
@offload_database
def get_developer_profile(user: dict = Depends(require_user)):
    """Get current user's developer profile."""
    if user.get("role") != "developer":
        raise HTTPException(status_code=403, detail="Developer account required")
    row = storage.fetchone(
        "SELECT * FROM developer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    
    if not row:
        raise HTTPException(status_code=404, detail="Developer profile not found")
    
    return _serialize_developer_profile(row)


@router.get("/developer/{user_id}", response_model=DeveloperProfileResponse)
@offload_database
def get_developer_profile_by_id(user_id: str, user: dict = Depends(require_user)):
    """Get developer profile by user ID."""
    if user["id"] != user_id and user.get("role") != "employer":
        raise HTTPException(status_code=404, detail="Developer profile not found")
    row = storage.fetchone(
        """SELECT dp.* FROM developer_profiles dp
           JOIN users u ON u.id = dp.user_id
           WHERE dp.user_id = ? AND u.role = 'developer' AND u.deleted_at IS NULL""",
        (user_id,),
    )
    
    if not row:
        raise HTTPException(status_code=404, detail="Developer profile not found")
    if user["id"] != user_id and not row["open_to_work"]:
        raise HTTPException(status_code=404, detail="Developer profile not found")
    
    return _serialize_developer_profile(row)


@router.patch("/developer", response_model=DeveloperProfileResponse)
@offload_database
def update_developer_profile(
    request: DeveloperProfileUpdate,
    user: dict = Depends(require_user),
):
    """Update developer profile."""
    if user.get("role") != "developer":
        raise HTTPException(status_code=403, detail="Developer account required")
    # Check if profile exists
    existing = storage.fetchone(
        "SELECT * FROM developer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    
    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Developer profile not found. Create one first.",
        )
    
    # Build update query dynamically
    updates = {}
    if request.name is not None:
        updates["name"] = request.name
    if request.goals is not None:
        updates["goals"] = json_dumps(request.goals)
    if request.interests is not None:
        updates["interests"] = json_dumps(request.interests)
    if request.skills is not None:
        updates["skills"] = json_dumps([{"name": s.name, "level": s.level} for s in request.skills])
    if request.githubHandle is not None:
        updates["github_handle"] = request.githubHandle
    if request.openToWork is not None:
        updates["open_to_work"] = 1 if request.openToWork else 0
    
    if not updates:
        return _serialize_developer_profile(existing)
    
    updates["updated_at"] = utc_now_iso()
    
    statement, values = build_update("developer_profiles", UPDATE_FIELDS["developer_profiles"], updates)
    
    storage.execute(
        f"{statement} WHERE user_id = ?",
        values + (user["id"],),
    )
    
    updated_row = storage.fetchone(
        "SELECT * FROM developer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    return _serialize_developer_profile(updated_row)


# Employer Endpoints
@router.post("/employer", status_code=201, response_model=EmployerProfileResponse)
@offload_database
def create_employer_profile(
    request: EmployerProfileCreate,
    user: dict = Depends(require_user),
):
    """Create or update employer onboarding profile."""
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Employer account required")
    # Check if profile already exists
    existing = storage.fetchone(
        "SELECT * FROM employer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    
    now = utc_now_iso()
    
    if existing:
        # Update existing profile
        storage.execute(
            """
            UPDATE employer_profiles
            SET company = ?, industry = ?, team_size = ?, website = ?,
                needs = ?, completed_at = ?, updated_at = ?
            WHERE user_id = ?
            """,
            (
                request.company,
                request.industry,
                request.teamSize,
                request.website,
                json_dumps(request.needs),
                now,
                now,
                user["id"],
            ),
        )
    else:
        # Create new profile
        storage.execute(
            """
            INSERT INTO employer_profiles (
                user_id, company, industry, team_size, website, needs,
                completed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                request.company,
                request.industry,
                request.teamSize,
                request.website,
                json_dumps(request.needs),
                now,
                now,
                now,
            ),
        )
    
    row = storage.fetchone(
        "SELECT * FROM employer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    return _serialize_employer_profile(row)


@router.get("/employer", response_model=EmployerProfileResponse)
@offload_database
def get_employer_profile(user: dict = Depends(require_user)):
    """Get current user's employer profile."""
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Employer account required")
    row = storage.fetchone(
        "SELECT * FROM employer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    
    if not row:
        raise HTTPException(status_code=404, detail="Employer profile not found")
    
    return _serialize_employer_profile(row)


@router.get("/employer/{user_id}", response_model=EmployerProfileResponse)
@offload_database
def get_employer_profile_by_id(user_id: str, user: dict = Depends(require_user)):
    """Get employer profile by user ID."""
    if user["id"] != user_id:
        raise HTTPException(status_code=404, detail="Employer profile not found")
    row = storage.fetchone(
        "SELECT * FROM employer_profiles WHERE user_id = ?",
        (user_id,),
    )
    
    if not row:
        raise HTTPException(status_code=404, detail="Employer profile not found")
    
    return _serialize_employer_profile(row)


@router.patch("/employer", response_model=EmployerProfileResponse)
@offload_database
def update_employer_profile(
    request: EmployerProfileUpdate,
    user: dict = Depends(require_user),
):
    """Update employer profile."""
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Employer account required")
    # Check if profile exists
    existing = storage.fetchone(
        "SELECT * FROM employer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    
    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Employer profile not found. Create one first.",
        )
    
    # Build update query dynamically
    updates = {}
    if request.company is not None:
        updates["company"] = request.company
    if request.industry is not None:
        updates["industry"] = request.industry
    if request.teamSize is not None:
        updates["team_size"] = request.teamSize
    if request.website is not None:
        updates["website"] = request.website
    if request.needs is not None:
        updates["needs"] = json_dumps(request.needs)
    
    if not updates:
        return _serialize_employer_profile(existing)
    
    updates["updated_at"] = utc_now_iso()
    
    statement, values = build_update("employer_profiles", UPDATE_FIELDS["employer_profiles"], updates)
    
    storage.execute(
        f"{statement} WHERE user_id = ?",
        values + (user["id"],),
    )
    
    updated_row = storage.fetchone(
        "SELECT * FROM employer_profiles WHERE user_id = ?",
        (user["id"],),
    )
    return _serialize_employer_profile(updated_row)
