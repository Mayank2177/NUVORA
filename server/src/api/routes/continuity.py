"""Continuity, provenance, skill, and portable export endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from src.api.routes.auth import require_user
from src.api.concurrency import offload_database
from src.domain.context import load_project_context
from src.domain.guidance import evaluate_guidance
from src.domain.project_markdown import generate_project_markdown
from src.domain.skills import compute_skill_claims
from src.schemas.continuity import (
    EvidenceChainResponse,
    GuidanceResponse,
    SkillClaimsResponse,
)
from src.storage.instance import storage
from src.storage.utils import utc_now_iso

router = APIRouter(
    prefix="/api/projects/{project_id}/continuity", tags=["continuity"]
)


@router.get("/guidance", response_model=GuidanceResponse)
@offload_database
def project_guidance(project_id: str, user: dict = Depends(require_user)):
    context = load_project_context(storage, project_id, user["id"])
    suggestions = evaluate_guidance(**context)
    return GuidanceResponse(
        projectId=project_id,
        suggestions=suggestions,
        generatedAt=utc_now_iso(),
    )


@router.get("/skills", response_model=SkillClaimsResponse)
@offload_database
def project_skills(project_id: str, user: dict = Depends(require_user)):
    context = load_project_context(storage, project_id, user["id"])
    claims = compute_skill_claims(
        context["project"].get("stack") or [],
        context["commits"],
        context["evidence"],
    )
    return SkillClaimsResponse(
        projectId=project_id,
        claims=claims,
        generatedAt=utc_now_iso(),
    )


@router.get("/evidence-chain", response_model=EvidenceChainResponse)
@offload_database
def project_evidence_chain(
    project_id: str, user: dict = Depends(require_user)
):
    storage.owned_project(project_id, user["id"])
    chain = storage.evidence_chain(project_id)
    return EvidenceChainResponse(projectId=project_id, **chain)


@router.get("/project.md", response_class=PlainTextResponse)
@offload_database
def project_markdown(project_id: str, user: dict = Depends(require_user)):
    context = load_project_context(storage, project_id, user["id"])
    suggestions = evaluate_guidance(**context)
    markdown = generate_project_markdown(
        context["project"],
        context["commits"],
        context["evidence"],
        suggestions,
    )
    return PlainTextResponse(
        markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="PROJECT.md"'},
    )