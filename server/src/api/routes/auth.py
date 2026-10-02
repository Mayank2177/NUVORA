"""Authentication endpoints for NUVORA."""
from typing import Optional
import logging
import secrets
import sqlite3
import hashlib
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Header, Depends, Request, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field, field_validator

from config import settings
from storage.instance import storage
from storage.utils import (
    hash_password, 
    verify_password, 
    create_jwt,
    verify_jwt,
    password_needs_rehash,
    new_uuid,
    sha256_hex,
    utc_now,
    utc_now_iso,
    parse_iso,
)
from storage.email import get_email_provider, send_password_reset_email
from storage.ratelimit import check_rate_limit, get_client_identifier, get_request_ip
from api.concurrency import offload_database, run_blocking

router = APIRouter(prefix="/api/auth", tags=["authentication"])
logger = logging.getLogger(__name__)
_DUMMY_PASSWORD_HASH = hash_password("nuvora-invalid-password")
PASSWORD_MIN_LENGTH = 12


# Request/Response Models
class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=256)

    @field_validator("name")
    @classmethod
    def _nonblank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    username: str
    avatarUrl: Optional[str] = None
    emailVerified: bool = False
    githubConnected: bool = False
    isAdmin: bool = False
    createdAt: str
    updatedAt: str


class AuthResponse(BaseModel):
    user: UserResponse
    token: str


class SignupResponse(BaseModel):
    ok: bool = True
    message: str = "If an account exists or can be created, please log in."


class UserUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    current_password: Optional[str] = Field(default=None, min_length=1, max_length=256)

    @field_validator("name")
    @classmethod
    def _nonblank_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=256)


# Helper functions
def _session_material(user_id: str) -> tuple[str, str, str]:
    """Issue a JWT (7-day default). Sessions stay server-side for revocation."""
    token, expires_at = create_jwt(user_id, settings.secret_key, settings.token_ttl_hours)
    return token, sha256_hex(token), expires_at


def create_session(user_id: str) -> str:
    """Create a session and clean expired rows in one transaction."""
    token, token_hash, expires_at = _session_material(user_id)

    def transaction(conn):
        conn.execute(
            "DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL",
            (utc_now_iso(),),
        )
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token_hash, user_id, utc_now_iso(), expires_at),
        )

    storage.executemany_tx(transaction)
    return token


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Get user by ID."""
    return storage.get_user_by_id(user_id)


# Dependencies (use with Depends() in route handlers)
async def check_auth_rate_limit(request: Request):
    """Rate limit dependency for auth endpoints."""
    if not settings.rate_limit_enabled:
        return
    
    # Get client IP
    client_ip = get_request_ip(request)
    identifier = get_client_identifier(client_ip)
    
    try:
        allowed = await check_rate_limit(
            identifier,
            settings.rate_limit_auth_max,
            settings.rate_limit_auth_window,
        )
    except Exception as exc:
        logger.exception("Distributed rate limiter unavailable")
        raise HTTPException(status_code=503, detail="Rate limiter unavailable") from exc
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Please try again in {settings.rate_limit_auth_window} seconds.",
        )


@offload_database
def require_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """Require authenticated user. Use with Depends() in route handlers."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ", 1)[1].strip()
    if not token or len(token) > 4096:
        raise HTTPException(status_code=401, detail="Invalid token")
    payload = verify_jwt(token, settings.secret_key)
    
    # Resolve the session and user in one indexed query. This dependency runs
    # for every protected request, so an extra round trip is directly visible
    # in endpoint latency.
    user = storage.fetchone(
        """
        SELECT users.*, sessions.user_id AS session_user_id,
               sessions.expires_at AS session_expires_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
          AND sessions.revoked_at IS NULL
          AND users.deleted_at IS NULL
        """,
        (sha256_hex(token),),
    )
    if not user or user["session_user_id"] != payload["sub"]:
        raise HTTPException(status_code=401, detail="Session revoked")
    expires_at = parse_iso(user["session_expires_at"])
    if not expires_at or utc_now() >= expires_at:
        raise HTTPException(status_code=401, detail="Session expired")

    return dict(user)


async def optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[dict]:
    """Optional authentication. Use with Depends() in route handlers."""
    if not authorization:
        return None
    try:
        return await require_user(authorization)
    except HTTPException:
        return None


async def require_admin(user: dict = Depends(require_user)) -> dict:
    """Require admin user. Use with Depends() in route handlers."""
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    
    return user


# Endpoints
@router.post("/signup", status_code=201, response_model=SignupResponse, dependencies=[Depends(check_auth_rate_limit)])
@offload_database
def signup(request: SignupRequest):
    """Create a new user account with email/password."""
    email = str(request.email).strip().lower()
    password_hash = hash_password(request.password)
    if storage.fetchone("SELECT id FROM users WHERE email = ?", (email,)):
        return SignupResponse()
    
    now = utc_now_iso()
    user_id = new_uuid()
    last_conflict: Optional[sqlite3.IntegrityError] = None
    for _ in range(5):
        username = storage.unique_username(email.split("@")[0])

        def transaction(conn):
            conn.execute(
                """
                INSERT INTO users (
                  id, email, name, username, password_hash, email_verified,
                  is_admin, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
                """,
                (
                    user_id,
                    email,
                    request.name,
                    username,
                    password_hash,
                    now,
                    now,
                ),
            )

        try:
            storage.executemany_tx(transaction)
            break
        except sqlite3.IntegrityError as exc:
            if storage.fetchone("SELECT id FROM users WHERE email = ?", (email,)):
                return SignupResponse()
            last_conflict = exc
    else:
        raise HTTPException(
            status_code=409, detail="Could not allocate a unique username"
        ) from last_conflict
    
    return SignupResponse()


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(check_auth_rate_limit)])
async def login(request: LoginRequest, http_request: Request):
    """Login with per-IP and per-email throttling without account-wide lockout."""
    email = str(request.email).strip().lower()

    def authenticate():
        row = storage.fetchone(
            "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", (email,)
        )
        if row and row["locked_until"]:
            expired = parse_iso(row["locked_until"])
            if not expired or expired <= utc_now():
                storage.execute(
                    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
                    (row["id"],),
                )
        stored = row["password_hash"] if row and row["password_hash"] else _DUMMY_PASSWORD_HASH
        valid = bool(row and row["password_hash"] and verify_password(request.password, stored))
        if not row or not row["password_hash"]:
            verify_password(request.password, _DUMMY_PASSWORD_HASH)
        elif stored and not stored.startswith("$argon2"):
            verify_password(request.password, _DUMMY_PASSWORD_HASH)
        if not valid:
            return None
        if password_needs_rehash(stored):
            storage.execute(
                "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
                (hash_password(request.password), utc_now_iso(), row["id"]),
            )
        else:
            storage.execute(
                "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
                (row["id"],),
            )
        token = create_session(row["id"])
        return token, storage.user_public(row, owner=True)

    result = await run_blocking(authenticate)
    if result is None:
        ip = get_request_ip(http_request)
        identifier = f"login:{hashlib.sha256(ip.encode()).hexdigest()}:{sha256_hex(email)}"
        try:
            allowed = await check_rate_limit(
                identifier, settings.login_max_failures,
                max(1, settings.login_lock_minutes) * 60,
            )
        except Exception as exc:
            logger.exception("Login rate limiter unavailable")
            raise HTTPException(status_code=503, detail="Rate limiter unavailable") from exc
        if not allowed:
            raise HTTPException(status_code=429, detail="Invalid email or password")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token, user = result
    return {"token": token, "user": user}


@router.post("/logout", status_code=204)
@offload_database
def logout(
    authorization: Optional[str] = Header(default=None),
    user: dict = Depends(require_user),
):
    """Logout current user."""
    token = authorization.split(" ", 1)[1].strip()
    
    storage.execute(
        "UPDATE sessions SET revoked_at = ? WHERE token_hash = ?",
        (utc_now_iso(), sha256_hex(token)),
    )
    
    return None


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(user: dict = Depends(require_user)):
    """Get current user profile."""
    return storage.user_public(user, owner=True)


@router.patch("/me", response_model=UserResponse)
@offload_database
def update_current_user(
    request: UserUpdateRequest,
    user: dict = Depends(require_user),
):
    """Update current user profile."""
    data = {}
    if request.name is not None:
        data["name"] = request.name
    if request.email is not None:
        email = str(request.email).strip().lower()
        if email != user["email"].lower():
            if not user.get("password_hash") or not request.current_password or not verify_password(request.current_password, user["password_hash"]):
                raise HTTPException(status_code=401, detail="Current password is required to change email")
        existing = storage.fetchone(
            "SELECT id FROM users WHERE email = ? AND id != ?", (email, user["id"])
        )
        if existing:
            return storage.user_public(user, owner=True)
        data["email"] = email
        data["email_verified"] = 0
    
    if not data:
        return storage.user_public(user, owner=True)
    
    data["updated_at"] = utc_now_iso()
    sets = ", ".join(f"{k} = ?" for k in data)
    
    try:
        storage.execute(
            f"UPDATE users SET {sets} WHERE id = ?",
            tuple(data.values()) + (user["id"],),
        )
    except sqlite3.IntegrityError as exc:
        if "email" in str(exc).lower():
            return storage.user_public(user, owner=True)
        raise
    
    return storage.user_public(get_user_by_id(user["id"]), owner=True)


@router.post("/password-reset-request", status_code=200, dependencies=[Depends(check_auth_rate_limit)])
@router.post("/password/reset", status_code=200, dependencies=[Depends(check_auth_rate_limit)])
@offload_database
def request_password_reset(request: PasswordResetRequest, background_tasks: BackgroundTasks):
    """Request password reset email."""
    email = str(request.email).strip().lower()
    row = storage.fetchone(
        "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", (email,)
    )
    
    response = {
        "ok": True,
        "message": "If an account exists, a password reset email has been sent",
    }
    
    if not row or not row["password_hash"]:
        return response

    latest = storage.fetchone(
        """
        SELECT created_at FROM password_resets
        WHERE user_id = ? AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1
        """,
        (row["id"],),
    )
    latest_at = parse_iso(latest["created_at"]) if latest else None
    if latest_at and (
        utc_now() - latest_at
    ).total_seconds() < settings.password_reset_min_interval_seconds:
        return response
    
    raw = secrets.token_urlsafe(32)
    now = utc_now()
    exp = now + timedelta(minutes=settings.password_reset_ttl_minutes)

    token_hash = sha256_hex(raw)
    created_at = now.isoformat().replace("+00:00", "Z")
    expires_at = exp.isoformat().replace("+00:00", "Z")

    def transaction(conn):
        conn.execute(
            "DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL OR user_id = ?",
            (utc_now_iso(), row["id"]),
        )
        conn.execute(
            """
            INSERT INTO password_resets (token_hash, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token_hash, row["id"], created_at, expires_at),
        )

    storage.executemany_tx(transaction)
    
    background_tasks.add_task(_deliver_password_reset_email, email, raw, row["id"], token_hash)
    return response


def _deliver_password_reset_email(email: str, raw: str, user_id: str, token_hash: str) -> None:
    """Deliver reset email after the generic response has been returned."""
    email_provider = get_email_provider(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_password=settings.smtp_password,
        from_email=settings.smtp_from_email,
        from_name=settings.smtp_from_name,
        allow_log_provider=settings.environment.lower() == "development",
    )
    
    delivered = send_password_reset_email(
        provider=email_provider,
        to_email=email,
        reset_token=raw,
        base_url=settings.frontend_base_url,
        ttl_minutes=settings.password_reset_ttl_minutes,
    )
    if not delivered:
        logger.error("Password reset delivery failed for user_id=%s", user_id)
        storage.execute(
            "DELETE FROM password_resets WHERE token_hash = ?", (token_hash,)
        )

    
@router.post("/password/confirm", status_code=200, dependencies=[Depends(check_auth_rate_limit)])
@router.post("/password-reset/confirm", status_code=200, dependencies=[Depends(check_auth_rate_limit)])
@offload_database
def confirm_password_reset(request: PasswordConfirmRequest):
    """Confirm password reset with token."""
    row = storage.fetchone(
        "SELECT * FROM password_resets WHERE token_hash = ?",
        (sha256_hex(request.token),),
    )
    
    if not row or row["used_at"]:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    
    expires_at = parse_iso(row["expires_at"])
    if not expires_at or utc_now() > expires_at:
        raise HTTPException(status_code=400, detail="Reset token expired")
    
    now = utc_now_iso()
    password_hash = hash_password(request.password)

    def transaction(conn):
        claimed = conn.execute(
            """
            UPDATE password_resets SET used_at = ?
            WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
            """,
            (now, row["token_hash"], now),
        )
        if claimed.rowcount != 1:
            return False
        conn.execute(
            """
            UPDATE users SET password_hash = ?, failed_login_attempts = 0,
              locked_until = NULL, updated_at = ? WHERE id = ?
            """,
            (password_hash, now, row["user_id"]),
        )
        conn.execute(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
            (now, row["user_id"]),
        )
        return True

    if not storage.executemany_tx(transaction):
        raise HTTPException(status_code=400, detail="Invalid reset token")
    
    return {"ok": True}
