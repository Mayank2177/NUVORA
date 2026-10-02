"""Evidence management endpoints for NUVORA."""
from typing import Annotated, Literal, Optional, List, Any
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from storage.instance import storage
from storage.utils import (
    decode_cursor,
    encode_cursor,
    new_uuid,
    normalize_iso_timestamp,
    utc_now_iso,
)
from storage.security import scan_content
from api.routes.auth import require_user
from api.concurrency import offload_database
from schemas.journey import EvidenceType, Provenance, Stage

router = APIRouter(prefix="/api/projects/{project_id}/evidence", tags=["evidence"])
# ID-scoped routes required by the frontend contract (toggle-public / delete by ID)
id_router = APIRouter(prefix="/api/evidence", tags=["evidence"])

# Canonical type -> legacy `kind` column (NOT NULL CHECK); type/provenance/stage hold the real values.
_KIND_FOR_TYPE = {
    "Commit": "proof", "Pull request": "proof", "Test": "proof", "Screenshot": "proof",
    "Decision": "resource", "Learning": "resource", "AI session": "ai", "Blocker resolved": "snag",
}

# Request/Response Models
class EvidenceCreate(BaseModel):
    kind: Literal["resource", "snag", "proof", "ai"]
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=20000)
    source: str = Field(default="", max_length=1000)
    when: str = Field(max_length=64)
    aiAssisted: bool = False
    verified: bool = False
    publish: bool = False
    sensitive: bool = False

    @field_validator("when")
    @classmethod
    def _valid_when(cls, value: str) -> str:
        return normalize_iso_timestamp(value)

    @field_validator("title")
    @classmethod
    def _nonblank_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be blank")
        return value


class CanonicalEvidenceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: EvidenceType
    text: str = Field(min_length=1, max_length=140)
    date: str = Field(max_length=64)
    source: str = Field(default="", max_length=1000)
    provenance: Provenance
    stage: Stage
    public: bool = False

    @field_validator("date")
    @classmethod
    def _valid_date(cls, value: str) -> str:
        return normalize_iso_timestamp(value)

    @field_validator("text")
    @classmethod
    def _nonblank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text cannot be blank")
        return value


class EvidenceUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    body: Optional[str] = Field(default=None, max_length=20000)
    source: Optional[str] = Field(default=None, max_length=1000)
    when: Optional[str] = Field(default=None, max_length=64)
    aiAssisted: Optional[bool] = None
    verified: Optional[bool] = None
    publish: Optional[bool] = None
    sensitive: Optional[bool] = None

    @field_validator("when")
    @classmethod
    def _valid_when(cls, value: Optional[str]) -> Optional[str]:
        return normalize_iso_timestamp(value) if value is not None else None

    @field_validator("title")
    @classmethod
    def _nonblank_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("title cannot be blank")
        return value


class EvidenceResponse(BaseModel):
    id: str
    projectId: str
    kind: str
    title: str
    body: str
    source: str
    when: str
    aiAssisted: bool
    verified: bool
    publish: bool
    sensitive: bool
    commitHash: Optional[str] = None
    createdAt: str
    updatedAt: Optional[str] = None


class EvidenceListResponse(BaseModel):
    evidence: List[EvidenceResponse]
    pagination: dict


class EvidenceScanRequest(BaseModel):
    evidenceIds: Optional[
        List[Annotated[str, Field(min_length=1, max_length=64)]]
    ] = Field(default=None, max_length=100)


class EvidenceScanResult(BaseModel):
    id: str
    reason: str
    matches: List[str]


class EvidenceScanResponse(BaseModel):
    scanned: int
    flagged: List[EvidenceScanResult]
    clear: List[str]


# Endpoints
_PROVENANCE_SQL = "COALESCE(provenance, CASE WHEN ai_assisted = 1 THEN 'AI-assisted' ELSE 'Human' END)"


@router.get("")
@offload_database
def list_evidence(
    project_id: str,
    stage: Optional[Stage] = None,
    type: Optional[EvidenceType] = None,
    provenance: Optional[Provenance] = None,
    public: Optional[bool] = None,
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    order: Literal["asc", "desc"] = "desc",
    user: dict = Depends(require_user),
):
    """List evidence; supplied filters combine with AND and apply before pagination."""
    storage.owned_project(project_id, user["id"])
    where = "WHERE project_id = ?"
    params: List[Any] = [project_id]
    if stage:
        where += " AND stage = ?"; params.append(stage)
    if type:
        where += " AND type = ?"; params.append(type)
    if provenance:
        where += f" AND {_PROVENANCE_SQL} = ?"; params.append(provenance)
    if public is not None:
        where += " AND publish = ?"; params.append(1 if public else 0)
    direction = "ASC" if order == "asc" else "DESC"
    rows = storage.fetchall(
        f"SELECT *, COUNT(*) OVER() AS total_count FROM evidence {where} "
        f"ORDER BY occurred_at {direction}, id {direction} LIMIT ? OFFSET ?",
        tuple(params) + (limit, offset),
    )
    total = int(rows[0]["total_count"]) if rows else int(
        storage.fetchone(f"SELECT COUNT(*) AS total FROM evidence {where}", tuple(params))["total"]
    )
    return {
        "evidence": [storage.evidence_canonical(r) for r in rows],
        "pagination": {"limit": limit, "offset": offset, "total": total,
                       "hasMore": offset + len(rows) < total},
    }


@router.post("", status_code=201)
@offload_database
def create_evidence(project_id: str, request: CanonicalEvidenceCreate, user: dict = Depends(require_user)):
    """Create evidence in the canonical contract."""
    storage.owned_project(project_id, user["id"])
    now, eid = utc_now_iso(), new_uuid()

    def transaction(conn):
        conn.execute(
            """
            INSERT INTO evidence (
              id, project_id, kind, title, body, source, occurred_at, ai_assisted,
              verified, publish, sensitive, commit_hash, created_at, updated_at,
              type, provenance, stage
            ) VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, ?, 0, NULL, ?, ?, ?, ?, ?)
            """,
            (eid, project_id, _KIND_FOR_TYPE[request.type], request.text, request.source,
             request.date, 1 if request.provenance == "AI-assisted" else 0,
             1 if request.public else 0, now, now, request.type, request.provenance, request.stage),
        )
        conn.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
        created = conn.execute("SELECT * FROM evidence WHERE id = ?", (eid,)).fetchone()
        storage.append_evidence_audit(conn, project_id=project_id, evidence_id=eid,
                                      actor_id=user["id"], action="create", payload=dict(created))
        return created

    return {"evidence": storage.evidence_canonical(storage.executemany_tx(transaction))}


def _owned_evidence(conn, evidence_id: str, user_id: str):
    """Resolve evidence by ID with ownership; parent project locked first on PostgreSQL."""
    row = conn.execute(
        "SELECT e.* FROM evidence e JOIN projects p ON p.id = e.project_id "
        "WHERE e.id = ? AND p.user_id = ? AND p.deleted_at IS NULL",
        (evidence_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if storage._postgres_pool is not None:
        conn.execute("SELECT id FROM projects WHERE id = ? FOR UPDATE", (row["project_id"],))
        row = conn.execute("SELECT * FROM evidence WHERE id = ? FOR UPDATE", (evidence_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Evidence not found")
    return row


@id_router.patch("/{evidence_id}/toggle-public")
@offload_database
def toggle_evidence_public(evidence_id: str, user: dict = Depends(require_user)):
    """Atomically invert `public`; audited in the same transaction (E09)."""
    def transaction(conn):
        row = _owned_evidence(conn, evidence_id, user["id"])
        if not row["publish"] and row["sensitive"]:
            raise HTTPException(status_code=409, detail="Sensitive evidence cannot be made public")
        now = utc_now_iso()
        # Single-statement flip: no read-then-write race between concurrent toggles.
        conn.execute("UPDATE evidence SET publish = 1 - publish, updated_at = ? WHERE id = ?", (now, evidence_id))
        updated = conn.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        storage.append_evidence_audit(conn, project_id=row["project_id"], evidence_id=evidence_id,
                                      actor_id=user["id"], action="update", payload=dict(updated))
        return updated
    return {"evidence": storage.evidence_canonical(storage.executemany_tx(transaction))}


@id_router.delete("/{evidence_id}", status_code=204)
@offload_database
def delete_evidence_by_id(evidence_id: str, user: dict = Depends(require_user)):
    """Delete evidence by ID (E10). Audit entry is appended before the row is removed."""
    def transaction(conn):
        row = _owned_evidence(conn, evidence_id, user["id"])
        storage.append_evidence_audit(conn, project_id=row["project_id"], evidence_id=evidence_id,
                                      actor_id=user["id"], action="delete", payload=dict(row))
        conn.execute("DELETE FROM evidence WHERE id = ?", (evidence_id,))
    storage.executemany_tx(transaction)
    return None


@router.get("/{evidence_id}", response_model=EvidenceResponse)
@offload_database
def get_evidence(project_id: str, evidence_id: str, user: dict = Depends(require_user)):
    """Get single evidence item."""
    storage.owned_project(project_id, user["id"])
    
    row = storage.fetchone(
        "SELECT * FROM evidence WHERE id = ? AND project_id = ?",
        (evidence_id, project_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    return storage.evidence_row(row)


@router.patch("/{evidence_id}", response_model=EvidenceResponse)
@offload_database
def update_evidence(
    project_id: str,
    evidence_id: str,
    request: EvidenceUpdate,
    user: dict = Depends(require_user),
):
    """Update evidence item."""
    storage.owned_project(project_id, user["id"])
    
    row = storage.fetchone(
        "SELECT * FROM evidence WHERE id = ? AND project_id = ?",
        (evidence_id, project_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    mapping = {
        "title": request.title.strip() if request.title is not None else None,
        "body": request.body,
        "source": request.source,
        "occurred_at": request.when,
        "ai_assisted": None if request.aiAssisted is None else (1 if request.aiAssisted else 0),
        "verified": None if request.verified is None else (1 if request.verified else 0),
        "publish": None if request.publish is None else (1 if request.publish else 0),
        "sensitive": None if request.sensitive is None else (1 if request.sensitive else 0),
    }
    data = {k: v for k, v in mapping.items() if v is not None}
    
    if not data:
        return storage.evidence_row(row)
    
    data["updated_at"] = utc_now_iso()
    sets = ", ".join(f"{k} = ?" for k in data)
    
    def transaction(conn):
        conn.execute(
            f"UPDATE evidence SET {sets} WHERE id = ?",
            tuple(data.values()) + (evidence_id,),
        )
        updated_row = conn.execute(
            "SELECT * FROM evidence WHERE id = ?", (evidence_id,)
        ).fetchone()
        storage.append_evidence_audit(
            conn,
            project_id=project_id,
            evidence_id=evidence_id,
            actor_id=user["id"],
            action="update",
            payload=dict(updated_row),
        )
        return updated_row

    updated = storage.executemany_tx(transaction)
    return storage.evidence_row(updated)


@router.delete("/{evidence_id}", status_code=204)
@offload_database
def delete_evidence(project_id: str, evidence_id: str, user: dict = Depends(require_user)):
    """Delete evidence item."""
    storage.owned_project(project_id, user["id"])
    
    row = storage.fetchone(
        "SELECT * FROM evidence WHERE id = ? AND project_id = ?",
        (evidence_id, project_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    def transaction(conn):
        storage.append_evidence_audit(
            conn,
            project_id=project_id,
            evidence_id=evidence_id,
            actor_id=user["id"],
            action="delete",
            payload=dict(row),
        )
        conn.execute("DELETE FROM evidence WHERE id = ?", (evidence_id,))

    storage.executemany_tx(transaction)
    return None


@router.post("/scan", response_model=EvidenceScanResponse)
@offload_database
def scan_evidence(project_id: str, request: EvidenceScanRequest, user: dict = Depends(require_user)):
    """Scan selected evidence for sensitive data."""
    storage.owned_project(project_id, user["id"])
    
    # Get evidence to scan
    if request.evidenceIds:
        requested_ids = list(dict.fromkeys(request.evidenceIds))
        placeholders = ",".join("?" * len(requested_ids))
        rows = storage.fetchall(
            f"SELECT * FROM evidence WHERE project_id = ? AND id IN ({placeholders})",
            (project_id,) + tuple(requested_ids),
        )
        if len(rows) != len(requested_ids):
            raise HTTPException(
                status_code=400,
                detail="One or more evidence items do not belong to this project",
            )
    else:
        rows = storage.fetchall(
            "SELECT * FROM evidence WHERE project_id = ?",
            (project_id,),
        )
    
    flagged = []
    clear = []
    
    for r in rows:
        # Scan title, body, and source
        findings = []
        
        title_scan = scan_content(r["title"] or "", f"evidence:{r['id']}/title")
        if title_scan["findings"]:
            findings.extend(title_scan["findings"])
        
        body_scan = scan_content(r["body"] or "", f"evidence:{r['id']}/body")
        if body_scan["findings"]:
            findings.extend(body_scan["findings"])
        
        source_scan = scan_content(r["source"] or "", f"evidence:{r['id']}/source")
        if source_scan["findings"]:
            findings.extend(source_scan["findings"])
        
        if findings:
            # Extract just blocking findings
            blocking = [f for f in findings if f.get("severity") == "block"]
            if blocking:
                flagged.append(EvidenceScanResult(
                    id=r["id"],
                    reason=f"Found {len(blocking)} critical secret(s)",
                    matches=[f"{f['type']}: {f['description']}" for f in blocking[:3]]
                ))
            else:
                clear.append(r["id"])
        else:
            clear.append(r["id"])
    
    return EvidenceScanResponse(
        scanned=len(rows),
        flagged=flagged,
        clear=clear
    )
