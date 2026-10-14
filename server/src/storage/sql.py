"""Small helpers for SQL identifiers that cannot be passed as parameters."""

UPDATE_FIELDS = {
    "users": {"name", "email", "email_verified", "username", "headline", "bio", "location",
              "website", "github_handle", "linkedin_url", "skills", "hidden_projects",
              "is_public", "updated_at"},
    "tasks": {"title", "done", "done_at", "updated_at"},
    "evidence": {"title", "body", "source", "occurred_at", "ai_assisted", "verified",
                 "publish", "sensitive", "updated_at"},
    "marketplace_tasks": {"title", "description", "company", "raw_need", "summary", "requirements",
                          "skills_required", "complexity", "scope", "acceptance", "budget_min",
                          "budget_max", "deadline", "status", "closed_at", "published_at", "updated_at"},
    "developer_profiles": {"name", "goals", "interests", "skills", "github_handle", "open_to_work",
                           "updated_at"},
    "employer_profiles": {"company", "industry", "team_size", "website", "needs", "updated_at"},
}

RESOURCE_TABLES = {
    "blockers": {"id", "project_id", "title", "status", "attempts", "created_at", "updated_at"},
    "tasks": {"id", "project_id", "title", "stage", "done", "done_at", "created_at", "updated_at"},
    "designs": {"id", "project_id", "title", "kind", "tool", "url", "image", "note", "stage", "created_at", "updated_at"},
    "decisions": {"id", "project_id", "decision", "reason", "stage", "created_at", "updated_at"},
}


def build_update(table: str, allowed_fields: set[str] | frozenset[str], patch: dict) -> tuple[str, tuple]:
    """Build an UPDATE prefix only from identifiers declared for that table."""
    table_fields = UPDATE_FIELDS.get(table)
    if table_fields is None or not allowed_fields <= table_fields or not set(patch) <= allowed_fields:
        raise ValueError("Update contains an unsupported table or column")
    if not patch:
        raise ValueError("Update patch cannot be empty")
    assignments = ", ".join(f"{field} = ?" for field in patch)
    return f"UPDATE {table} SET {assignments}", tuple(patch.values())


def build_insert(table: str, columns: list[str], allowed_fields: set[str] | frozenset[str]) -> str:
    table_fields = RESOURCE_TABLES.get(table)
    if table_fields is None or not allowed_fields <= table_fields or not set(columns) <= allowed_fields:
        raise ValueError("Insert contains an unsupported table or column")
    return f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})"
