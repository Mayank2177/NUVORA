"""FastAPI Backend Application & Daemon Entry Point."""
from contextlib import asynccontextmanager
from typing import AsyncIterator
import logging
import sqlite3

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from storage.instance import get_storage
from storage.ratelimit import (
    check_rate_limit,
    close_rate_limiter,
    get_client_identifier,
    get_request_ip,
    ping_rate_limiter,
)
from storage.utils import hash_password, utc_now_iso, json_dumps
from api.concurrency import run_blocking
from api.middleware import RequestBodyLimitMiddleware

# Import NUVORA route modules
from api.routes import (
    analytics,
    auth,
    commits,
    continuity,
    evidence,
    github,
    journey,
    projects,
    publishing,
    waitlist,
)
from mcp.server import router as mcp_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("nuvora")


def seed_demo() -> None:
    """Seed demo user and project for development."""
    storage = get_storage()
    
    if storage.fetchone("SELECT id FROM users LIMIT 1"):
        return
    
    logger.info("Seeding NUVORA demo user + project")
    now = utc_now_iso()
    user_id = "usr_demo"
    project_id = "prj_distsys"
    
    storage.execute(
        """
        INSERT INTO users (
          id, email, name, username, password_hash, email_verified, is_admin,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
        """,
        (
            user_id,
            "ada@nuvora.dev",
            "Ada Engineer",
            "ada",
            hash_password("nuvora-demo-pass"),
            now,
            now,
        ),
    )
    storage.execute(
        """
        INSERT INTO projects (
          id, user_id, name, slug, repo, summary, stack, span, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        """,
        (
            project_id,
            user_id,
            "DistSys-KV",
            "distsys-kv",
            "https://github.com/ada/distsys-kv",
            "A linearizable Raft KV store in Rust, with chaos tests and a public evidence trail.",
            json_dumps(["Rust", "Raft", "Tokio", "gRPC"]),
            "4-week sprint",
            now,
            now,
        ),
    )
    storage.execute(
        """
        INSERT INTO commits (
          id, project_id, hash, message, author, committed_at, hidden, kind,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "cmt_election",
            project_id,
            "7a21f89c0123456789abcdef0123456789abcdef",
            "feat(consensus): implement election timer and RequestVote RPC handler",
            "Ada Engineer",
            now,
            "Internal: first timer implementation deadlocked; do not mention in public writeup.",
            "proof",
            now,
            now,
        ),
    )
    evidence_data = [
        (
            "evd_notes",
            "resource",
            "Raft lecture notes",
            "Election safety, leader append-only, log matching invariants.",
            "https://raft.github.io",
            0, 1, 1, 0,
        ),
        (
            "evd_snag",
            "snag",
            "Heartbeat timer dropped future",
            "tokio mpsc closed the election timer under load. Fixed with biased select! and interval.",
            "",
            0, 1, 1, 0,
        ),
        (
            "evd_proof",
            "proof",
            "cluster_election tests green",
            "18 integration tests passed: split-vote, partition isolation, re-election under 400ms.",
            "",
            0, 1, 1, 0,
        ),
        (
            "evd_ai",
            "ai",
            "gRPC snapshot boilerplate",
            "AI drafted protobuf/gRPC streaming stubs; reviewed chunk boundaries and added CRC32.",
            "",
            1, 1, 1, 0,
        ),
    ]
    for eid, kind, title, body, source, ai, ver, pub, sens in evidence_data:
        def transaction(conn, evidence_id=eid, evidence_kind=kind,
                        evidence_title=title, evidence_body=body,
                        evidence_source=source, ai_assisted=ai,
                        verified=ver, publish=pub, sensitive=sens):
            conn.execute(
                """
                INSERT INTO evidence (
                  id, project_id, kind, title, body, source, occurred_at,
                  ai_assisted, verified, publish, sensitive, commit_hash,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """,
                (
                    evidence_id,
                    project_id,
                    evidence_kind,
                    evidence_title,
                    evidence_body,
                    evidence_source,
                    now,
                    ai_assisted,
                    verified,
                    publish,
                    sensitive,
                    now,
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM evidence WHERE id = ?", (evidence_id,)
            ).fetchone()
            storage.append_evidence_audit(
                conn,
                project_id=project_id,
                evidence_id=evidence_id,
                actor_id=user_id,
                action="create",
                payload=dict(row),
            )

        storage.executemany_tx(transaction)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Lifecycle management for the FastAPI application."""
    if settings.environment.lower() == "production":
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        except ImportError as exc:
            raise RuntimeError(
                "cryptography is required in production"
            ) from exc
        del AESGCM
        await ping_rate_limiter()
    await github.start_github_client()
    storage = get_storage()
    if settings.seed_demo:
        seed_demo()
    logger.info("NUVORA API starting")
    logger.info(
        "Database: %s",
        "PostgreSQL" if settings.database_url else settings.database_path,
    )
    try:
        yield
    finally:
        await github.close_github_client()
        await close_rate_limiter()
        storage.close()
        get_storage.cache_clear()
        logger.info("NUVORA API shutting down")


# Create FastAPI application
app = FastAPI(
    title="NUVORA",
    version="1.0.0",
    description="Portfolio evidence platform with provenance tracking.",
    lifespan=lifespan,
    docs_url=None if settings.environment.lower() == "production" else "/docs",
    redoc_url=None if settings.environment.lower() == "production" else "/redoc",
    openapi_url=None if settings.environment.lower() == "production" else "/openapi.json",
)
app.add_middleware(
    RequestBodyLimitMiddleware, max_bytes=settings.request_body_max_bytes
)


def _apply_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
    )
    if settings.environment.lower() == "production":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    body = {"error": exc.detail if isinstance(exc.detail, str) else "Request failed"}
    if not isinstance(exc.detail, str):
        body["details"] = exc.detail
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Never echo passwords, tokens, image data or other rejected input values.
    details = [{"location": list(error["loc"]), "message": error["msg"], "type": error["type"]}
               for error in exc.errors()]
    # The requirements mandate 400 for invalid signup payloads; other routes keep 422.
    status = 400 if request.url.path == "/api/auth/signup" else 422
    return JSONResponse(status_code=status, content={"error": "Validation error", "details": details})


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception):
    # Log internally; never expose exception text to clients.
    logger.exception("Unhandled server error", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


@app.exception_handler(sqlite3.OperationalError)
async def database_operational_error(_: Request, exc: sqlite3.OperationalError):
    logger.exception("Database operation failed", exc_info=exc)
    return JSONResponse(
        status_code=503,
        content={"error": "Database temporarily unavailable"},
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    return _apply_security_headers(response)


@app.middleware("http")
async def api_rate_limit(request: Request, call_next):
    rate_limited_path = request.url.path.startswith(
        ("/api/", "/public/", "/v1/mcp")
    )
    if settings.rate_limit_enabled and rate_limited_path:
        identifier = get_client_identifier(get_request_ip(request))
        try:
            allowed = await check_rate_limit(
                f"api:{identifier}",
                settings.rate_limit_api_max,
                settings.rate_limit_api_window,
            )
        except Exception:
            logger.exception("Distributed API rate limiter unavailable")
            return _apply_security_headers(JSONResponse(
                status_code=503,
                content={"error": "Rate limiter unavailable"},
            ))
        if not allowed:
            return _apply_security_headers(JSONResponse(
                status_code=429,
                content={"error": "Too many requests"},
                headers={"Retry-After": str(settings.rate_limit_api_window)},
            ))
    return await call_next(request)

# Configure CORS
if settings.enable_cors:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

# Include NUVORA API routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(journey.router)
app.include_router(commits.router)
app.include_router(evidence.router)
app.include_router(evidence.id_router)
app.include_router(publishing.router)
app.include_router(waitlist.router)
app.include_router(analytics.router)
app.include_router(github.router)
app.include_router(continuity.router)
app.include_router(mcp_router)


@app.get("/healthz")
async def health_check():
    """Health check endpoint."""
    from storage.utils import utc_now_iso
    storage = get_storage()
    try:
        await run_blocking(storage.fetchone, "SELECT 1 AS ok")
        if settings.environment.lower() == "production":
            await ping_rate_limiter()
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Dependency unavailable") from exc
    return {
        "status": "healthy",
        "service": "NUVORA",
        "version": app.version,
        "timestamp": utc_now_iso(),
        "storage": "postgresql" if settings.database_url else str(settings.database_path),
        "sqlite_mode": None if settings.database_url else "WAL",
    }


@app.get("/livez")
async def liveness_check():
    """Process liveness probe that does not depend on external services."""
    return {"status": "alive", "service": "NUVORA", "version": app.version}


@app.get("/v1/healthz")
async def health_check_v1():
    """V1 health check endpoint."""
    return await health_check()


def run_daemon():
    """Run the daemon using uvicorn."""
    import uvicorn
    logger.info("Starting NUVORA API on %s:%s", settings.host, settings.port)
    uvicorn.run(
        "api.app:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    run_daemon()
