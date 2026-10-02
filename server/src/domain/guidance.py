"""Deterministic next-action guidance for a NUVORA project."""
from __future__ import annotations

from typing import Any


def evaluate_guidance(
    project: dict[str, Any],
    commits: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    proofs = [item for item in evidence if item.get("kind") == "proof"]
    verified = [item for item in proofs if item.get("verified")]
    snags = [item for item in evidence if item.get("kind") == "snag"]
    resources = [item for item in evidence if item.get("kind") == "resource"]
    ai_items = [item for item in evidence if item.get("ai_assisted")]

    if not (project.get("summary") or "").strip():
        suggestions.append(
            {
                "code": "summary-missing",
                "priority": "high",
                "action": "Write a concise project summary",
                "reason": "A public project needs a clear problem, approach, and outcome.",
                "evidenceIds": [],
            }
        )
    if not project.get("repo"):
        suggestions.append(
            {
                "code": "repository-missing",
                "priority": "medium",
                "action": "Connect the source repository",
                "reason": "Repository provenance makes commits and evidence independently reviewable.",
                "evidenceIds": [],
            }
        )
    if commits and not proofs:
        suggestions.append(
            {
                "code": "proof-missing",
                "priority": "high",
                "action": "Attach test results or another proof artifact",
                "reason": f"The project has {len(commits)} commit(s) but no proof evidence.",
                "evidenceIds": [],
            }
        )
    if proofs and not verified:
        suggestions.append(
            {
                "code": "proof-unverified",
                "priority": "medium",
                "action": "Verify at least one proof artifact",
                "reason": "Proof evidence exists, but none is marked as independently verified.",
                "evidenceIds": [item["id"] for item in proofs[:5]],
            }
        )
    if ai_items and not any(item.get("verified") for item in ai_items):
        suggestions.append(
            {
                "code": "ai-review-missing",
                "priority": "high",
                "action": "Review and verify AI-assisted evidence",
                "reason": "AI-assisted artifacts require explicit human verification before publication.",
                "evidenceIds": [item["id"] for item in ai_items[:5]],
            }
        )
    if snags and not verified:
        suggestions.append(
            {
                "code": "snag-resolution-proof",
                "priority": "medium",
                "action": "Record proof that the documented snag was resolved",
                "reason": "A challenge is recorded without corresponding verified proof.",
                "evidenceIds": [item["id"] for item in snags[:5]],
            }
        )
    if not resources:
        suggestions.append(
            {
                "code": "resources-missing",
                "priority": "low",
                "action": "Add the most important learning resource",
                "reason": "Resource provenance helps explain how the work was developed.",
                "evidenceIds": [],
            }
        )
    return suggestions