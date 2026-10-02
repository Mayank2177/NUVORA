"""Load a normalized project context from the active storage schema."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from storage.utils import json_loads


def load_project_context(storage, project_id: str, user_id: str) -> dict[str, Any]:
    def load(conn):
        project_row = conn.execute(
            """
            SELECT * FROM projects
            WHERE id = ? AND user_id = ? AND deleted_at IS NULL
            """,
            (project_id, user_id),
        ).fetchone()
        if not project_row:
            raise HTTPException(status_code=404, detail="Project not found")
        project = dict(project_row)
        project["stack"] = json_loads(project.get("stack"), [])
        commits = [
            dict(row)
            for row in conn.execute(
                """
                SELECT * FROM commits WHERE project_id = ?
                ORDER BY committed_at DESC, id DESC LIMIT 500
                """,
                (project_id,),
            ).fetchall()
        ]
        evidence = [
            dict(row)
            for row in conn.execute(
                """
                SELECT * FROM evidence WHERE project_id = ?
                ORDER BY occurred_at DESC, id DESC LIMIT 500
                """,
                (project_id,),
            ).fetchall()
        ]
        return {"project": project, "commits": commits, "evidence": evidence}

    return storage.read(load)