"""Persisted user settings, preferences and onboarding state."""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from src.api.concurrency import offload_database
from src.api.routes.auth import require_user
from src.storage.instance import storage
from src.storage.utils import json_dumps, json_loads, utc_now_iso

router = APIRouter(prefix="/api", tags=["settings"])


class Values(BaseModel):
    model_config = ConfigDict(extra="allow")


def _settings(user_id: str):
    row = storage.fetchone("SELECT * FROM user_settings WHERE user_id = ?", (user_id,))
    return row or {"settings": "{}", "preferences": "{}", "notifications": "{}",
                   "onboarding_completed_at": None}


def _merge(user_id: str, column: str, values: dict[str, Any]):
    row = _settings(user_id)
    merged = json_loads(row[column], {})
    merged.update(values)
    now = utc_now_iso()
    storage.execute(
        f"""INSERT INTO user_settings (user_id, {column}, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET {column} = excluded.{column}, updated_at = excluded.updated_at""",
        (user_id, json_dumps(merged), now),
    )
    return merged


@router.get("/onboarding/state")
@offload_database
def get_onboarding_state(user: dict = Depends(require_user)):
    row = _settings(user["id"])
    role = user.get("role", "developer")
    profile_table = "employer_profiles" if role == "employer" else "developer_profiles"
    profile = storage.fetchone(f"SELECT 1 FROM {profile_table} WHERE user_id = ?", (user["id"],))
    completed = bool(row["onboarding_completed_at"] or profile)
    return {"completed": completed, "step": "done" if completed else "profile", "role": role}


@router.post("/onboarding/complete")
@offload_database
def complete_onboarding(user: dict = Depends(require_user)):
    now = utc_now_iso()
    storage.execute(
        """INSERT INTO user_settings (user_id, onboarding_completed_at, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET onboarding_completed_at = excluded.onboarding_completed_at,
                                              updated_at = excluded.updated_at""",
        (user["id"], now, now),
    )
    return {"ok": True, "completed": True, "completedAt": now}


@router.get("/settings")
@offload_database
def get_settings(user: dict = Depends(require_user)):
    return {"settings": json_loads(_settings(user["id"])["settings"], {})}


@router.patch("/settings")
@router.put("/settings")
@offload_database
def update_settings(values: Values, user: dict = Depends(require_user)):
    return {"settings": _merge(user["id"], "settings", values.model_dump())}


@router.get("/preferences")
@router.get("/me/preferences")
@offload_database
def get_preferences(user: dict = Depends(require_user)):
    return {"preferences": json_loads(_settings(user["id"])["preferences"], {})}


@router.patch("/preferences")
@router.put("/preferences")
@router.patch("/me/preferences")
@router.put("/me/preferences")
@offload_database
def update_preferences(values: Values, user: dict = Depends(require_user)):
    return {"preferences": _merge(user["id"], "preferences", values.model_dump())}


@router.get("/settings/notifications")
@offload_database
def get_notification_settings(user: dict = Depends(require_user)):
    return {"notifications": json_loads(_settings(user["id"])["notifications"], {})}


@router.patch("/settings/notifications")
@router.put("/settings/notifications")
@offload_database
def update_notification_settings(values: Values, user: dict = Depends(require_user)):
    return {"notifications": _merge(user["id"], "notifications", values.model_dump())}
