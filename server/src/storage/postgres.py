"""Small DB-API compatibility layer for PostgreSQL-backed production storage."""
from __future__ import annotations

import re
import sqlite3
import threading
from typing import Any
import psycopg2
import psycopg2.pool
import psycopg2.extras


class PoolTimeoutError(sqlite3.OperationalError):
    """No PostgreSQL connection became available before the pool timeout."""


class BlockingPool:
    def __init__(self, pool: Any, max_size: int, timeout: float = 5.0) -> None:
        self._pool = pool
        self._slots = threading.BoundedSemaphore(max_size)
        self._timeout = timeout

    def getconn(self):
        if not self._slots.acquire(timeout=self._timeout):
            raise PoolTimeoutError("PostgreSQL connection pool timeout")
        try:
            return self._pool.getconn()
        except Exception:
            self._slots.release()
            raise

    def putconn(self, connection, close: bool = False) -> None:
        try:
            try:
                self._pool.putconn(connection, close=close)
            except Exception:
                if close:
                    raise
                # A rollback failure can leave psycopg2's internal lease tracked.
                # Retry as a discard so the connection cannot poison the pool.
                self._pool.putconn(connection, close=True)
        finally:
            self._slots.release()

    def closeall(self) -> None:
        self._pool.closeall()


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
        self._connection = None
        self._closed = False
        self._broken = False
        self._in_transaction = False
        self._reconnect()

    def _reconnect(self):
        """Lease a pooled connection; let the requested query check remote liveness."""
        for _ in range(2):
            connection = self._pool.getconn()
            if not connection.closed:
                self._connection = connection
                return
            self._pool.putconn(connection, close=True)
        raise sqlite3.OperationalError("PostgreSQL pool returned closed connections")

    def _mark_broken(self) -> None:
        self._broken = True

    def execute(self, sql: str, params: tuple = ()):
        cursor = None
        try:
            cursor = self._connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute(_postgres_sql(sql), params)
            return cursor
        except psycopg2.IntegrityError as exc:
            if cursor:
                cursor.close()
            raise sqlite3.IntegrityError(str(exc)) from exc
        except psycopg2.OperationalError as exc:
            if cursor:
                cursor.close()
            self._mark_broken()
            raise sqlite3.OperationalError(str(exc)) from exc
        except psycopg2.InterfaceError as exc:
            if cursor:
                cursor.close()
            self._mark_broken()
            raise sqlite3.OperationalError(str(exc)) from exc

    def executemany(self, sql: str, params):
        cursor = None
        try:
            cursor = self._connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.executemany(_postgres_sql(sql), params)
            return cursor
        except psycopg2.IntegrityError as exc:
            if cursor:
                cursor.close()
            raise sqlite3.IntegrityError(str(exc)) from exc
        except psycopg2.OperationalError as exc:
            if cursor:
                cursor.close()
            self._mark_broken()
            raise sqlite3.OperationalError(str(exc)) from exc
        except psycopg2.InterfaceError as exc:
            if cursor:
                cursor.close()
            self._mark_broken()
            raise sqlite3.OperationalError(str(exc)) from exc

    def executescript(self, script: str) -> None:
        statements = [part.strip() for part in script.split(";") if part.strip()]
        cursor = None
        try:
            cursor = self._connection.cursor()
            for i, statement in enumerate(statements):
                try:
                    cursor.execute(statement)
                except Exception as e:
                    # Log which statement failed for debugging
                    import logging
                    logging.getLogger("nuvora").error(
                        f"Failed to execute statement {i+1}/{len(statements)}: {statement[:100]}... Error: {e}"
                    )
                    raise
            self._connection.commit()
        except Exception:
            if self._connection is None or self._connection.closed:
                self._mark_broken()
            if self._connection and not self._connection.closed:
                self._connection.rollback()
            raise
        finally:
            if cursor:
                cursor.close()

    def __enter__(self) -> "PostgresConnection":
        self._in_transaction = True
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        if self._connection is not None and not self._connection.closed and not self._broken:
            try:
                if exc_type is None:
                    self._connection.commit()
                else:
                    self._connection.rollback()
            except psycopg2.Error:
                self._mark_broken()
                if exc_type is None:
                    raise
        self._in_transaction = False
        return False

    def close(self) -> None:
        if not self._closed:
            broken = self._broken or self._connection is None or self._connection.closed
            self._pool.putconn(self._connection, close=broken)
            self._closed = True


def create_pool(database_url: str, min_size: int = 4, max_size: int = 20):
    """Create a thread-safe PostgreSQL connection pool."""
    # psycopg2 uses postgresql:// not postgresql+psycopg://
    conninfo = database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    # Bound connection establishment and detect dead TCP connections sooner.
    separator = "&" if "?" in conninfo else "?"
    conninfo += (
        f"{separator}connect_timeout=10&keepalives=1&keepalives_idle=30"
        "&keepalives_interval=10&keepalives_count=3&tcp_user_timeout=30000"
    )

    raw_pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=min_size,
        maxconn=max_size,
        dsn=conninfo
    )

    return BlockingPool(raw_pool, max_size)
