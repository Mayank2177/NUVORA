"""Analytics endpoints for NUVORA project insights."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from storage.instance import storage
from api.routes.auth import require_user
from api.concurrency import offload_database

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

    aggregate = storage.fetchone(
        """
        SELECT
            projects.id,
            projects.created_at,

            COUNT(evidence.id) AS evidence_count,

            SUM(
                CASE
                    WHEN evidence.ai_assisted = 1 THEN 1
                    ELSE 0
                END
            ) AS ai_assisted_count,

            SUM(
                CASE
                    WHEN evidence.kind = 'snag'
                     AND evidence.verified = 0
                    THEN 1
                    ELSE 0
                END
            ) AS open_blockers,

            SUM(
                CASE
                    WHEN evidence.kind = 'snag'
                     AND evidence.verified = 1
                    THEN 1
                    ELSE 0
                END
            ) AS resolved_blockers

        FROM projects

        LEFT JOIN evidence
            ON evidence.project_id = projects.id

        WHERE projects.id = ?
          AND projects.user_id = ?
          AND projects.deleted_at IS NULL

        GROUP BY
            projects.id,
            projects.created_at
        """,
        (project_id, user["id"]),
    )

    if not aggregate:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    evidence_count = int(aggregate["evidence_count"] or 0)
    ai_assisted_count = int(aggregate["ai_assisted_count"] or 0)
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
    created_at = aggregate["created_at"]

    if created_at:
        from datetime import datetime, timezone

        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        days_on_project = max(
            0,
            (datetime.now(timezone.utc) - created_at).days,
        )
    else:
        days_on_project = 0

    return ProjectAnalyticsResponse(
        progress=ProjectProgress(
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