"""Workspace state, challenges, assistant, and checkpoints."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from src.api.concurrency import offload_database
from src.api.routes.auth import require_user
from src.domain.workspace import (
    CHALLENGES,
    assistant_reply,
    public_challenge,
    validate_workspace_paths,
)
from src.schemas.journey import Provenance, Stage
from src.storage.instance import storage
from src.storage.utils import json_dumps, json_loads, new_uuid, utc_now_iso

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

_KIND_FOR_TYPE = {
    "Commit": "proof",
    "AI session": "ai",
}


class WorkspaceStateResponse(BaseModel):
    projectId: str
    files: dict
    folders: list
    openTabs: list
    activeTab: str
    aiDirty: bool
    aiFiles: list
    createdAt: str
    updatedAt: str


class WorkspaceStateUpdate(BaseModel):
    files: dict[str, str] = Field(default_factory=dict)
    folders: list[str] = Field(default_factory=list)
    openTabs: list[str] = Field(default_factory=list, max_length=50)
    activeTab: str = Field(default="", max_length=500)
    aiDirty: bool = False
    aiFiles: list[str] = Field(default_factory=list, max_length=100)


class AssistantRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    challengeId: Optional[str] = Field(default=None, max_length=80)
    failingTests: list[str] = Field(default_factory=list, max_length=50)
    error: Optional[str] = Field(default=None, max_length=4000)
    hintIndex: int = Field(default=0, ge=0, le=20)


class AssistantPatch(BaseModel):
    file: str
    code: str


class AssistantResponse(BaseModel):
    text: str
    patch: Optional[AssistantPatch] = None
    hint: bool = False


class CheckpointRequest(BaseModel):
    message: str = Field(default="", max_length=140)
    provenance: Provenance = "Human"
    stage: Stage = "Build"
    fileCount: int = Field(default=0, ge=0, le=300)


def _serialize_workspace_state(row) -> dict:
    return {
        "projectId": row["project_id"],
        "files": json_loads(row["files"], {}),
        "folders": json_loads(row["folders"], []),
        "openTabs": json_loads(row["open_tabs"], []),
        "activeTab": row["active_tab"] if "active_tab" in row.keys() else "",
        "aiDirty": bool(row["ai_dirty"]),
        "aiFiles": json_loads(row["ai_files"], []),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _empty_workspace(project_id: str) -> dict:
    now = utc_now_iso()
    return {
        "projectId": project_id,
        "files": {},
        "folders": [],
        "openTabs": [],
        "activeTab": "",
        "aiDirty": False,
        "aiFiles": [],
        "createdAt": now,
        "updatedAt": now,
    }


@router.get("/challenges")
@offload_database
def list_challenges(user: dict = Depends(require_user)):
    """Starter challenges. Solutions stay on the server until the user asks."""
    del user
    return {"challenges": [public_challenge(item) for item in CHALLENGES]}


@router.get("/{project_id}", response_model=WorkspaceStateResponse)
@offload_database
def get_workspace_state(project_id: str, user: dict = Depends(require_user)):
    storage.owned_project(project_id, user["id"])
    row = storage.fetchone(
        "SELECT * FROM workspace_states WHERE project_id = ?",
        (project_id,),
    )
    if not row:
        return _empty_workspace(project_id)
    return _serialize_workspace_state(row)


@router.put("/{project_id}", response_model=WorkspaceStateResponse)
@offload_database
def save_workspace_state(
    project_id: str,
    request: WorkspaceStateUpdate,
    user: dict = Depends(require_user),
):
    storage.owned_project(project_id, user["id"])
    validate_workspace_paths(
        request.files,
        request.folders,
        request.openTabs,
        request.activeTab,
        request.aiFiles,
    )
    now = utc_now_iso()
    existing = storage.fetchone(
        "SELECT * FROM workspace_states WHERE project_id = ?",
        (project_id,),
    )
    if existing:
        storage.execute(
            """
            UPDATE workspace_states
            SET files = ?, folders = ?, open_tabs = ?, active_tab = ?,
                ai_dirty = ?, ai_files = ?, updated_at = ?
            WHERE project_id = ?
            """,
            (
                json_dumps(request.files),
                json_dumps(request.folders),
                json_dumps(request.openTabs),
                request.activeTab,
                1 if request.aiDirty else 0,
                json_dumps(request.aiFiles),
                now,
                project_id,
            ),
        )
    else:
        storage.execute(
            """
            INSERT INTO workspace_states (
                project_id, files, folders, open_tabs, active_tab,
                ai_dirty, ai_files, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                json_dumps(request.files),
                json_dumps(request.folders),
                json_dumps(request.openTabs),
                request.activeTab,
                1 if request.aiDirty else 0,
                json_dumps(request.aiFiles),
                now,
                now,
            ),
        )
    updated_row = storage.fetchone(
        "SELECT * FROM workspace_states WHERE project_id = ?",
        (project_id,),
    )
    return _serialize_workspace_state(updated_row)


@router.delete("/{project_id}", status_code=204)
@offload_database
def delete_workspace_state(project_id: str, user: dict = Depends(require_user)):
    storage.owned_project(project_id, user["id"])
    storage.execute(
        "DELETE FROM workspace_states WHERE project_id = ?",
        (project_id,),
    )
    return None


@router.post("/{project_id}/assistant", response_model=AssistantResponse)
@offload_database
def workspace_assistant(
    project_id: str,
    request: AssistantRequest,
    user: dict = Depends(require_user),
):
    storage.owned_project(project_id, user["id"])
    reply = assistant_reply(
        request.prompt,
        challenge_id=request.challengeId,
        failing_tests=request.failingTests,
        error=request.error,
        hint_index=request.hintIndex,
    )
    return reply


@router.post("/{project_id}/checkpoints", status_code=201)
@offload_database
def create_checkpoint(
    project_id: str,
    request: CheckpointRequest,
    user: dict = Depends(require_user),
):
    storage.owned_project(project_id, user["id"])
    state = storage.fetchone(
        "SELECT ai_dirty FROM workspace_states WHERE project_id = ?",
        (project_id,),
    )
    provenance = request.provenance
    if state and int(state["ai_dirty"]) and provenance == "Human":
        provenance = "AI-assisted"
    message = request.message.strip() or f"Checkpoint: {request.fileCount} files"
    now = utc_now_iso()
    eid = new_uuid()

    def transaction(conn):
        conn.execute(
            """
            INSERT INTO evidence (
              id, project_id, kind, title, body, source, occurred_at, ai_assisted,
              verified, publish, sensitive, commit_hash, created_at, updated_at,
              type, provenance, stage
            ) VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 0, 0, NULL, ?, ?, ?, ?, ?)
            """,
            (
                eid,
                project_id,
                _KIND_FOR_TYPE["Commit"],
                message[:140],
                "Nuvora workspace",
                now,
                1 if provenance == "AI-assisted" else 0,
                now,
                now,
                "Commit",
                provenance,
                request.stage,
            ),
        )
        conn.execute(
            "UPDATE workspace_states SET ai_dirty = 0, updated_at = ? WHERE project_id = ?",
            (now, project_id),
        )
        conn.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
        created = conn.execute("SELECT * FROM evidence WHERE id = ?", (eid,)).fetchone()
        storage.append_evidence_audit(
            conn,
            project_id=project_id,
            evidence_id=eid,
            actor_id=user["id"],
            action="create",
            payload=dict(created),
        )
        return created

    created = storage.executemany_tx(transaction)
    return {"evidence": storage.evidence_canonical(created)}
