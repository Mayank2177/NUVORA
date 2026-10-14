"""Typed contracts for continuity and provenance features."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class GuidanceSuggestion(BaseModel):
    code: str
    priority: Literal["low", "medium", "high"]
    action: str
    reason: str
    evidenceIds: list[str] = Field(default_factory=list)


class GuidanceResponse(BaseModel):
    projectId: str
    suggestions: list[GuidanceSuggestion]
    generatedAt: str


class SkillClaim(BaseModel):
    skill: str
    level: int = Field(ge=0, le=4)
    levelName: str
    evidenceIds: list[str] = Field(default_factory=list)
    reason: str


class SkillClaimsResponse(BaseModel):
    projectId: str
    claims: list[SkillClaim]
    generatedAt: str


class EvidenceChainEntry(BaseModel):
    id: str
    evidenceId: Optional[str] = None
    action: Literal["create", "update", "delete", "baseline"]
    position: int
    prevHash: Optional[str] = None
    entryHash: str
    calculatedHash: str
    matches: bool
    createdAt: str


class EvidenceChainResponse(BaseModel):
    projectId: str
    valid: bool
    totalEntries: int
    genesisHash: Optional[str] = None
    tipHash: Optional[str] = None
    brokenPosition: Optional[int] = None
    entries: list[EvidenceChainEntry] = Field(default_factory=list)


class MCPRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: str | int | None = None
    method: str = Field(min_length=1, max_length=100)
    params: dict[str, Any] = Field(default_factory=dict)