"""Small DB-API compatibility layer for PostgreSQL-backed production storage."""
from __future__ import annotations

import re
import sqlite3
from typing import Any


def _postgres_sql(sql: str) -> str:
    """Translate the qmark placeholders used by the storage layer."""
    translated = sql.replace("?", "%s")
    if re.search(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", translated, re.I):
        translated = re.sub(
            r"\bINSERT\s+OR\s+IGNORE\s+INTO\b",
            "INSERT INTO",
            translated,
            flags=re.I,
        ).rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    return translated


class PostgresConnection:
    """Expose the subset of sqlite3.Connection used by Storage."""

    def __init__(self, pool: Any) -> None:
        self._pool = pool
        self._connection = pool.getconn()
        self._closed = False
        self._transaction = None

    def execute(self, sql: str, params: tuple = ()):
        try:
            return self._connection.execute(_postgres_sql(sql), params)
        except Exception as exc:
            from psycopg import IntegrityError, OperationalError

            if isinstance(exc, IntegrityError):
                raise sqlite3.IntegrityError(str(exc)) from exc
            if isinstance(exc, OperationalError):
                raise sqlite3.OperationalError(str(exc)) from exc
            raise

    def executemany(self, sql: str, params):
        try:
            with self._connection.cursor() as cursor:
                cursor.executemany(_postgres_sql(sql), params)
                return cursor
        except Exception as exc:
            from psycopg import IntegrityError, OperationalError

            if isinstance(exc, IntegrityError):
                raise sqlite3.IntegrityError(str(exc)) from exc
            if isinstance(exc, OperationalError):
                raise sqlite3.OperationalError(str(exc)) from exc
            raise

    def executescript(self, script: str) -> None:
        statements = [part.strip() for part in script.split(";") if part.strip()]
        try:
            with self._connection.transaction():
                for statement in statements:
                    self._connection.execute(statement)
        except Exception:
            self._connection.rollback()
            raise

    def __enter__(self) -> "PostgresConnection":
        self._transaction = self._connection.transaction()
        self._transaction.__enter__()
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        if self._transaction is None:
            return False
        try:
            return bool(self._transaction.__exit__(exc_type, exc, traceback))
        finally:
            self._transaction = None

    def close(self) -> None:
        if not self._closed:
            self._pool.putconn(self._connection)
            self._closed = True


def create_pool(database_url: str, min_size: int = 4, max_size: int = 20):
    """Create a thread-safe PostgreSQL connection pool."""
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    conninfo = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    pool = ConnectionPool(
        conninfo=conninfo,
        min_size=min_size,
        max_size=max_size,
        timeout=5.0,
        max_waiting=max_size * 4,
        max_idle=300.0,
        max_lifetime=3600.0,
        kwargs={"row_factory": dict_row, "autocommit": True},
        open=True,
    )
    pool.wait(timeout=10.0)
    return pool