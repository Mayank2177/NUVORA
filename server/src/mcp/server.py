"""Minimal authenticated MCP-compatible JSON-RPC endpoint."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from src.api.routes.auth import require_user
from src.api.concurrency import offload_database
from src.domain.context import load_project_context
from src.domain.guidance import evaluate_guidance
from src.domain.project_markdown import generate_project_markdown
from src.schemas.continuity import MCPRequest
from src.storage.instance import storage

router = APIRouter(tags=["mcp"])

TOOLS = [
    {
        "name": "nuvora.project.guidance",
        "description": "Return evidence-based next actions for an owned project.",
        "inputSchema": {
            "type": "object",
            "properties": {"projectId": {"type": "string"}},
            "required": ["projectId"],
        },
    },
    {
        "name": "nuvora.project.export_markdown",
        "description": "Generate an owner-only PROJECT.md export.",
        "inputSchema": {
            "type": "object",
            "properties": {"projectId": {"type": "string"}},
            "required": ["projectId"],
        },
    },
    {
        "name": "nuvora.project.evidence_chain",
        "description": "Verify the append-only evidence revision chain.",
        "inputSchema": {
            "type": "object",
            "properties": {"projectId": {"type": "string"}},
            "required": ["projectId"],
        },
    },
]


def _result(request_id: str | int | None, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(
    request_id: str | int | None, code: int, message: str
) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


@router.post("/v1/mcp")
@offload_database
def mcp_rpc(request: MCPRequest, user: dict = Depends(require_user)):
    if request.method == "tools/list":
        return _result(request.id, {"tools": TOOLS})
    if request.method != "tools/call":
        return _error(request.id, -32601, "Method not found")

    name = request.params.get("name")
    arguments = request.params.get("arguments") or {}
    project_id = arguments.get("projectId") if isinstance(arguments, dict) else None
    if not isinstance(project_id, str) or not project_id or len(project_id) > 100:
        return _error(request.id, -32602, "projectId is required")

    try:
        context = load_project_context(storage, project_id, user["id"])
        if name == "nuvora.project.guidance":
            return _result(request.id, evaluate_guidance(**context))
        if name == "nuvora.project.export_markdown":
            guidance = evaluate_guidance(**context)
            return _result(
                request.id,
                {
                    "content": generate_project_markdown(
                        context["project"],
                        context["commits"],
                        context["evidence"],
                        guidance,
                    )
                },
            )
        if name == "nuvora.project.evidence_chain":
            return _result(request.id, storage.evidence_chain(project_id))
        return _error(request.id, -32602, "Unknown tool")
    except HTTPException as exc:
        return _error(request.id, -32001, str(exc.detail))