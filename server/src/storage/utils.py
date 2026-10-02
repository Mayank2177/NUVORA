"""Utility functions for storage and data management."""
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
import re


def utc_now_iso() -> str:
    """Return current UTC time in ISO format."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def days_ago(days: int) -> str:
    """Return ISO timestamp for N days ago."""
    dt = datetime.now(timezone.utc) - timedelta(days=days)
    return dt.isoformat().replace("+00:00", "Z")


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse ISO timestamp string to datetime object."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def normalize_iso_timestamp(value: str) -> str:
    """Validate an offset-aware ISO timestamp and normalize it to UTC."""
    parsed = parse_iso(value)
    if parsed is None or parsed.tzinfo is None:
        raise ValueError("timestamp must be an ISO-8601 value with a timezone")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def encode_cursor(timestamp: str, row_id: str) -> str:
    return f"{timestamp}|{row_id}"


def decode_cursor(value: str) -> tuple[str, Optional[str]]:
    timestamp, separator, row_id = value.partition("|")
    if not timestamp:
        raise ValueError("invalid cursor")
    normalized = normalize_iso_timestamp(timestamp)
    return normalized, row_id if separator and row_id else None


def new_id(prefix: str) -> str:
    """Generate a new unique ID with the given prefix."""
    return f"{prefix}-{uuid.uuid4().hex[:20]}"


def json_dumps(value: Any) -> str:
    """Deterministic JSON serialization for storage."""
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def json_loads(value: Any, default: Any = None) -> Any:
    """Safe JSON deserialization with default fallback."""
    if value is None:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def slugify(value: str) -> str:
    """Convert string to URL-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "project"


def normalize_github_repo_url(value: str) -> str:
    """Return a canonical GitHub repository URL or raise ValueError."""
    if not isinstance(value, str):
        raise ValueError("invalid GitHub repository URL")
    cleaned = value.strip().removesuffix(".git").rstrip("/")
    match = re.fullmatch(
        r"(?:https?://github\.com/|git@github\.com:)"
        r"([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)",
        cleaned,
    )
    if not match:
        raise ValueError("invalid GitHub repository URL")
    return f"https://github.com/{match.group(1).lower()}/{match.group(2).lower()}"

################################################################################
# Authentication utilities
################################################################################

import hashlib
import hmac
import secrets
import base64

PBKDF2_ITERATIONS = 600_000
TOKEN_BYTES = 32


def _hash_password_pbkdf2(password: str, salt: Optional[str] = None) -> str:
    """Legacy PBKDF2-SHA256 hash. Kept only so old hashes can be verified/tests can build them."""
    salt_hex = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt_hex}${dk.hex()}"


_ARGON2 = None


def _argon2():
    global _ARGON2
    if _ARGON2 is None:
        from argon2 import PasswordHasher
        _ARGON2 = PasswordHasher()
    return _ARGON2


def hash_password(password: str, salt: Optional[str] = None) -> str:
    """Hash new passwords with Argon2id (requirement S02)."""
    if salt is not None:  # explicit salt => caller wants the legacy scheme
        return _hash_password_pbkdf2(password, salt)
    return _argon2().hash(password)


def password_needs_rehash(stored: str) -> bool:
    """True for legacy PBKDF2 hashes and Argon2 hashes with outdated parameters."""
    if not stored.startswith("$argon2"):
        return True
    return _argon2().check_needs_rehash(stored)


def verify_password(password: str, stored: str) -> bool:
    """Verify against Argon2 (current) or PBKDF2 (legacy, upgraded on next login)."""
    if stored.startswith("$argon2"):
        try:
            return bool(_argon2().verify(stored, password))
        except Exception:
            return False
    try:
        algo, iter_s, salt_hex, digest_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iter_s),
        )
        return hmac.compare_digest(dk.hex(), digest_hex)
    except Exception:
        return False


def sha256_hex(value: str) -> str:
    """Return SHA256 hash of string as hex."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def b64url(data: bytes) -> str:
    """Base64 URL-safe encode without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(data: str) -> bytes:
    """Base64 URL-safe decode with padding restoration."""
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def sign_token(payload: dict[str, Any], secret_key: str) -> str:
    """Sign a token payload using HMAC-SHA256."""
    body = b64url(json_dumps(payload).encode("utf-8"))
    sig = hmac.new(
        secret_key.encode("utf-8"),
        body.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{body}.{b64url(sig)}"


def verify_token(token: str, secret_key: str) -> dict[str, Any]:
    """Verify and decode a signed token."""
    from fastapi import HTTPException
    
    try:
        body, sig = token.split(".", 1)
        expected = hmac.new(
            secret_key.encode("utf-8"),
            body.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(b64url_decode(sig), expected):
            raise ValueError("bad signature")
        payload = json.loads(b64url_decode(body))
        exp = parse_iso(payload.get("exp"))
        if not exp or datetime.now(timezone.utc) > exp:
            raise ValueError("expired")
        if not payload.get("sub"):
            raise ValueError("missing subject")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def new_uuid() -> str:
    """Canonical resource ID (requirement: UUIDs)."""
    return str(uuid.uuid4())


def create_jwt(subject: str, secret_key: str, ttl_hours: int) -> tuple[str, str]:
    """Issue an HS256 JWT. Returns (token, expires_at_iso)."""
    import jwt
    now = datetime.now(timezone.utc)
    exp = now + timedelta(hours=ttl_hours)
    token = jwt.encode(
        {"sub": subject, "iat": int(now.timestamp()), "exp": int(exp.timestamp()),
         "jti": str(uuid.uuid4())},
        secret_key,
        algorithm="HS256",
    )
    return token, exp.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def verify_jwt(token: str, secret_key: str) -> dict[str, Any]:
    """Validate signature, algorithm (HS256 only), expiry and required claims."""
    from fastapi import HTTPException
    import jwt
    try:
        return jwt.decode(
            token, secret_key, algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub", "jti"]},
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def utc_now() -> datetime:
    """Return current UTC datetime object."""
    return datetime.now(timezone.utc)
