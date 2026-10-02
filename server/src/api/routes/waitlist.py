"""Waitlist endpoints for NUVORA pre-launch."""
from typing import List
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, EmailStr, Field
import sqlite3

from storage.instance import storage
from storage.utils import new_id, utc_now_iso
from api.routes.auth import require_admin
from api.concurrency import offload_database

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])

# Request/Response Models
class WaitlistJoinRequest(BaseModel):
    email: EmailStr
    tools: str = Field(default="", max_length=1000)


class WaitlistJoinResponse(BaseModel):
    email: str
    joinedAt: str


class WaitlistEntry(BaseModel):
    email: str
    tools: str = ""
    joinedAt: str


class WaitlistListResponse(BaseModel):
    entries: List[WaitlistEntry]
    pagination: dict


# Endpoints
@router.post("", status_code=201, response_model=WaitlistJoinResponse)
@offload_database
def join_waitlist(request: WaitlistJoinRequest):
    """Join the waitlist (no auth required)."""
    email = str(request.email).strip().lower()
    existing = storage.fetchone(
        "SELECT email, joined_at FROM waitlist WHERE email = ?", (email,)
    )
    
    if existing:
        return WaitlistJoinResponse(email=existing["email"], joinedAt=existing["joined_at"])
    
    wid = new_id("wait")
    now = utc_now_iso()
    
    try:
        storage.execute(
            "INSERT INTO waitlist (id, email, tools, joined_at) VALUES (?, ?, ?, ?)",
            (wid, email, request.tools, now),
        )
    except sqlite3.IntegrityError:
        existing = storage.fetchone(
            "SELECT email, joined_at FROM waitlist WHERE email = ?", (email,)
        )
        if existing:
            return WaitlistJoinResponse(
                email=existing["email"], joinedAt=existing["joined_at"]
            )
        raise HTTPException(status_code=503, detail="Waitlist temporarily unavailable")
    
    return WaitlistJoinResponse(email=email, joinedAt=now)


@router.get("", response_model=WaitlistListResponse)
@offload_database
def list_waitlist(
    page: int = Query(1, ge=1, le=10000),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(require_admin),
):
    """Get all waitlist entries (admin only)."""
    offset = (page - 1) * limit
    rows = storage.fetchall(
        "SELECT *, COUNT(*) OVER() AS total_count FROM waitlist "
        "ORDER BY joined_at DESC LIMIT ? OFFSET ?",
        (limit, offset)
    )
    if rows:
        total = int(rows[0]["total_count"])
    elif offset == 0:
        total = 0
    else:
        total_row = storage.fetchone("SELECT COUNT(*) as total FROM waitlist")
        total = int(total_row["total"] if total_row else 0)
    
    return WaitlistListResponse(
        entries=[{
            "email": r["email"],
            "tools": r["tools"] or "",
            "joinedAt": r["joined_at"],
        } for r in rows],
        pagination={
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": (total + limit - 1) // limit if total else 0
        }
    )
