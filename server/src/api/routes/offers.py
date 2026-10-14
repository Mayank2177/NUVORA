"""Task offers and invitations endpoints for developer-employer matching."""
from typing import List, Literal, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from src.storage.instance import storage
from src.storage.utils import new_id, utc_now_iso
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database

router = APIRouter(prefix="/api/marketplace/offers", tags=["marketplace-offers"])


# Request/Response Models
class OfferResponse(BaseModel):
    id: str
    taskId: str
    devId: str
    devName: str
    origin: Literal["invite", "interest"]
    status: Literal["pending", "accepted", "declined", "closed"]
    createdAt: str
    respondedAt: Optional[str] = None


class InviteDeveloperRequest(BaseModel):
    taskId: str
    developerId: str
    developerName: str


class ExpressInterestRequest(BaseModel):
    taskId: str


class RespondToInviteRequest(BaseModel):
    accept: bool


# Helper functions
def _serialize_offer(row) -> dict:
    """Convert database row to offer response format."""
    return {
        "id": row["id"],
        "taskId": row["task_id"],
        "devId": row["developer_id"],
        "devName": row["developer_name"],
        "origin": row["origin"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "respondedAt": row["responded_at"] if "responded_at" in row.keys() else None,
    }


def _is_active(status: str) -> bool:
    """Check if offer status is active."""
    return status in ("pending", "accepted")


def _get_task(task_id: str):
    """Get task or raise 404."""
    task = storage.fetchone("SELECT * FROM marketplace_tasks WHERE id = ?", (task_id,))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _require_task_owner(task_id: str, user: dict):
    task = _get_task(task_id)
    if user.get("role") != "employer" or task["employer_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _assign_task(task_id: str, dev_id: str, winning_offer_id: str):
    """Atomically assign the task and accept the matching application and offer."""
    now = utc_now_iso()

    def transaction(conn):
        lock = " FOR UPDATE" if storage._postgres_pool is not None else ""
        task = conn.execute(
            "SELECT status FROM marketplace_tasks WHERE id = ?" + lock, (task_id,)
        ).fetchone()
        offer = conn.execute(
            "SELECT id FROM task_offers WHERE id = ? AND task_id = ? AND developer_id = ? AND status = 'pending'" + lock,
            (winning_offer_id, task_id, dev_id),
        ).fetchone()
        if not task or task["status"] != "open" or not offer:
            raise HTTPException(status_code=409, detail="This task is no longer available.")

        updated = conn.execute(
            "UPDATE marketplace_tasks SET status = 'assigned', assignee_id = ?, updated_at = ? "
            "WHERE id = ? AND status = 'open'",
            (dev_id, now, task_id),
        )
        if updated.rowcount != 1:
            raise HTTPException(status_code=409, detail="This task is no longer available.")
        conn.execute(
            """INSERT INTO task_applications (id, task_id, developer_id, status, proposal, created_at, updated_at)
               VALUES (?, ?, ?, 'accepted', 'Accepted invitation', ?, ?)
               ON CONFLICT(task_id, developer_id) DO UPDATE SET
                 status = 'accepted', updated_at = excluded.updated_at""",
            (new_id("app"), task_id, dev_id, now, now),
        )
        conn.execute(
            "UPDATE task_offers SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'pending'",
            (now, winning_offer_id),
        )
        conn.execute(
            "UPDATE task_offers SET status = 'closed', responded_at = ? "
            "WHERE task_id = ? AND id != ? AND status = 'pending'",
            (now, task_id, winning_offer_id),
        )

    storage.executemany_tx(transaction)


# Endpoints
@router.get("", response_model=List[OfferResponse])
@offload_database
def list_offers(
    task_id: Optional[str] = None,
    developer_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    user: dict = Depends(require_user),
):
    """List offers with optional filters."""
    query = (
        "SELECT task_offers.* FROM task_offers "
        "JOIN marketplace_tasks ON marketplace_tasks.id = task_offers.task_id "
        "WHERE (task_offers.developer_id = ? OR marketplace_tasks.employer_id = ?)"
    )
    params = [user["id"], user["id"]]
    
    if task_id:
        query += " AND task_offers.task_id = ?"
        params.append(task_id)
    
    if developer_id:
        query += " AND task_offers.developer_id = ?"
        params.append(developer_id)
    
    if status:
        query += " AND task_offers.status = ?"
        params.append(status)
    
    query += " ORDER BY task_offers.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    rows = storage.fetchall(query, tuple(params))
    return [_serialize_offer(row) for row in rows]


@router.get("/{offer_id}", response_model=OfferResponse)
@offload_database
def get_offer(offer_id: str, user: dict = Depends(require_user)):
    """Get offer details by ID."""
    row = storage.fetchone(
        """SELECT task_offers.* FROM task_offers
           JOIN marketplace_tasks ON marketplace_tasks.id = task_offers.task_id
           WHERE task_offers.id = ?
             AND (task_offers.developer_id = ? OR marketplace_tasks.employer_id = ?)""",
        (offer_id, user["id"], user["id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    return _serialize_offer(row)


@router.post("/invite", status_code=201, response_model=OfferResponse)
@offload_database
def invite_developer(request: InviteDeveloperRequest, user: dict = Depends(require_user)):
    """Employer invites a developer to a task."""
    task = _require_task_owner(request.taskId, user)
    developer = storage.fetchone(
        "SELECT name FROM users WHERE id = ? AND role = 'developer' AND deleted_at IS NULL",
        (request.developerId,),
    )
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    
    if task["status"] != "open":
        raise HTTPException(
            status_code=400,
            detail="Publish the task first. Only open tasks can take invitations.",
        )
    
    # Check if there's already an active offer
    existing = storage.fetchone(
        """
        SELECT * FROM task_offers
        WHERE task_id = ? AND developer_id = ? AND status IN ('pending', 'accepted')
        """,
        (request.taskId, request.developerId),
    )
    
    if existing:
        if existing["origin"] == "interest" and existing["status"] == "pending":
            # Developer already showed interest, auto-assign
            _assign_task(request.taskId, request.developerId, existing["id"])
            updated = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (existing["id"],))
            return _serialize_offer(updated)
        elif existing["status"] == "accepted":
            raise HTTPException(
                status_code=400,
                detail="This developer already has the task.",
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="You've already invited this developer.",
            )
    
    # Remove any old declined records
    storage.execute(
        """
        DELETE FROM task_offers
        WHERE task_id = ? AND developer_id = ? AND status IN ('declined', 'closed')
        """,
        (request.taskId, request.developerId),
    )
    
    # Create new invitation
    now = utc_now_iso()
    offer_id = new_id("off")
    
    storage.execute(
        """
        INSERT INTO task_offers (
            id, task_id, developer_id, developer_name, origin, status, created_at
        ) VALUES (?, ?, ?, ?, 'invite', 'pending', ?)
        """,
        (offer_id, request.taskId, request.developerId, developer["name"], now),
    )
    
    row = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    return _serialize_offer(row)


@router.post("/interest", status_code=201, response_model=OfferResponse)
@offload_database
def express_interest(request: ExpressInterestRequest, user: dict = Depends(require_user)):
    """Developer expresses interest in a task."""
    if user.get("role") != "developer":
        raise HTTPException(status_code=403, detail="Developer account required")
    task = _get_task(request.taskId)
    
    if task["status"] != "open":
        raise HTTPException(status_code=400, detail="This task is no longer open.")
    
    # Check if there's already an active offer
    existing = storage.fetchone(
        """
        SELECT * FROM task_offers
        WHERE task_id = ? AND developer_id = ? AND status IN ('pending', 'accepted')
        """,
        (request.taskId, user["id"]),
    )
    
    if existing:
        if existing["origin"] == "invite":
            raise HTTPException(
                status_code=400,
                detail="You have an invitation for this task. Accept it instead.",
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="You've already shown interest.",
            )
    
    # Remove any old declined/closed records
    storage.execute(
        """
        DELETE FROM task_offers
        WHERE task_id = ? AND developer_id = ? AND status IN ('declined', 'closed')
        """,
        (request.taskId, user["id"]),
    )
    
    # Create new interest offer
    now = utc_now_iso()
    offer_id = new_id("off")
    
    storage.execute(
        """
        INSERT INTO task_offers (
            id, task_id, developer_id, developer_name, origin, status, created_at
        ) VALUES (?, ?, ?, ?, 'interest', 'pending', ?)
        """,
        (offer_id, request.taskId, user["id"], user["name"], now),
    )
    
    row = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    return _serialize_offer(row)


@router.post("/{offer_id}/assign", status_code=200, response_model=OfferResponse)
@offload_database
def assign_from_interest(offer_id: str, user: dict = Depends(require_user)):
    """Employer assigns task to developer who expressed interest."""
    offer = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    _require_task_owner(offer["task_id"], user)
    
    if offer["origin"] != "interest" or offer["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail="That request is no longer active.",
        )
    
    _assign_task(offer["task_id"], offer["developer_id"], offer_id)
    
    updated = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    return _serialize_offer(updated)


@router.delete("/{offer_id}/cancel", status_code=200, response_model=OfferResponse)
@offload_database
def cancel_invite(offer_id: str, user: dict = Depends(require_user)):
    """Employer cancels a pending invitation."""
    offer = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    _require_task_owner(offer["task_id"], user)
    
    if offer["origin"] != "invite" or offer["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail="That invitation is no longer pending.",
        )
    
    now = utc_now_iso()
    storage.execute(
        """
        UPDATE task_offers
        SET status = 'closed', responded_at = ?
        WHERE id = ?
        """,
        (now, offer_id),
    )
    
    updated = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    return _serialize_offer(updated)


@router.post("/{offer_id}/withdraw", status_code=200, response_model=OfferResponse)
@offload_database
def withdraw_interest(offer_id: str, user: dict = Depends(require_user)):
    """Developer withdraws their interest in a task."""
    offer = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer["developer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if offer["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail="That request is no longer active.",
        )
    
    now = utc_now_iso()
    storage.execute(
        """
        UPDATE task_offers
        SET status = 'declined', responded_at = ?
        WHERE id = ?
        """,
        (now, offer_id),
    )
    
    updated = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    return _serialize_offer(updated)


@router.post("/{offer_id}/respond", status_code=200, response_model=OfferResponse)
@offload_database
def respond_to_invite(
    offer_id: str,
    request: RespondToInviteRequest,
    user: dict = Depends(require_user),
):
    """Developer responds to an employer's invitation."""
    if user.get("role") != "developer":
        raise HTTPException(status_code=403, detail="Developer account required")
    offer = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer["developer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if offer["origin"] != "invite" or offer["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail="This invitation is no longer active.",
        )
    
    if request.accept:
        _assign_task(offer["task_id"], offer["developer_id"], offer_id)
    else:
        now = utc_now_iso()
        storage.execute(
            """
            UPDATE task_offers
            SET status = 'declined', responded_at = ?
            WHERE id = ?
            """,
            (now, offer_id),
        )
    
    updated = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    return _serialize_offer(updated)


@router.post("/{offer_id}/pass", status_code=201, response_model=OfferResponse)
@offload_database
def pass_on_task(offer_id: str, user: dict = Depends(require_user)):
    """Developer marks 'not for me' on a task (hides from matches)."""
    # This creates a declined interest record to hide the task
    offer = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if user.get("role") != "developer" or offer["developer_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    _get_task(offer["task_id"])
    
    # Remove old non-active records
    storage.execute(
        """
        DELETE FROM task_offers
        WHERE task_id = ? AND developer_id = ? AND status NOT IN ('pending', 'accepted')
        """,
        (offer["task_id"], user["id"]),
    )
    
    # Create declined record
    now = utc_now_iso()
    new_offer_id = new_id("off")
    
    storage.execute(
        """
        INSERT INTO task_offers (
            id, task_id, developer_id, developer_name, origin, status, created_at, responded_at
        ) VALUES (?, ?, ?, ?, 'interest', 'declined', ?, ?)
        """,
        (new_offer_id, offer["task_id"], user["id"], user["name"], now, now),
    )
    
    row = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (new_offer_id,))
    return _serialize_offer(row)


@router.delete("/{offer_id}/reconsider", status_code=204)
@offload_database
def reconsider_task(offer_id: str, user: dict = Depends(require_user)):
    """Developer removes their 'not for me' marker (undoes pass)."""
    offer = storage.fetchone("SELECT * FROM task_offers WHERE id = ?", (offer_id,))
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer["developer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if offer["origin"] != "interest" or offer["status"] != "declined":
        raise HTTPException(
            status_code=400,
            detail="No declined interest record to remove.",
        )
    
    storage.execute("DELETE FROM task_offers WHERE id = ?", (offer_id,))
    return None
