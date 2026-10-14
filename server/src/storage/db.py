"""Persistence primitives used by the active NUVORA API."""
from __future__ import annotations

import sqlite3
import threading
import time
from contextlib import closing, nullcontext
from pathlib import Path
from typing import Any, Callable, Optional

from .schema import SCHEMA
from .utils import json_dumps, json_loads, new_id, slugify, utc_now_iso
from src.domain.hash_chain import compute_entry_hash, verify_chain


class Storage:
    """Shared SQLite development storage or pooled PostgreSQL production storage."""

    def __init__(
        self,
        database_path: Path,
        database_url: str = "",
        database_pool_min_size: int = 1,
        database_pool_size: int = 20,
    ) -> None:
        self.database_url = database_url
        self.db_path = Path(database_path)
        self._postgres_pool = None
        self._write_lock = threading.Lock()

        if database_url:
            from .postgres import create_pool

            self._postgres_pool = create_pool(
                database_url,
                min_size=database_pool_min_size,
                max_size=database_pool_size,
            )
        else:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._init_schema()

    def _connect(self):
        if self._postgres_pool is not None:
            from .postgres import PostgresConnection
            last_error = None
            for attempt in range(2):
                try:
                    return PostgresConnection(self._postgres_pool)
                except sqlite3.OperationalError as exc:
                    from .postgres import PoolTimeoutError
                    if isinstance(exc, PoolTimeoutError):
                        raise
                    last_error = exc
                except Exception as exc:
                    last_error = exc
                if attempt == 0:
                    time.sleep(0.1)
            raise sqlite3.OperationalError(
                "PostgreSQL connection unavailable after retry"
            ) from last_error

        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    def _write_guard(self):
        return nullcontext() if self._postgres_pool is not None else self._write_lock

    def _init_schema(self) -> None:
        try:
            self._init_schema_once()
        except sqlite3.OperationalError as exc:
            message = str(exc).lower()
            if self._postgres_pool is None or not any(
                marker in message
                for marker in ("server closed the connection", "connection already closed")
            ):
                raise
            import logging
            logging.getLogger("nuvora").warning(
                "PostgreSQL connection was lost during startup schema setup; retrying once"
            )
            self._init_schema_once()

    def _init_schema_once(self) -> None:
        with closing(self._connect()) as conn:
            if self._postgres_pool is None:
                # WAL is persistent database state. Setting it on every read
                # connection requires locking and collapses under concurrency.
                conn.execute("PRAGMA journal_mode=WAL;")

            # For PostgreSQL, handle schema initialization more carefully
            if self._postgres_pool is not None:
                # Run schema creation in smaller chunks to avoid timeouts
                try:
                    conn.executescript(SCHEMA)
                except Exception as e:
                    import logging
                    logging.getLogger("nuvora").exception("PostgreSQL schema initialization failed")
                    raise RuntimeError("PostgreSQL schema initialization failed") from e
            else:
                # SQLite can handle the full script
                conn.executescript(SCHEMA)
            with conn:
                if self._postgres_pool is not None:
                    conn.execute(
                        "ALTER TABLE publications ADD COLUMN IF NOT EXISTS payload TEXT"
                    )
                    conn.execute(
                        "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0"
                    )
                    conn.execute(
                        "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TEXT"
                    )
                    # Migration: Add role column for developer/employer distinction
                    conn.execute(
                        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'developer'"
                    )
                    # Update existing users to have role if NULL
                    conn.execute(
                        "UPDATE users SET role = 'developer' WHERE role IS NULL"
                    )
                else:
                    columns = {
                        row["name"]
                        for row in conn.execute("PRAGMA table_info(publications)").fetchall()
                    }
                    if "payload" not in columns:
                        conn.execute("ALTER TABLE publications ADD COLUMN payload TEXT")
                    user_columns = {
                        row["name"]
                        for row in conn.execute("PRAGMA table_info(users)").fetchall()
                    }
                    if "failed_login_attempts" not in user_columns:
                        conn.execute(
                            "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0"
                        )
                    if "locked_until" not in user_columns:
                        conn.execute("ALTER TABLE users ADD COLUMN locked_until TEXT")
                    if "role" not in user_columns:
                        conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'developer'")
                conn.execute(
                    """
                    INSERT INTO schema_migrations (version, applied_at)
                    VALUES (?, ?) ON CONFLICT(version) DO NOTHING
                    """,
                    (2, utc_now_iso()),
                )
                conn.execute(
                    """
                    INSERT INTO schema_migrations (version, applied_at)
                    VALUES (?, ?) ON CONFLICT(version) DO NOTHING
                    """,
                    (3, utc_now_iso()),
                )
                conn.execute(
                    """
                    INSERT INTO schema_migrations (version, applied_at)
                    VALUES (?, ?) ON CONFLICT(version) DO NOTHING
                    """,
                    (4, utc_now_iso()),
                )
                conn.execute(
                    """
                    INSERT INTO schema_migrations (version, applied_at)
                    VALUES (?, ?) ON CONFLICT(version) DO NOTHING
                    """,
                    (5, utc_now_iso()),
                )
                # Additive migration: preserve existing evidence and audit hashes.
                # New frontend metadata does not reinterpret old ledger entries.
                evidence_columns = (
                    set() if self._postgres_pool is not None else
                    {row["name"] for row in conn.execute("PRAGMA table_info(evidence)").fetchall()}
                )
                for name, definition in (
                    ("type", "TEXT"), ("provenance", "TEXT"), ("stage", "TEXT"),
                ):
                    if self._postgres_pool is not None:
                        conn.execute(f"ALTER TABLE evidence ADD COLUMN IF NOT EXISTS {name} {definition}")
                    elif name not in evidence_columns:
                        conn.execute(f"ALTER TABLE evidence ADD COLUMN {name} {definition}")
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) "
                    "ON CONFLICT(version) DO NOTHING",
                    (6, utc_now_iso()),
                )
                self._migration_7(conn)
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) "
                    "ON CONFLICT(version) DO NOTHING",
                    (7, utc_now_iso()),
                )
                self._migration_8(conn)
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) "
                    "ON CONFLICT(version) DO NOTHING",
                    (8, utc_now_iso()),
                )
                self._migration_9(conn)
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) "
                    "ON CONFLICT(version) DO NOTHING",
                    (9, utc_now_iso()),
                )
                self._migration_10(conn)
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) "
                    "ON CONFLICT(version) DO NOTHING",
                    (10, utc_now_iso()),
                )

    def _columns(self, conn, table: str) -> set:
        if self._postgres_pool is not None:
            rows = conn.execute(
                "SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?",
                (table,),
            ).fetchall()
        else:
            rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return {row["name"] for row in rows}

    def _migration_7(self, conn) -> None:
        """API-requirements alignment. Additive: legacy columns/data are preserved."""
        additions = {
            "projects": [("goal", "TEXT"), ("audience", "TEXT"), ("constraints", "TEXT"),
                         ("stage", "TEXT NOT NULL DEFAULT 'Think'")],
            "blockers": [("updated_at", "TEXT")],
            "tasks": [("updated_at", "TEXT")],
            "designs": [("updated_at", "TEXT")],
            "decisions": [("updated_at", "TEXT")],
        }
        for table, columns in additions.items():
            existing = self._columns(conn, table)
            for name, definition in columns:
                if name not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
        for table in ("blockers", "tasks", "designs", "decisions"):
            conn.execute(f"UPDATE {table} SET updated_at = created_at WHERE updated_at IS NULL")
        # Legacy summary is the closest historical meaning of "goal"; only copy, never overwrite.
        conn.execute("UPDATE projects SET goal = summary WHERE goal IS NULL AND summary IS NOT NULL AND summary <> ''")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_evidence_filters "
            "ON evidence(project_id, stage, type, provenance, publish)"
        )
        # Global slug uniqueness (I02). Refuse to install it over conflicting data
        # instead of crashing startup; the publish endpoint still checks in-transaction.
        duplicates = conn.execute(
            "SELECT slug FROM publications GROUP BY slug HAVING COUNT(*) > 1"
        ).fetchall()
        if duplicates:
            import logging
            logging.getLogger("nuvora").error(
                "Duplicate published slugs across authors block the global unique index: %s",
                [row["slug"] for row in duplicates],
            )
        else:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_publications_slug ON publications(slug)")

    def _migration_8(self, conn) -> None:
        """GitHub OAuth improvements: separate state table and renamed token column."""
        # Create oauth_states table (already in schema, but ensure it exists)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS oauth_states (
                state_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at)")
        
        # Add new GitHub columns to users table
        user_columns = self._columns(conn, "users")
        
        if "github_login" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN github_login TEXT")
        
        if "github_token_enc" not in user_columns:
            # If old github_token exists, rename it; otherwise create new column
            if "github_token" in user_columns:
                # PostgreSQL and SQLite handle this differently
                if self._postgres_pool is not None:
                    conn.execute("ALTER TABLE users RENAME COLUMN github_token TO github_token_enc")
                else:
                    # SQLite doesn't support RENAME COLUMN in older versions, so we'll keep both
                    conn.execute("ALTER TABLE users ADD COLUMN github_token_enc TEXT")
                    # Copy data from old to new column
                    conn.execute("UPDATE users SET github_token_enc = github_token WHERE github_token IS NOT NULL")
            else:
                conn.execute("ALTER TABLE users ADD COLUMN github_token_enc TEXT")
        
        if "github_connected_at" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN github_connected_at TEXT")

    def _migration_9(self, conn) -> None:
        """Add encrypted TOTP MFA state without changing existing accounts."""
        columns = self._columns(conn, "users")
        for name, definition in (
            ("totp_secret_enc", "TEXT"),
            ("totp_pending_enc", "TEXT"),
            ("totp_enabled", "INTEGER NOT NULL DEFAULT 0"),
            ("totp_backup_hashes", "TEXT"),
        ):
            if name not in columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mfa_challenges (
              token_hash TEXT PRIMARY KEY,
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expires_at TEXT NOT NULL,
              used_at TEXT
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expiry ON mfa_challenges(expires_at)")

    def _migration_10(self, conn) -> None:
        """Ensure profile fields exist for databases created before migration 004."""
        columns = self._columns(conn, "users")
        for name, definition in (
            ("headline", "TEXT NOT NULL DEFAULT ''"),
            ("bio", "TEXT NOT NULL DEFAULT ''"),
            ("location", "TEXT NOT NULL DEFAULT ''"),
            ("website", "TEXT NOT NULL DEFAULT ''"),
            ("github_handle", "TEXT NOT NULL DEFAULT ''"),
            ("linkedin_url", "TEXT NOT NULL DEFAULT ''"),
            ("skills", "TEXT NOT NULL DEFAULT '[]'"),
            ("hidden_projects", "TEXT NOT NULL DEFAULT '[]'"),
            ("is_public", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if name not in columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_username_public ON users(username, is_public)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_is_public ON users(is_public, updated_at DESC)"
        )

    def close(self) -> None:
        if self._postgres_pool is not None:
            self._postgres_pool.closeall()

    def execute(self, sql: str, params: tuple = ()) -> int:
        with self._write_guard(), closing(self._connect()) as conn:
            with conn:
                cursor = conn.execute(sql, params)
                try:
                    return cursor.rowcount
                finally:
                    cursor.close()

    def fetchone(self, sql: str, params: tuple = ()):
        with closing(self._connect()) as conn:
            cursor = conn.execute(sql, params)
            try:
                return cursor.fetchone()
            finally:
                cursor.close()

    def fetchall(self, sql: str, params: tuple = ()) -> list:
        with closing(self._connect()) as conn:
            cursor = conn.execute(sql, params)
            try:
                return cursor.fetchall()
            finally:
                cursor.close()

    def read(self, callback: Callable[[Any], Any]) -> Any:
        """Run a group of related reads on one pooled connection."""
        with closing(self._connect()) as conn:
            return callback(conn)

    def executemany_tx(self, callback: Callable[[Any], Any]) -> Any:
        with self._write_guard(), closing(self._connect()) as conn:
            with conn:
                return callback(conn)

    def append_evidence_audit(
        self,
        conn,
        *,
        project_id: str,
        evidence_id: Optional[str],
        actor_id: str,
        action: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Append an evidence revision to the project-scoped hash chain."""
        if self._postgres_pool is not None:
            conn.execute("SELECT id FROM projects WHERE id = ? FOR UPDATE", (project_id,))
        last = conn.execute(
            """
            SELECT position, entry_hash FROM evidence_audit
            WHERE project_id = ? ORDER BY position DESC LIMIT 1
            """,
            (project_id,),
        ).fetchone()
        position = int(last["position"]) + 1 if last else 1
        previous = last["entry_hash"] if last else None
        entry = {
            "id": new_id("audit"),
            "project_id": project_id,
            "evidence_id": evidence_id,
            "actor_id": actor_id,
            "action": action,
            "payload": payload,
            "position": position,
            "created_at": utc_now_iso(),
        }
        entry_hash = compute_entry_hash(previous, entry)
        conn.execute(
            """
            INSERT INTO evidence_audit (
              id, project_id, evidence_id, actor_id, action, payload,
              position, prev_hash, entry_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry["id"],
                project_id,
                evidence_id,
                actor_id,
                action,
                json_dumps(payload),
                position,
                previous,
                entry_hash,
                entry["created_at"],
            ),
        )
        return {**entry, "prev_hash": previous, "entry_hash": entry_hash}

    def evidence_chain(self, project_id: str) -> dict[str, Any]:
        rows = self.fetchall(
            "SELECT * FROM evidence_audit WHERE project_id = ? ORDER BY position",
            (project_id,),
        )
        entries = []
        for row in rows:
            entry = dict(row)
            entry["payload"] = json_loads(entry.get("payload"), {})
            entries.append(entry)
        return verify_chain(entries)

    def get_user_by_id(self, user_id: str) -> Optional[dict[str, Any]]:
        row = self.fetchone(
            "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", (user_id,)
        )
        return dict(row) if row else None

    def get_user_by_email(self, email: str) -> Optional[dict[str, Any]]:
        row = self.fetchone(
            "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", (email,)
        )
        return dict(row) if row else None

    def create_session(self, user_id: str, token_hash: str, expires_at: str) -> None:
        self.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token_hash, user_id, utc_now_iso(), expires_at),
        )

    def owned_project(self, project_id: str, user_id: str) -> dict[str, Any]:
        from fastapi import HTTPException

        row = self.fetchone(
            "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL", (project_id,)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        if row["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Project not found")
        return dict(row)

    def project_counts(self, project_id: str) -> tuple[int, int]:
        row = self.fetchone(
            """
            SELECT
              (SELECT COUNT(*) FROM commits WHERE project_id = ?) AS commit_count,
              (SELECT COUNT(*) FROM evidence WHERE project_id = ?) AS evidence_count
            """,
            (project_id, project_id),
        )
        return int(row["commit_count"]), int(row["evidence_count"])

    def publication_for(self, project_id: str) -> Optional[dict[str, Any]]:
        row = self.fetchone(
            "SELECT * FROM publications WHERE project_id = ?", (project_id,)
        )
        return dict(row) if row else None

    def project_overview(
        self, project_id: str, user_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        """Load a project and all response metrics in one database round trip."""
        ownership = " AND projects.user_id = ?" if user_id is not None else ""
        params = (project_id, user_id) if user_id is not None else (project_id,)
        row = self.fetchone(
            """
            SELECT projects.*,
              (SELECT COUNT(*) FROM commits
               WHERE commits.project_id = projects.id) AS commit_count,
              (SELECT COUNT(*) FROM evidence
               WHERE evidence.project_id = projects.id) AS evidence_count,
              publications.public_url AS publication_url
            FROM projects
            LEFT JOIN publications ON publications.project_id = projects.id
            WHERE projects.id = ? AND projects.deleted_at IS NULL
            """
            + ownership,
            params,
        )
        return dict(row) if row else None

    def hydrate_project(self, row) -> dict[str, Any]:
        data = dict(row)
        if "commit_count" in data and "evidence_count" in data:
            commit_count = int(data["commit_count"])
            evidence_count = int(data["evidence_count"])
            public_url = data.get("publication_url")
            published = bool(public_url) and data["status"] == "published"
        else:
            commit_count, evidence_count = self.project_counts(data["id"])
            publication = self.publication_for(data["id"])
            public_url = publication["public_url"] if publication else None
            published = bool(publication) and data["status"] == "published"

        return {
            "id": data["id"],
            "name": data["name"],
            "slug": data["slug"],
            "repo": data.get("repo") or None,
            "summary": data.get("summary") or "",
            "stack": json_loads(data.get("stack"), []),
            "span": data.get("span") or "",
            "status": data["status"],
            "commitCount": commit_count,
            "evidenceCount": evidence_count,
            "published": published,
            "publicUrl": public_url,
            "createdAt": data["created_at"],
            "updatedAt": data["updated_at"],
            # ---- canonical contract (api-requirements.md) ----
            "user_id": data["user_id"],
            "goal": data.get("goal") or data.get("summary") or "",
            "users": data.get("audience") or "",
            "constraints": data.get("constraints"),
            "stage": data.get("stage") or "Think",
            "created_at": data["created_at"],
            "updated_at": data["updated_at"],
        }

    def user_public(self, row, *, owner: bool = False) -> dict[str, Any]:
        data = dict(row)
        result = {
            "id": data["id"],
            "email": data["email"] if owner else None,
            "name": data["name"],
            "username": data["username"],
            "role": data.get("role", "developer"),
            "avatarUrl": data.get("avatar_url"),
            "emailVerified": bool(data.get("email_verified")),
            "githubConnected": bool(data.get("github_token_enc") or data.get("github_id")),
            "isAdmin": bool(data.get("is_admin")),
            "createdAt": data["created_at"],
            "updatedAt": data["updated_at"],
            "created_at": data["created_at"],
            "updated_at": data["updated_at"],
        }
        if not owner:
            result.pop("email", None)
            result.pop("isAdmin", None)
            result.pop("emailVerified", None)
        return result

    def commit_row(self, row, *, include_hidden: bool = True) -> dict[str, Any]:
        data = dict(row)
        result = {
            "id": data["id"],
            "projectId": data["project_id"],
            "hash": data["hash"],
            "message": data["message"],
            "author": data.get("author"),
            "when": data["committed_at"],
            "kind": data.get("kind") or "resource",
            "createdAt": data["created_at"],
            "updatedAt": data["updated_at"],
        }
        if include_hidden:
            result["hidden"] = data.get("hidden") or ""
        return result

    def evidence_row(self, row) -> dict[str, Any]:
        data = dict(row)
        return {
            "id": data["id"],
            "projectId": data["project_id"],
            "kind": data["kind"],
            "title": data["title"],
            "body": data["body"],
            "source": data.get("source") or "",
            "when": data["occurred_at"],
            "aiAssisted": bool(data.get("ai_assisted")),
            "verified": bool(data.get("verified")),
            "publish": bool(data.get("publish")),
            "sensitive": bool(data.get("sensitive")),
            "commitHash": data.get("commit_hash"),
            "createdAt": data["created_at"],
            "updatedAt": data["updated_at"],
        }

    def evidence_canonical(self, row) -> dict[str, Any]:
        """Evidence in the api-requirements shape (M03). Legacy rows keep null type/stage
        rather than guessing; provenance falls back only to the safe Human/AI-assisted split."""
        data = dict(row)
        provenance = data.get("provenance") or ("AI-assisted" if data.get("ai_assisted") else "Human")
        return {
            "id": data["id"],
            "project_id": data["project_id"],
            "type": data.get("type"),
            "text": data["title"],
            "body": data.get("body") or "",
            "date": data["occurred_at"],
            "source": data.get("source") or "",
            "provenance": provenance,
            "stage": data.get("stage"),
            "public": bool(data.get("publish")),
            "sensitive": bool(data.get("sensitive")),
            "created_at": data["created_at"],
        }

    def unique_username(self, base: str) -> str:
        import re

        root = re.sub(r"[^a-z0-9]+", "", (base or "user").lower())[:24] or "user"
        suffix = 0
        while True:
            candidate = root if suffix == 0 else f"{root}{suffix}"
            if not self.fetchone(
                "SELECT id FROM users WHERE username = ?", (candidate,)
            ):
                return candidate
            suffix += 1

    def unique_slug(
        self, user_id: str, name: str, exclude_id: Optional[str] = None
    ) -> str:
        root = slugify(name)[:48]
        suffix = 0
        while True:
            candidate = root if suffix == 0 else f"{root}-{suffix}"
            if exclude_id:
                exists = self.fetchone(
                    "SELECT id FROM projects WHERE user_id = ? AND slug = ? AND id != ? AND deleted_at IS NULL",
                    (user_id, candidate, exclude_id),
                )
            else:
                exists = self.fetchone(
                    "SELECT id FROM projects WHERE user_id = ? AND slug = ? AND deleted_at IS NULL",
                    (user_id, candidate),
                )
            if not exists:
                return candidate
            suffix += 1
