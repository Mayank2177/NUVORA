"""Evidence-backed project skill claims."""
from __future__ import annotations

from typing import Any


LEVEL_NAMES = {
    0: "Listed",
    1: "Supported",
    2: "Applied",
    3: "Demonstrated",
    4: "Verified",
}


def compute_skill_claims(
    stack: list[str], commits: list[dict[str, Any]], evidence: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    claims: list[dict[str, Any]] = []
    for skill in dict.fromkeys(item.strip() for item in stack if item.strip()):
        needle = skill.casefold()
        matched = [
            item
            for item in evidence
            if needle
            in " ".join(
                str(item.get(field) or "") for field in ("title", "body", "source")
            ).casefold()
        ]
        proofs = [item for item in matched if item.get("kind") == "proof"]
        verified = [item for item in proofs if item.get("verified")]
        level = 0
        reason = "The skill is listed in the project stack."
        if matched:
            level, reason = 1, "Project evidence explicitly references this skill."
        if commits:
            level, reason = max(level, 2), "The project includes implementation commits."
        if proofs:
            level, reason = 3, "Proof evidence demonstrates the implemented work."
        if verified:
            level, reason = 4, "Verified proof evidence supports this skill claim."
        claims.append(
            {
                "skill": skill,
                "level": level,
                "levelName": LEVEL_NAMES[level],
                "evidenceIds": [item["id"] for item in (verified or proofs or matched)[:10]],
                "reason": reason,
            }
        )
    return claims