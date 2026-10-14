import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet

from app.config import settings

STATE_TTL = timedelta(minutes=10)
_fernet = Fernet(settings.GITHUB_TOKEN_ENCRYPTION_KEY.encode())


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def encrypt_token(token: str) -> str:
    return _fernet.encrypt(token.encode()).decode()


def decrypt_token(blob: str) -> str:
    return _fernet.decrypt(blob.encode()).decode()


async def create_state(db, user_id: str) -> str:
    state = secrets.token_urlsafe(32)
    await db.execute(
        "INSERT INTO oauth_states (state_hash, user_id, expires_at) VALUES (:h, :u, :e)",
        {"h": _hash(state), "u": user_id, "e": datetime.now(timezone.utc) + STATE_TTL},
    )
    # opportunistic cleanup
    await db.execute("DELETE FROM oauth_states WHERE expires_at < now()")
    return state


async def consume_state(db, state: str) -> str | None:
    """Atomic single-use lookup. Returns user_id or None if unknown, used or expired."""
    row = await db.fetch_one(
        "DELETE FROM oauth_states WHERE state_hash = :h AND expires_at > now() RETURNING user_id",
        {"h": _hash(state)},
    )
    return row["user_id"] if row else None


def build_authorize_url(state: str) -> str:
    qs = urlencode({
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "read:user repo",   # see "Scope warning" at the end
        "state": state,
        "allow_signup": "false",
    })
    return f"https://github.com/login/oauth/authorize?{qs}"


class GitHubOAuthError(Exception):
    pass


async def exchange_code(code: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_REDIRECT_URI,
            },
        )
    r.raise_for_status()
    body = r.json()
    token = body.get("access_token")
    if not token:
        # GitHub returns 200 with {"error": "..."} on failure
        raise GitHubOAuthError(body.get("error", "no_access_token"))
    return token


async def fetch_github_login(token: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
    r.raise_for_status()
    return r.json()["login"]