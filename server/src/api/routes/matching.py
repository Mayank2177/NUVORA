"""Matching and ranking endpoints for task-developer matching."""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from src.storage.instance import storage
from src.storage.utils import new_id, utc_now_iso, json_loads
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database

router = APIRouter(prefix="/api", tags=["matching"])


# Request/Response Models
class DeveloperCandidate(BaseModel):
    userId: str
    name: str
    username: str
    avatarUrl: Optional[str]
    score: float
    skillMatch: float
    evidenceMatch: float
    availabilityMatch: float
    topSkills: List[str]


class CandidatesResponse(BaseModel):
    taskId: str
    candidates: List[DeveloperCandidate]


class MatchScore(BaseModel):
    taskId: str
    developerId: str
    score: float
    skillMatch: float
    evidenceMatch: float
    availabilityMatch: float
    calculatedAt: str


# Helper functions
def calculate_match_score(task_skills: List[str], developer_skills: List[dict]) -> float:
    """Calculate skill match score between task and developer."""
    if not task_skills:
        return 50.0  # Neutral score if no skills specified
    
    developer_skill_names = {s["skill_name"].lower() for s in developer_skills}
    task_skill_set = {s.lower() for s in task_skills}
    
    if not task_skill_set:
        return 50.0
    
    matching_skills = task_skill_set.intersection(developer_skill_names)
    match_ratio = len(matching_skills) / len(task_skill_set)
    
    return match_ratio * 100.0


def calculate_evidence_match(developer_id: str) -> float:
    """Calculate evidence quality score for developer."""
    evidence_count = storage.fetchone(
        """
        SELECT COUNT(*) as count FROM evidence e
        JOIN projects p ON p.id = e.project_id
        WHERE p.user_id = ? AND p.deleted_at IS NULL
          AND e.verified = 1 AND e.publish = 1
        """,
        (developer_id,),
    )
    
    count = evidence_count["count"]
    
    # Score based on evidence count (logarithmic scale)
    if count == 0:
        return 0.0
    elif count < 5:
        return 20.0
    elif count < 10:
        return 40.0
    elif count < 20:
        return 60.0
    elif count < 50:
        return 80.0
    else:
        return 100.0


def calculate_availability_match(developer_id: str) -> float:
    """Calculate availability score (based on active applications)."""
    # Count pending/active applications
    active_count = storage.fetchone(
        """
        SELECT COUNT(*) as count FROM task_applications
        WHERE developer_id = ? AND status IN ('pending', 'accepted')
        """,
        (developer_id,),
    )
    
    count = active_count["count"]
    
    # Lower active applications = higher availability
    if count == 0:
        return 100.0
    elif count == 1:
        return 80.0
    elif count == 2:
        return 60.0
    elif count == 3:
        return 40.0
    elif count == 4:
        return 20.0
    else:
        return 10.0


def compute_and_store_match(task_id: str, developer_id: str, task_skills: List[str]) -> dict:
    """Compute match score and store it."""
    # Get developer skills
    dev_skills = storage.fetchall(
        "SELECT * FROM developer_skills WHERE user_id = ?",
        (developer_id,),
    )
    
    skill_match = calculate_match_score(task_skills, [dict(s) for s in dev_skills])
    evidence_match = calculate_evidence_match(developer_id)
    availability_match = calculate_availability_match(developer_id)
    
    # Overall score is weighted average
    overall_score = (
        skill_match * 0.5 +          # 50% weight on skills
        evidence_match * 0.3 +       # 30% weight on evidence
        availability_match * 0.2     # 20% weight on availability
    )
    
    now = utc_now_iso()
    
    # Store or update match score
    existing = storage.fetchone(
        "SELECT * FROM match_scores WHERE task_id = ? AND developer_id = ?",
        (task_id, developer_id),
    )
    
    if existing:
        storage.execute(
            """
            UPDATE match_scores
            SET score = ?, skill_match = ?, evidence_match = ?,
                availability_match = ?, calculated_at = ?
            WHERE task_id = ? AND developer_id = ?
            """,
            (overall_score, skill_match, evidence_match, availability_match, now, task_id, developer_id),
        )
    else:
        storage.execute(
            """
            INSERT INTO match_scores (
                id, task_id, developer_id, score, skill_match,
                evidence_match, availability_match, calculated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (new_id("mch"), task_id, developer_id, overall_score, skill_match,
             evidence_match, availability_match, now),
        )
    
    return {
        "score": overall_score,
        "skillMatch": skill_match,
        "evidenceMatch": evidence_match,
        "availabilityMatch": availability_match,
        "calculatedAt": now,
    }


# Endpoints
@router.get("/tasks/{task_id}/candidates", response_model=CandidatesResponse)
@offload_database
def get_candidates(task_id: str, user: dict = Depends(require_user)):
    """Get ranked candidates for a task."""
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Only employers can view candidates")

    # Candidate data is visible only to the employer who owns this task.
    task = storage.fetchone(
        "SELECT * FROM marketplace_tasks WHERE id = ? AND employer_id = ?",
        (task_id, user["id"]),
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get task skills
    task_skills = json_loads(task["skills_required"], [])
    
    # Only include developers who opted in to employer discovery.
    developers = storage.fetchall(
        """
        SELECT DISTINCT u.id, u.name, u.username, u.avatar_url
        FROM users u
        JOIN developer_profiles dp ON dp.user_id = u.id
        WHERE u.role = 'developer' AND u.deleted_at IS NULL AND dp.open_to_work = 1
        """,
    )
    
    candidates = []
    
    for dev in developers:
        # Compute or get cached match score
        match_data = compute_and_store_match(task_id, dev["id"], task_skills)
        
        # Get top skills for developer
        dev_skills = storage.fetchall(
            """
            SELECT skill_name FROM developer_skills
            WHERE user_id = ?
            ORDER BY level DESC, skill_name ASC
            LIMIT 5
            """,
            (dev["id"],),
        )
        
        candidates.append({
            "userId": dev["id"],
            "name": dev["name"],
            "username": dev["username"],
            "avatarUrl": dev["avatar_url"],
            "score": match_data["score"],
            "skillMatch": match_data["skillMatch"],
            "evidenceMatch": match_data["evidenceMatch"],
            "availabilityMatch": match_data["availabilityMatch"],
            "topSkills": [s["skill_name"] for s in dev_skills],
        })
    
    # Sort by score descending
    candidates.sort(key=lambda x: x["score"], reverse=True)
    
    # Limit to top 50
    candidates = candidates[:50]
    
    return {"taskId": task_id, "candidates": candidates}


@router.get("/match/score/{developer_id}/{task_id}", response_model=MatchScore)
@offload_database
def get_match_score(developer_id: str, task_id: str, user: dict = Depends(require_user)):
    """Get match score between a developer and task."""
    if user.get("role") != "employer":
        raise HTTPException(status_code=403, detail="Only employers can view match scores")

    task = storage.fetchone(
        "SELECT * FROM marketplace_tasks WHERE id = ? AND employer_id = ?",
        (task_id, user["id"]),
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check developer exists
    developer = storage.fetchone(
        """SELECT * FROM users
        WHERE id = ? AND role = 'developer' AND deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM developer_profiles
              WHERE developer_profiles.user_id = users.id
                AND developer_profiles.open_to_work = 1
          )""",
        (developer_id,),
    )
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    
    # Get or compute match score
    existing = storage.fetchone(
        "SELECT * FROM match_scores WHERE task_id = ? AND developer_id = ?",
        (task_id, developer_id),
    )
    
    if existing:
        return {
            "taskId": task_id,
            "developerId": developer_id,
            "score": existing["score"],
            "skillMatch": existing["skill_match"],
            "evidenceMatch": existing["evidence_match"],
            "availabilityMatch": existing["availability_match"],
            "calculatedAt": existing["calculated_at"],
        }
    else:
        # Compute new score
        task_skills = json_loads(task["skills_required"], [])
        match_data = compute_and_store_match(task_id, developer_id, task_skills)
        
        return {
            "taskId": task_id,
            "developerId": developer_id,
            "score": match_data["score"],
            "skillMatch": match_data["skillMatch"],
            "evidenceMatch": match_data["evidenceMatch"],
            "availabilityMatch": match_data["availabilityMatch"],
            "calculatedAt": match_data["calculatedAt"],
        }
