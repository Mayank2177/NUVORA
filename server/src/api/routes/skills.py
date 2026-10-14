"""Skill verification and capability endpoints."""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from src.storage.instance import storage
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database

router = APIRouter(prefix="/api/skills", tags=["skills"])


# Request/Response Models
class SkillVerificationResponse(BaseModel):
    id: str
    skill: str
    taskTitle: str
    company: str
    at: str


class SkillVerificationListResponse(BaseModel):
    verifications: List[SkillVerificationResponse]
    total: int


# Helper functions
def _serialize_verification(row) -> dict:
    """Convert database row to verification response format."""
    return {
        "id": row["id"],
        "skill": row["skill_name"],
        "taskTitle": row["task_title"],
        "company": row["company"],
        "at": row["verified_at"],
    }


# Endpoints
@router.get("/verifications", response_model=SkillVerificationListResponse)
@offload_database
def list_verifications(
    user_id: Optional[str] = Query(None),
    skill_name: Optional[str] = Query(None),
    user: dict = Depends(require_user),
):
    """List skill verifications with optional filters."""
    query = "SELECT * FROM skill_verifications WHERE 1=1"
    params = []
    
    # If user_id is not provided, default to current user
    target_user = user_id if user_id else user["id"]
    query += " AND user_id = ?"
    params.append(target_user)
    
    if skill_name:
        query += " AND skill_name = ?"
        params.append(skill_name)
    
    query += " ORDER BY verified_at DESC"
    
    rows = storage.fetchall(query, tuple(params))
    
    return {
        "verifications": [_serialize_verification(row) for row in rows],
        "total": len(rows),
    }


@router.get("/verifications/{verification_id}", response_model=SkillVerificationResponse)
@offload_database
def get_verification(verification_id: str, user: dict = Depends(require_user)):
    """Get verification details by ID."""
    row = storage.fetchone("SELECT * FROM skill_verifications WHERE id = ?", (verification_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Verification not found")
    
    return _serialize_verification(row)
