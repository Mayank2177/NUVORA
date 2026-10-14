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
from src.storage.instance import get_storage
from src.storage.ratelimit import (
    check_rate_limit,
    close_rate_limiter,
    get_client_identifier,
    get_request_ip,
    ping_rate_limiter,
)
from src.storage.utils import utc_now_iso
from src.storage.utils import verify_jwt
from src.api.concurrency import run_blocking
from src.api.middleware import RequestBodyLimitMiddleware

# Import NUVORA route modules
from src.api.routes import (
    analytics,
    work,
    employer,
    user_settings,
    auth,
    commits,
    continuity,
    evidence,
    github,
    journey,
    marketplace_tasks,
    matching,
    offers,
    onboarding,
    opportunities,
    projects,
    publishing,
    skills,
    users,
    waitlist,
    workspace,
)
from src.mcp.server import router as mcp_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("nuvora")




@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Lifecycle management for the FastAPI application."""
    if settings.database_url:
        import anyio
        limiter = anyio.to_thread.current_default_thread_limiter()
        limiter.total_tokens = min(limiter.total_tokens, settings.database_pool_size)
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
    business_codes = {
        "Current password is required to change email": "CURRENT_PASSWORD_REQUIRED",
        "Current password is incorrect": "CURRENT_PASSWORD_INVALID",
        "Invalid email or password": "INVALID_CREDENTIALS",
        "Invalid or expired MFA challenge": "INVALID_MFA_CHALLENGE",
        "Invalid MFA code": "INVALID_MFA_CODE",
        "MFA challenge already used": "MFA_CHALLENGE_USED",
    }
    if body["error"] in {"Not authenticated", "Session revoked", "Session expired"}:
        body["code"] = "UNAUTHENTICATED"
    elif body["error"] in business_codes:
        body["code"] = business_codes[body["error"]]
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
    return _apply_security_headers(JSONResponse(status_code=500, content={"error": "Internal server error"}))


@app.exception_handler(sqlite3.OperationalError)
async def database_operational_error(_: Request, exc: sqlite3.OperationalError):
    logger.exception("Database operation failed", exc_info=exc)
    message = str(exc).lower()
    if "pool timeout" in message or "postgresql connection unavailable" in message:
        return _apply_security_headers(JSONResponse(
            status_code=503,
            content={"error": "Database temporarily unavailable", "code": "DATABASE_UNAVAILABLE"},
            headers={"Retry-After": "1"},
        ))
    unavailable = any(term in message for term in (
        "unable to open database", "database is locked", "disk i/o", "connection refused",
        "connection is closed", "server closed the connection", "could not connect", "timeout expired",
    ))
    status = 503 if unavailable else 500
    body = "Database temporarily unavailable" if unavailable else "Internal server error"
    return _apply_security_headers(JSONResponse(status_code=status, content={"error": body}))


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
        path = request.url.path
        if path == "/api/auth/csrf":
            return await call_next(request)
        ip_identifier = get_client_identifier(get_request_ip(request))
        identifier = ip_identifier
        token = request.cookies.get(auth.SESSION_COOKIE, "")
        if token:
            try:
                user_id = verify_jwt(token, settings.secret_key).get("sub")
                if user_id:
                    identifier = f"user:{user_id}"
            except Exception:
                pass
        if path.startswith("/api/auth/"):
            tier, limit, window = "auth", settings.rate_limit_auth_max, settings.rate_limit_auth_window
        elif request.method in {"GET", "HEAD", "OPTIONS"}:
            tier, limit, window = "read", settings.rate_limit_read_max, settings.rate_limit_api_window
        else:
            tier, limit, window = "write", settings.rate_limit_api_max, settings.rate_limit_api_window
        try:
            allowed = await check_rate_limit(
                f"api:{tier}:{identifier}", limit, window,
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
                headers={"Retry-After": str(window)},
            ))
    return await call_next(request)

# Configure CORS
if settings.enable_cors:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-ID", "X-CSRF-Token"],
    )

# Include NUVORA API routers
app.include_router(auth.router)
app.include_router(work.router)
app.include_router(employer.router)
app.include_router(user_settings.router)
app.include_router(users.router)
app.include_router(marketplace_tasks.router)
app.include_router(offers.router)
app.include_router(onboarding.router)
app.include_router(opportunities.router)
app.include_router(matching.router)
app.include_router(projects.router)
app.include_router(journey.router)
app.include_router(commits.router)
app.include_router(evidence.router)
app.include_router(evidence.id_router)
app.include_router(publishing.router)
app.include_router(skills.router)
app.include_router(waitlist.router)
app.include_router(analytics.router)
app.include_router(github.router)
app.include_router(continuity.router)
app.include_router(workspace.router)
app.include_router(mcp_router)


@app.get("/healthz")
async def health_check():
    """Health check endpoint."""
    storage = get_storage()
    try:
        await run_blocking(storage.fetchone, "SELECT 1 AS ok")
        if settings.environment.lower() == "production":
            await ping_rate_limiter()
    except Exception as exc:
        from fastapi import HTTPException
        logger.exception("Health check dependency failed", exc_info=exc)
        raise HTTPException(status_code=503, detail="Dependency unavailable") from exc
    return {
        "status": "healthy",
        "service": "NUVORA",
        "version": app.version,
        "timestamp": utc_now_iso(),
        "storage": "postgresql" if settings.database_url else "sqlite",
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
        "src.api.app:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    run_daemon()
