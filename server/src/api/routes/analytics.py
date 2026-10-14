"""Analytics endpoints for NUVORA project insights."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import json

from src.storage.instance import storage
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database
from src.workers.queue import redis_client
from src.storage.utils import parse_iso

router = APIRouter(prefix="/api/projects/{project_id}/analytics", tags=["analytics"])

# Response Models
class EvidenceByKind(BaseModel):
    resource: int
    snag: int
    proof: int
    ai: int


class ProgressResponse(BaseModel):
    percentage: float


class ProjectAnalyticsResponse(BaseModel):
    progress: ProgressResponse
    evidenceItems: int
    aiAssisted: int
    openBlockers: int
    resolvedBlockers: int
    daysOnProject: int
    stage: int
    totalStages: int

@router.get("", response_model=ProjectAnalyticsResponse)
@offload_database
def get_project_analytics(
    project_id: str,
    user: dict = Depends(require_user),
):
    """Get project progress analytics."""

    project = storage.fetchone(
        "SELECT id, created_at FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
        (project_id, user["id"]),
    )
    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    aggregate = None
    try:
        cached = redis_client().get(f"nuvora:analytics:{project_id}")
        aggregate = json.loads(cached) if cached else None
    except Exception:
        # Redis is an optimization; requests still work while it is unavailable.
        pass
    if not isinstance(aggregate, dict):
        aggregate = storage.fetchone(
            """
            SELECT COUNT(e.id) AS evidence_items,
                   SUM(CASE WHEN e.ai_assisted = 1 THEN 1 ELSE 0 END) AS ai_assisted,
                   SUM(CASE WHEN e.kind = 'snag' AND e.verified = 0 THEN 1 ELSE 0 END) AS open_blockers,
                   SUM(CASE WHEN e.kind = 'snag' AND e.verified = 1 THEN 1 ELSE 0 END) AS resolved_blockers
            FROM evidence e WHERE e.project_id = ?
            """,
            (project_id,),
        )
        aggregate = dict(aggregate) if aggregate else {}

    evidence_count = int(aggregate.get("evidence_items") or 0)
    ai_assisted_count = int(aggregate.get("ai_assisted") or 0)
    open_blockers = int(aggregate["open_blockers"] or 0)
    resolved_blockers = int(aggregate["resolved_blockers"] or 0)

    # Example progress calculation.
    # Replace this with your actual project-stage/progress logic.
    total_blockers = open_blockers + resolved_blockers

    if total_blockers:
        progress = (
            resolved_blockers / total_blockers
        ) * 100.0
    else:
        progress = 0.0

    # Calculate project age.
    created_at = project["created_at"]

    if created_at:
        from datetime import datetime, timezone

        if isinstance(created_at, str):
            created_at = parse_iso(created_at)
        if created_at is None:
            days_on_project = 0
        else:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            days_on_project = max(0, (datetime.now(timezone.utc) - created_at).days)
    else:
        days_on_project = 0

    return ProjectAnalyticsResponse(
        progress=ProgressResponse(
            percentage=round(progress, 1)
        ),
        evidenceItems=evidence_count,
        aiAssisted=ai_assisted_count,
        openBlockers=open_blockers,
        resolvedBlockers=resolved_blockers,
        daysOnProject=days_on_project,
        stage=10,        # Replace with actual stage
        totalStages=14  # Replace with actual stage count
    )
