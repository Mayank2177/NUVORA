"""Authentication endpoints for NUVORA."""
from typing import Literal, Optional, Union
import logging
import secrets
import sqlite3
import hashlib
import json
import hmac
import time
from datetime import timedelta
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field, field_validator

from src.config import settings
from src.storage.instance import storage
from src.storage.sql import UPDATE_FIELDS, build_update
from src.storage.utils import (
    hash_password, 
    verify_password, 
    create_jwt,
    verify_jwt,
    password_needs_rehash,
    new_uuid,
    sha256_hex,
    sign_token,
    verify_token,
    utc_now,
    utc_now_iso,
    parse_iso,
)
from src.storage.ratelimit import check_rate_limit, get_client_identifier, get_request_ip
from src.storage.encryption import encrypt_token, decrypt_token
from src.storage.email import get_email_provider, send_password_reset_email
from src.storage.totp import new_secret, provisioning_uri, verify_code, new_backup_codes, backup_code_hash
from src.api.concurrency import offload_database, run_blocking
from src.workers.queue import WORKER_HEARTBEAT, enqueue, redis_client

router = APIRouter(prefix="/api/auth", tags=["authentication"])
logger = logging.getLogger(__name__)
_DUMMY_PASSWORD_HASH = hash_password("nuvora-invalid-password")
PASSWORD_MIN_LENGTH = 12


# Request/Response Models
class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=256)
    role: Literal["developer", "employer"]

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
    role: str = "developer"
    avatarUrl: Optional[str] = None
    emailVerified: bool = False
    githubConnected: bool = False
    isAdmin: bool = False
    createdAt: str
    updatedAt: str


class AuthResponse(BaseModel):
    user: UserResponse
    csrfToken: str


class MFAChallengeResponse(BaseModel):
    mfaRequired: bool = True
    challengeToken: str


class MFAChallengeRequest(BaseModel):
    challengeToken: str = Field(min_length=20, max_length=1024)
    code: str = Field(min_length=6, max_length=32)


class MFACodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class MFASetupResponse(BaseModel):
    secret: str
    otpauthUrl: str


class MFADisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)
    password: Optional[str] = Field(default=None, max_length=256)


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


def _mfa_challenge(user_id: str) -> str:
    expires = (utc_now() + timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
    challenge = sign_token({"sub": user_id, "purpose": "mfa-login", "exp": expires,
                            "nonce": secrets.token_urlsafe(24)}, settings.secret_key)
    storage.executemany_tx(lambda conn: (
        conn.execute("DELETE FROM mfa_challenges WHERE expires_at <= ? OR used_at IS NOT NULL", (utc_now_iso(),)),
        conn.execute("INSERT INTO mfa_challenges(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                     (sha256_hex(challenge), user_id, expires)),
    ))
    return challenge


def _verify_mfa_challenge(request: MFAChallengeRequest) -> tuple[str, str]:
    payload = verify_token(request.challengeToken, settings.secret_key)
    if payload.get("purpose") != "mfa-login":
        raise HTTPException(status_code=401, detail="Invalid or expired MFA challenge")
    token_hash = sha256_hex(request.challengeToken)
    challenge = storage.fetchone(
        "SELECT * FROM mfa_challenges WHERE token_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > ?",
        (token_hash, payload["sub"], utc_now_iso()),
    )
    user = storage.get_user_by_id(payload["sub"])
    if not challenge or not user or not user.get("totp_enabled") or not user.get("totp_secret_enc"):
        raise HTTPException(status_code=401, detail="Invalid or expired MFA challenge")
    secret = decrypt_token(user["totp_secret_enc"], settings.encryption_key or settings.secret_key)
    if not secret:
        raise HTTPException(status_code=503, detail="MFA configuration unavailable")
    code = request.code.replace("-", "").upper()
    is_totp = verify_code(secret, code)
    backup_hash = backup_code_hash(code) if len(code) == 16 and code.isascii() and code.isalnum() else ""
    backup_hashes = json.loads(user.get("totp_backup_hashes") or "[]")
    is_backup = backup_hash in backup_hashes
    if not (is_totp or is_backup):
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    now = utc_now_iso()
    def consume(conn):
        claimed = conn.execute(
            "UPDATE mfa_challenges SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
            (now, token_hash, now),
        )
        if claimed.rowcount != 1:
            return False
        if is_backup:
            current = conn.execute("SELECT totp_backup_hashes FROM users WHERE id = ?", (user["id"],)).fetchone()
            codes = json.loads(current["totp_backup_hashes"] or "[]") if current else []
            if backup_hash not in codes:
                return False
            codes.remove(backup_hash)
            conn.execute("UPDATE users SET totp_backup_hashes = ? WHERE id = ?", (json.dumps(codes), user["id"]))
        conn.execute("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (user["id"],))
        return True
    if not storage.executemany_tx(consume):
        raise HTTPException(status_code=401, detail="MFA challenge already used")
    return user["id"], "backup" if is_backup else "totp"


def _session_response(response: Response, user_id: str) -> dict:
    token = create_session(user_id)
    user = storage.user_public(storage.get_user_by_id(user_id), owner=True)
    csrf = _new_csrf_token()
    _set_auth_cookies(response, token, csrf)
    return {"csrfToken": csrf, "user": user}


SESSION_COOKIE = "nuvora_session"
CSRF_COOKIE = "nuvora_csrf"


def _set_auth_cookies(response: Response, token: str, csrf: str) -> None:
    production = settings.environment.lower() == "production"
    options = {
        "httponly": True,
        "secure": production,
        "samesite": "none" if production else "lax",
        "path": "/",
    }
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.token_ttl_hours * 3600, **options)
    response.set_cookie(CSRF_COOKIE, csrf, max_age=settings.token_ttl_hours * 3600, **options)


def _clear_auth_cookies(response: Response) -> None:
    production = settings.environment.lower() == "production"
    options = {
        "secure": production,
        "httponly": True,
        "samesite": "none" if production else "lax",
        "path": "/",
    }
    response.delete_cookie(SESSION_COOKIE, **options)
    response.delete_cookie(CSRF_COOKIE, **options)


def _new_csrf_token() -> str:
    nonce = secrets.token_urlsafe(32)
    signature = hmac.new(settings.secret_key.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    return f"{nonce}.{signature}"


def _valid_csrf_token(value: str) -> bool:
    try:
        nonce, signature = value.rsplit(".", 1)
        expected = hmac.new(settings.secret_key.encode(), nonce.encode(), hashlib.sha256).hexdigest()
        return secrets.compare_digest(signature, expected)
    except (ValueError, TypeError):
        return False


def require_csrf(request: Request) -> None:
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get("X-CSRF-Token", "")
    if not cookie or not secrets.compare_digest(cookie, header) or not _valid_csrf_token(cookie):
        raise HTTPException(status_code=403, detail="CSRF validation failed")


@router.get("/csrf")
def get_csrf_token(request: Request, response: Response):
    token = request.cookies.get(CSRF_COOKIE, "")
    if not _valid_csrf_token(token):
        token = _new_csrf_token()
    response.set_cookie(CSRF_COOKIE, token, max_age=settings.token_ttl_hours * 3600,
                        httponly=True, secure=settings.environment.lower() == "production",
                        samesite="none" if settings.environment.lower() == "production" else "lax", path="/")
    return {"csrfToken": token}


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
    token = request.cookies.get(SESSION_COOKIE, "")
    if token:
        try:
            user_id = verify_jwt(token, settings.secret_key).get("sub")
            if user_id:
                identifier = f"user:{user_id}"
        except HTTPException:
            pass
    
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
            headers={"Retry-After": str(settings.rate_limit_auth_window)},
        )


@offload_database
def require_user(request: Request) -> dict:
    """Require authenticated user. Use with Depends() in route handlers."""
    token = request.cookies.get(SESSION_COOKIE, "")
    if not token or len(token) > 4096:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        require_csrf(request)
    try:
        payload = verify_jwt(token, settings.secret_key)
    except HTTPException as exc:
        raise HTTPException(status_code=401, detail="Session expired") from exc
    
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


async def check_mfa_user_rate_limit(user: dict = Depends(require_user)):
    try:
        allowed = await check_rate_limit(
            f"mfa-account:{sha256_hex(user['id'])}", 5, 300
        )
    except Exception as exc:
        logger.exception("MFA rate limiter unavailable")
        raise HTTPException(status_code=503, detail="Rate limiter unavailable") from exc
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many MFA attempts. Try again later.", headers={"Retry-After": "300"})


async def optional_user(request: Request) -> Optional[dict]:
    """Optional authentication. Use with Depends() in route handlers."""
    if not request.cookies.get(SESSION_COOKIE):
        return None
    try:
        return await require_user(request)
    except HTTPException:
        return None


async def require_admin(user: dict = Depends(require_user)) -> dict:
    """Require admin user. Use with Depends() in route handlers."""
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    
    return user


# Endpoints
@router.post("/signup", status_code=201, response_model=SignupResponse, dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
@offload_database
def signup(request: SignupRequest):
    """Create a new user account with email/password."""
    email = str(request.email).strip().lower()
    
    logger.info("Signup attempt")
    
    password_hash = hash_password(request.password)
    if storage.fetchone("SELECT id FROM users WHERE email = ?", (email,)):
        return SignupResponse()
    
    now = utc_now_iso()
    user_id = new_uuid()
    last_conflict: Optional[sqlite3.IntegrityError] = None
    for _ in range(5):
        username = storage.unique_username(f"user{secrets.token_hex(4)}")

        def transaction(conn):
            conn.execute(
                """
                INSERT INTO users (
                  id, email, name, username, password_hash, role, email_verified,
                  is_admin, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
                """,
                (
                    user_id,
                    email,
                    request.name,
                    username,
                    password_hash,
                    request.role,
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


@router.post("/login", response_model=Union[AuthResponse, MFAChallengeResponse], dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
async def login(request: LoginRequest, http_request: Request, response: Response):
    """Login with per-IP and per-email throttling without account-wide lockout."""
    email = str(request.email).strip().lower()
    
    logger.info("Login attempt")

    def authenticate():
        row = storage.fetchone(
            "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", (email,)
        )
        
        if not row:
            # Run dummy verification to prevent timing attacks
            verify_password(request.password, _DUMMY_PASSWORD_HASH)
            return None
            
        if row["locked_until"]:
            expired = parse_iso(row["locked_until"])
            if expired and expired > utc_now():
                verify_password(request.password, _DUMMY_PASSWORD_HASH)
                return None
            else:
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
            logger.warning("Invalid login credentials")
            return None
        if row["totp_enabled"]:
            return ("mfa", row["id"])
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
        logger.info("Login successful")
        return token, storage.user_public(row, owner=True)

    result = await run_blocking(authenticate)
    if result is None:
        lock_until = (utc_now() + timedelta(minutes=max(1, settings.login_lock_minutes))).isoformat().replace("+00:00", "Z")
        def record_failed_login(conn):
            row = conn.execute("SELECT failed_login_attempts, locked_until FROM users WHERE email = ? AND deleted_at IS NULL",
                               (email,)).fetchone()
            if row:
                attempts = int(row["failed_login_attempts"] or 0) + 1
                locked_until = lock_until if attempts >= settings.login_max_failures else row["locked_until"]
                conn.execute("UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE email = ?",
                             (attempts, locked_until, email))
        await run_blocking(storage.executemany_tx, record_failed_login)
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
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.", headers={"Retry-After": str(max(1, settings.login_lock_minutes) * 60)})
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if result[0] == "mfa":
        challenge = await run_blocking(_mfa_challenge, result[1])
        return {"mfaRequired": True, "challengeToken": challenge}
    token, user = result
    csrf = _new_csrf_token()
    _set_auth_cookies(response, token, csrf)
    return {"csrfToken": csrf, "user": user}


@router.post("/logout", status_code=204)
@offload_database
def logout(
    request: Request,
    response: Response,
    user: dict = Depends(require_user),
):
    """Logout current user."""
    token = request.cookies[SESSION_COOKIE]
    storage.execute(
        "UPDATE sessions SET revoked_at = ? WHERE token_hash = ?",
        (utc_now_iso(), sha256_hex(token)),
    )
    _clear_auth_cookies(response)
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
                raise HTTPException(status_code=400, detail="Current password is required to change email")
        existing = storage.fetchone(
            "SELECT id FROM users WHERE email = ? AND id != ?", (email, user["id"])
        )
        if existing:
            raise HTTPException(status_code=409, detail="Email address is already in use")
        data["email"] = email
        data["email_verified"] = 0
    
    if not data:
        return storage.user_public(user, owner=True)
    
    data["updated_at"] = utc_now_iso()
    statement, values = build_update("users", UPDATE_FIELDS["users"], data)
    
    try:
        storage.execute(
            f"{statement} WHERE id = ?",
            values + (user["id"],),
        )
    except sqlite3.IntegrityError as exc:
        if "email" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Email address is already in use") from exc
        raise
    
    return storage.user_public(get_user_by_id(user["id"]), owner=True)




class PasswordUpdateRequest(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=256)
    newPassword: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=256)


@router.put("/me/password", status_code=200)
@offload_database
def update_password(
    request: PasswordUpdateRequest,
    http_request: Request,
    user: dict = Depends(require_user),
):
    """Update current user's password."""
    if not user.get("password_hash") or not verify_password(request.currentPassword, user["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    
    new_hash = hash_password(request.newPassword)
    now = utc_now_iso()
    
    current_token = http_request.cookies.get(SESSION_COOKIE, "")
    def transaction(conn):
        conn.execute("UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
                     (new_hash, now, user["id"]))
        conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?",
                     (now, user["id"], sha256_hex(current_token)))
    storage.executemany_tx(transaction)
    
    return {"ok": True, "message": "Password updated successfully"}


@router.get("/mfa")
def get_mfa_status(user: dict = Depends(require_user)):
    return {"enabled": bool(user.get("totp_enabled"))}


@router.post("/mfa/setup", response_model=MFASetupResponse, dependencies=[Depends(check_mfa_user_rate_limit)])
@offload_database
def setup_mfa(user: dict = Depends(require_user)):
    if user.get("totp_enabled"):
        raise HTTPException(status_code=409, detail="MFA is already enabled")
    secret = new_secret()
    encrypted = encrypt_token(secret, settings.encryption_key or settings.secret_key)
    storage.execute("UPDATE users SET totp_pending_enc = ? WHERE id = ?", (encrypted, user["id"]))
    return {"secret": secret, "otpauthUrl": provisioning_uri(secret, user["email"])}


@router.post("/mfa/enable", dependencies=[Depends(check_mfa_user_rate_limit)])
@offload_database
def enable_mfa(request: MFACodeRequest, http_request: Request, user: dict = Depends(require_user)):
    if user.get("totp_enabled"):
        raise HTTPException(status_code=409, detail="MFA is already enabled")
    encrypted = user.get("totp_pending_enc")
    secret = decrypt_token(encrypted, settings.encryption_key or settings.secret_key) if encrypted else None
    if not secret or not verify_code(secret, request.code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    codes = new_backup_codes()
    hashes = json.dumps([backup_code_hash(code) for code in codes])
    now = utc_now_iso()
    current_token = http_request.cookies[SESSION_COOKIE]
    def transaction(conn):
        conn.execute(
            "UPDATE users SET totp_secret_enc = ?, totp_pending_enc = NULL, totp_backup_hashes = ?, totp_enabled = 1 WHERE id = ?",
            (encrypted, hashes, user["id"]),
        )
        conn.execute(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?",
            (now, user["id"], sha256_hex(current_token)),
        )
    storage.executemany_tx(transaction)
    return {"enabled": True, "backupCodes": codes}


@router.post("/mfa/disable", dependencies=[Depends(check_mfa_user_rate_limit)])
@offload_database
def disable_mfa(request: MFADisableRequest, http_request: Request, user: dict = Depends(require_user)):
    if not user.get("totp_enabled") or not user.get("totp_secret_enc"):
        raise HTTPException(status_code=409, detail="MFA is not enabled")
    if user.get("password_hash") and (
        not request.password or not verify_password(request.password, user["password_hash"])
    ):
        raise HTTPException(status_code=403, detail="Password is incorrect")
    secret = decrypt_token(user["totp_secret_enc"], settings.encryption_key or settings.secret_key)
    code = request.code.replace("-", "").upper()
    if not secret:
        raise HTTPException(status_code=503, detail="MFA configuration unavailable")
    backup_hash = backup_code_hash(code) if len(code) == 16 and code.isascii() and code.isalnum() else ""
    backup_hashes = json.loads(user.get("totp_backup_hashes") or "[]")
    if not verify_code(secret, code) and backup_hash not in backup_hashes:
        raise HTTPException(status_code=400, detail="Invalid authenticator or recovery code")
    token = http_request.cookies[SESSION_COOKIE]
    now = utc_now_iso()
    def transaction(conn):
        if backup_hash:
            current = conn.execute("SELECT totp_backup_hashes FROM users WHERE id = ?", (user["id"],)).fetchone()
            codes = json.loads(current["totp_backup_hashes"] or "[]") if current else []
            if backup_hash not in codes:
                return False
            codes.remove(backup_hash)
        else:
            codes = []
        conn.execute("UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_pending_enc = NULL, totp_backup_hashes = NULL WHERE id = ?", (user["id"],))
        conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?", (now, user["id"], sha256_hex(token)))
        return True
    if not storage.executemany_tx(transaction):
        raise HTTPException(status_code=400, detail="Recovery code has already been used")
    return {"enabled": False}


@router.post("/mfa/verify", response_model=AuthResponse, dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
async def verify_mfa_login(request: MFAChallengeRequest, http_request: Request, response: Response):
    challenge_key = f"mfa:{sha256_hex(request.challengeToken)}"
    try:
        allowed = await check_rate_limit(challenge_key, 5, 300)
    except Exception as exc:
        logger.exception("MFA rate limiter unavailable")
        raise HTTPException(status_code=503, detail="Rate limiter unavailable") from exc
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many MFA attempts. Request a new login challenge.", headers={"Retry-After": "300"})
    user_id, _ = await run_blocking(_verify_mfa_challenge, request)
    result = await run_blocking(_session_response, response, user_id)
    return result

@router.post("/password-reset-request", status_code=200, dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
@router.post("/password/reset", status_code=200, dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
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
    
    payload = {
        "email": email,
        "token_enc": encrypt_token(raw, settings.encryption_key or settings.secret_key),
        "token_hash": token_hash,
        "user_id": row["id"],
    }
    try:
        queue = redis_client()
        if not queue.exists(WORKER_HEARTBEAT):
            raise RuntimeError("Worker is not running")
        job_id = enqueue(queue, "password_reset_email", payload, owner_id=row["id"])
        logger.info("Queued password reset email job %s", job_id)
    except Exception as exc:
        logger.warning("Using request-process email fallback (%s)", type(exc).__name__)
        background_tasks.add_task(_deliver_password_reset_email, email, raw, row["id"], token_hash)
    return response


def _deliver_password_reset_email(email: str, raw: str, user_id: str, token_hash: str) -> None:
    """Local fallback when Redis or the separate worker is unavailable."""
    if not settings.smtp_password:
        logger.error("Password reset email unavailable: configure NUVORA_SMTP_PASSWORD")
        storage.execute("DELETE FROM password_resets WHERE token_hash = ?", (token_hash,))
        return
    provider = get_email_provider(
        smtp_host=settings.smtp_host, smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user, smtp_password=settings.smtp_password,
        from_email=settings.smtp_from_email, from_name=settings.smtp_from_name,
    )
    for attempt in range(5):
        if send_password_reset_email(
            provider=provider, to_email=email, reset_token=raw,
            base_url=settings.frontend_base_url,
            ttl_minutes=settings.password_reset_ttl_minutes,
        ):
            logger.info("Password reset email delivered for user_id=%s", user_id)
            return
        if attempt < 4:
            time.sleep(min(2 ** attempt, 8))
    logger.error("Password reset delivery exhausted retries for user_id=%s", user_id)
    storage.execute("DELETE FROM password_resets WHERE token_hash = ?", (token_hash,))

    
@router.post("/password/confirm", status_code=200, dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
@router.post("/password-reset/confirm", status_code=200, dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
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


class GitHubConnectRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)
    state: str = Field(min_length=1, max_length=512)


class GitHubConnectResponse(BaseModel):
    ok: bool
    githubLogin: Optional[str] = None
    message: str


@router.post("/github/connect", response_model=GitHubConnectResponse, dependencies=[Depends(check_auth_rate_limit)])
async def github_connect(
    request: GitHubConnectRequest,
    user: dict = Depends(require_user),
):
    """Connect GitHub account to authenticated user."""
    import httpx
    from src.storage.encryption import encrypt_token
    
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    
    # Verify state parameter belongs to this user
    state_hash = sha256_hex(request.state)
    state_row = storage.fetchone(
        """
        SELECT user_id, expires_at FROM oauth_states
        WHERE state_hash = ?
        """,
        (state_hash,),
    )
    
    if not state_row:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    if state_row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="State does not match authenticated user")
    
    expires_at = parse_iso(state_row["expires_at"])
    if not expires_at or utc_now() >= expires_at:
        raise HTTPException(status_code=400, detail="State expired")
    
    # Exchange code for access token
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": request.code,
                    "redirect_uri": settings.github_redirect_uri,
                },
            )
            token_response.raise_for_status()
            token_data = token_response.json()
            
            access_token = token_data.get("access_token")
            if not access_token:
                raise HTTPException(
                    status_code=400,
                    detail=token_data.get("error", "Failed to exchange code for access token")
                )
            
            # Fetch GitHub user info
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            user_response.raise_for_status()
            gh_user = user_response.json()
    
    except httpx.HTTPError as exc:
        logger.exception("GitHub OAuth HTTP request failed")
        raise HTTPException(status_code=502, detail="GitHub API request failed") from exc
    
    # Encrypt and store token
    encryption_key = settings.encryption_key if settings.encryption_key else settings.secret_key
    
    def connect_github():
        encrypted_token = encrypt_token(access_token, encryption_key)
        now = utc_now_iso()
        
        try:
            storage.execute(
                """
                UPDATE users
                SET github_id = ?, github_login = ?, github_token_enc = ?,
                    github_connected_at = ?,
                    avatar_url = COALESCE(?, avatar_url), updated_at = ?
                WHERE id = ?
                """,
                (
                    str(gh_user["id"]),
                    gh_user.get("login"),
                    encrypted_token,
                    now,
                    gh_user.get("avatar_url"),
                    now,
                    user["id"],
                ),
            )
            
            # Consume the state token
            storage.execute(
                "DELETE FROM oauth_states WHERE state_hash = ?",
                (state_hash,),
            )
            
            return gh_user.get("login")
            
        except sqlite3.IntegrityError as exc:
            logger.warning(f"GitHub account {gh_user.get('login')} already connected to another user")
            raise HTTPException(
                status_code=409,
                detail="This GitHub account is already connected to another user"
            ) from exc
    
    github_login = await run_blocking(connect_github)
    
    logger.info(f"Successfully connected GitHub account {github_login} to user {user['id']}")
    
    return GitHubConnectResponse(
        ok=True,
        githubLogin=github_login,
        message=f"Successfully connected GitHub account @{github_login}"
    )


class GitHubLoginRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)
    state: str = Field(min_length=1, max_length=2048)


@router.get("/github/authorize")
def github_login_authorize():
    """Issue a signed, short-lived OAuth state and fixed callback URL."""
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    expires = (utc_now() + timedelta(minutes=10)).isoformat().replace("+00:00", "Z")
    state = sign_token({"sub": "github-login", "purpose": "github-login", "exp": expires,
                        "nonce": secrets.token_urlsafe(24)}, settings.secret_key)
    redirect_uri = f"{settings.frontend_base_url.rstrip('/')}/auth/github/callback"
    query = urlencode({"client_id": settings.github_client_id, "redirect_uri": redirect_uri,
                       "scope": "user:email", "state": state})
    return {"authorizeUrl": f"https://github.com/login/oauth/authorize?{query}", "state": state}


@router.post("/github/login", response_model=Union[AuthResponse, MFAChallengeResponse], dependencies=[Depends(check_auth_rate_limit), Depends(require_csrf)])
async def github_login(request: GitHubLoginRequest, response: Response):
    """Login or signup with GitHub OAuth."""
    import httpx
    from src.storage.encryption import encrypt_token
    
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")

    try:
        state = verify_token(request.state, settings.secret_key)
    except HTTPException as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state") from exc
    if state.get("purpose") != "github-login":
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    
    redirect_uri = f"{settings.frontend_base_url.rstrip('/')}/auth/github/callback"
    
    # Exchange code for access token
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": request.code,
                    "redirect_uri": redirect_uri,
                },
            )
            token_response.raise_for_status()
            token_data = token_response.json()
            
            access_token = token_data.get("access_token")
            if not access_token:
                error_msg = token_data.get("error", "no_access_token")
                error_desc = token_data.get("error_description", "")
                full_error = f"{error_msg}: {error_desc}" if error_desc else error_msg
                logger.error(f"GitHub OAuth failed: {full_error}")
                raise HTTPException(
                    status_code=400,
                    detail=full_error
                )
            
            # Fetch GitHub user info
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            user_response.raise_for_status()
            gh_user = user_response.json()
            
            # Fetch GitHub email if not public
            email = gh_user.get("email")
            if not email:
                email_response = await client.get(
                    "https://api.github.com/user/emails",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github+json",
                    },
                )
                email_response.raise_for_status()
                emails = email_response.json()
                
                # Find primary verified email
                for email_data in emails:
                    if isinstance(email_data, dict) and email_data.get("primary") and email_data.get("verified"):
                        email = email_data.get("email")
                        break
                
                # Fallback to first verified email
                if not email:
                    for email_data in emails:
                        if isinstance(email_data, dict) and email_data.get("verified"):
                            email = email_data.get("email")
                            break
            
            if not email:
                raise HTTPException(
                    status_code=400,
                    detail="No verified email found on GitHub account"
                )
    
    except httpx.HTTPError as exc:
        logger.exception("GitHub OAuth HTTP request failed")
        raise HTTPException(status_code=502, detail="GitHub API request failed") from exc
    
    github_id = str(gh_user["id"])
    github_login = gh_user.get("login")
    name = gh_user.get("name") or github_login or "GitHub User"
    avatar_url = gh_user.get("avatar_url")
    email = email.strip().lower()
    
    # Encrypt token for storage
    encryption_key = settings.encryption_key if settings.encryption_key else settings.secret_key
    
    def login_or_signup():
        encrypted_token = encrypt_token(access_token, encryption_key)
        now = utc_now_iso()

        def finish_login(user_id: str):
            account = storage.get_user_by_id(user_id)
            if account and account.get("totp_enabled"):
                return "mfa", user_id
            session = create_session(user_id)
            return session, storage.user_public(account, owner=True)
        
        # Check if user exists by GitHub ID
        existing_user = storage.fetchone(
            "SELECT * FROM users WHERE github_id = ? AND deleted_at IS NULL",
            (github_id,),
        )
        
        if existing_user:
            # Update existing user's GitHub info and token
            storage.execute(
                """
                UPDATE users
                SET github_login = ?, github_token_enc = ?,
                    github_connected_at = ?,
                    avatar_url = COALESCE(?, avatar_url),
                    email_verified = 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    github_login,
                    encrypted_token,
                    now,
                    avatar_url,
                    now,
                    existing_user["id"],
                ),
            )
            
            return finish_login(existing_user["id"])
        
        # Check if user exists by email
        existing_by_email = storage.fetchone(
            "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL",
            (email,),
        )
        
        if existing_by_email:
            if not existing_by_email["email_verified"]:
                raise HTTPException(status_code=409, detail="Verify the email address before connecting GitHub")
            # Link GitHub to existing email account
            try:
                storage.execute(
                    """
                    UPDATE users
                    SET github_id = ?, github_login = ?, github_token_enc = ?,
                        github_connected_at = ?,
                        avatar_url = COALESCE(?, avatar_url),
                        email_verified = 1,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        github_id,
                        github_login,
                        encrypted_token,
                        now,
                        avatar_url,
                        now,
                        existing_by_email["id"],
                    ),
                )
            except sqlite3.IntegrityError as exc:
                logger.warning(f"GitHub account {github_login} already connected to another user")
                raise HTTPException(
                    status_code=409,
                    detail="This GitHub account is already connected to another user"
                ) from exc
            
            return finish_login(existing_by_email["id"])
        
        # Create new user
        user_id = new_uuid()
        last_conflict: Optional[sqlite3.IntegrityError] = None
        
        for _ in range(5):
            username = storage.unique_username(github_login or f"user{secrets.token_hex(4)}")
            
            try:
                storage.execute(
                    """
                    INSERT INTO users (
                        id, email, name, username, github_id, github_login,
                        github_token_enc, github_connected_at, avatar_url,
                        email_verified, password_hash, is_admin, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, 0, ?, ?)
                    """,
                    (
                        user_id,
                        email,
                        name,
                        username,
                        github_id,
                        github_login,
                        encrypted_token,
                        now,
                        avatar_url,
                        now,
                        now,
                    ),
                )
                break
            except sqlite3.IntegrityError as exc:
                # Check if email was taken by another thread
                if storage.fetchone("SELECT id FROM users WHERE email = ?", (email,)):
                    # Retry the whole flow - user might have been created
                    existing_by_email = storage.fetchone(
                        "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL",
                        (email,),
                    )
                    if existing_by_email:
                        if not existing_by_email["email_verified"]:
                            raise HTTPException(status_code=409, detail="Verify the email address before connecting GitHub")
                        # Link GitHub and login
                        try:
                            storage.execute(
                                """
                                UPDATE users
                                SET github_id = ?, github_login = ?, github_token_enc = ?,
                                    github_connected_at = ?,
                                    avatar_url = COALESCE(?, avatar_url),
                                    email_verified = 1,
                                    updated_at = ?
                                WHERE id = ?
                                """,
                                (
                                    github_id,
                                    github_login,
                                    encrypted_token,
                                    now,
                                    avatar_url,
                                    now,
                                    existing_by_email["id"],
                                ),
                            )
                            return finish_login(existing_by_email["id"])
                        except sqlite3.IntegrityError:
                            pass
                
                last_conflict = exc
        else:
            raise HTTPException(
                status_code=409,
                detail="Could not create user account"
            ) from last_conflict
        
        # Create session for new user
        token = create_session(user_id)
        new_user = storage.get_user_by_id(user_id)
        return token, storage.user_public(new_user, owner=True)
    
    result = await run_blocking(login_or_signup)

    if result[0] == "mfa":
        challenge = await run_blocking(_mfa_challenge, result[1])
        return {"mfaRequired": True, "challengeToken": challenge}
    token, user_data = result
    
    logger.info(f"GitHub login successful for user {user_data['id']} (@{github_login})")
    
    csrf = _new_csrf_token()
    _set_auth_cookies(response, token, csrf)
    return {"csrfToken": csrf, "user": user_data}


@router.delete("/me", status_code=204)
@offload_database
def delete_current_user_account(response: Response, user: dict = Depends(require_user)):
    """Delete the account and its dependent records."""
    user_id = user["id"]
    now = utc_now_iso()

    def delete_account(conn):
        conn.execute(
            """UPDATE marketplace_tasks
               SET assignee_id = NULL, status = 'open', updated_at = ?
               WHERE assignee_id = ? AND status IN ('assigned', 'in_review', 'changes_requested')""",
            (now, user_id),
        )
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

    storage.executemany_tx(delete_account)
    _clear_auth_cookies(response)
    return None
