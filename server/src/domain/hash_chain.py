"""Append-only evidence audit-chain primitives."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional


HASHED_FIELDS = (
    "id",
    "project_id",
    "evidence_id",
    "actor_id",
    "action",
    "payload",
    "position",
    "created_at",
)


def canonical_entry(entry: dict[str, Any]) -> str:
    material = {field: entry.get(field) for field in HASHED_FIELDS}
    return json.dumps(
        material, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    )


def compute_entry_hash(prev_hash: Optional[str], entry: dict[str, Any]) -> str:
    material = (prev_hash or "") + canonical_entry(entry)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def verify_chain(entries: list[dict[str, Any]]) -> dict[str, Any]:
    previous: Optional[str] = None
    audit: list[dict[str, Any]] = []
    broken_position: Optional[int] = None

    for entry in entries:
        calculated = compute_entry_hash(previous, entry)
        matches = entry.get("prev_hash") == previous and entry.get("entry_hash") == calculated
        audit.append(
            {
                "id": entry["id"],
                "evidenceId": entry.get("evidence_id"),
                "action": entry["action"],
                "position": int(entry["position"]),
                "prevHash": entry.get("prev_hash"),
                "entryHash": entry["entry_hash"],
                "calculatedHash": calculated,
                "matches": matches,
                "createdAt": entry["created_at"],
            }
        )
        if not matches and broken_position is None:
            broken_position = int(entry["position"])
            break
        previous = entry["entry_hash"]

    return {
        "valid": broken_position is None,
        "totalEntries": len(entries),
        "genesisHash": entries[0]["entry_hash"] if entries else None,
        "tipHash": entries[-1]["entry_hash"] if entries else None,
        "brokenPosition": broken_position,
        "entries": audit,
    }