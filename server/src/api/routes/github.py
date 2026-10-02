"""GitHub integration endpoints for NUVORA."""
from typing import AsyncIterator, List, Optional
from datetime import timedelta
from urllib.parse import urlencode
from contextlib import asynccontextmanager
import json
import re
import hmac
import hashlib
import logging
import secrets
import sqlite3
import httpx
from fastapi import APIRouter, HTTPException, Request, Header, Depends, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from config import settings
from storage.instance import storage
from storage.utils import (
    new_id,
    normalize_github_repo_url,
    normalize_iso_timestamp,
    sign_token,
    utc_now,
    utc_now_iso,
    verify_token,
)
from storage.encryption import encrypt_token, decrypt_token
from api.routes.auth import require_user
from api.concurrency import run_blocking

router = APIRouter(tags=["github-integration"])
logger = logging.getLogger(__name__)
_shared_github_client: Optional[httpx.AsyncClient] = None

# OAuth state configuration
STATE_TTL = timedelta(minutes=10)
ALLOWED_ERROR_REASONS = {"denied", "invalid_state", "exchange_failed"}


def _github_client_options() -> dict:
    return {
        "timeout": httpx.Timeout(20.0, connect=5.0, pool=5.0),
        "limits": httpx.Limits(
            max_connections=100,
            max_keepalive_connections=20,
            keepalive_expiry=30.0,
        ),
        "headers": {"User-Agent": "nuvora"},
    }


async def start_github_client() -> None:
    """Warm the shared outbound connection pool during application startup."""
    global _shared_github_client
    if _shared_github_client is None:
        _shared_github_client = httpx.AsyncClient(**_github_client_options())


async def close_github_client() -> None:
    global _shared_github_client
    if _shared_github_client is not None:
        await _shared_github_client.aclose()
        _shared_github_client = None


@asynccontextmanager
async def _github_http_client() -> AsyncIterator[httpx.AsyncClient]:
    """Reuse connections in a running app; create an isolated client in tests."""
    if _shared_github_client is not None:
        yield _shared_github_client
        return
    async with httpx.AsyncClient(**_github_client_options()) as client:
        yield client

def _encryption_secret() -> str:
    if not settings.encryption_key:
        if settings.environment.lower() == "production":
            raise HTTPException(status_code=503, detail="Token encryption is not configured")
        return settings.secret_key
    return settings.encryption_key


def _parse_github_repo(value: str) -> tuple[str, str]:
    cleaned = value.strip().removesuffix(".git").rstrip("/")
    match = re.fullmatch(
        r"(?:https?://github\.com/|git@github\.com:)([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)",
        cleaned,
    )
    if not match:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")
    return match.group(1), match.group(2)


def _normalize_repo_url(value: str) -> str:
    try:
        return normalize_github_repo_url(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="Invalid GitHub repository URL"
        ) from exc


def _hash_state(state: str) -> str:
    """Hash the OAuth state for secure storage."""
    return hashlib.sha256(state.encode()).hexdigest()


def _build_frontend_redirect(status: str, reason: str | None = None) -> RedirectResponse:
    """Build a safe redirect back to the frontend after OAuth flow.
    
    Fixed base URL - never build from request input (open-redirect risk).
    """
    url = f"{settings.frontend_base_url}/build?github={status}"
    if reason and reason in ALLOWED_ERROR_REASONS:
        url += f"&reason={reason}"
    return RedirectResponse(url, status_code=302)


# Request/Response Models
class GitHubAuthorizeResponse(BaseModel):
    authorizeUrl: str
    expiresIn: int


class GitHubRepo(BaseModel):
    id: int
    fullName: str
    htmlUrl: str
    description: Optional[str] = None
    updatedAt: Optional[str] = None
    defaultBranch: Optional[str] = None
    private: bool = False


class GitHubReposResponse(BaseModel):
    repos: List[GitHubRepo]


class SyncRequest(BaseModel):
    repoUrl: Optional[str] = Field(default=None, max_length=500)
    branch: str = Field(default="main", min_length=1, max_length=255)


class SyncResponse(BaseModel):
    ok: bool
    inserted: int
    fetched: int


def _store_synced_commits(project_id: str, commits: list[dict]) -> int:
    """Persist a GitHub commit batch outside the event-loop thread."""
    now = utc_now_iso()
    def transaction(conn):
        inserted = 0
        for commit in commits:
            if not isinstance(commit, dict):
                continue
            commit_hash = str(commit.get("sha") or "").lower()
            if not re.fullmatch(r"[0-9a-f]{40}", commit_hash):
                continue
            commit_data = commit.get("commit") or {}
            if not isinstance(commit_data, dict):
                continue
            commit_author = commit_data.get("author")
            if not isinstance(commit_author, dict):
                commit_author = {}
            account_author = commit.get("author")
            if not isinstance(account_author, dict):
                account_author = {}
            author = commit_author.get("name") or account_author.get("login")
            try:
                when = normalize_iso_timestamp(commit_author.get("date"))
            except (TypeError, ValueError):
                when = now
            cursor = conn.execute(
                """
                INSERT INTO commits (
                  id, project_id, hash, message, author, committed_at, hidden, kind,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
                ON CONFLICT(project_id, hash) DO NOTHING
                """,
                (
                    new_id("cmt"),
                    project_id,
                    commit_hash,
                    str(commit_data.get("message") or "").split("\n", 1)[0][:2000],
                    str(author)[:200] if author else None,
                    when,
                    now,
                    now,
                ),
            )
            inserted += max(cursor.rowcount, 0)
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?",
            (now, project_id),
        )
        return inserted

    return storage.executemany_tx(transaction)


def _matching_projects(repo_url: str) -> list[dict]:
    normalized_repo = _normalize_repo_url(repo_url)
    rows = storage.fetchall(
        """
        SELECT id, user_id, repo FROM projects
        WHERE deleted_at IS NULL AND LOWER(repo) = ?
        """,
        (normalized_repo.lower(),),
    )
    return [dict(row) for row in rows]


def _store_webhook_commits(projects: list[dict], commits: list[dict]) -> int:
    """Persist signed webhook commits outside the event-loop thread."""
    now = utc_now_iso()
    def transaction(conn):
        synced_count = 0
        for project in projects:
            for commit in commits:
                if not isinstance(commit, dict):
                    continue
                commit_hash = commit.get("id", "")
                if not re.fullmatch(r"[0-9a-fA-F]{40}", commit_hash):
                    continue
                try:
                    committed_at = normalize_iso_timestamp(commit.get("timestamp"))
                except (TypeError, ValueError):
                    committed_at = now
                cursor = conn.execute(
                    """
                    INSERT INTO commits (
                        id, project_id, hash, message, committed_at,
                        kind, hidden, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(project_id, hash) DO NOTHING
                    """,
                    (
                        new_id("cmt"),
                        project["id"],
                        commit_hash.lower(),
                        str(commit.get("message") or "")[:2000],
                        committed_at,
                        "resource",
                        "",
                        now,
                        now,
                    ),
                )
                synced_count += max(cursor.rowcount, 0)
            conn.execute(
                "UPDATE projects SET updated_at = ? WHERE id = ?",
                (now, project["id"]),
            )
        return synced_count

    return storage.executemany_tx(transaction)


# Endpoints
@router.get(
    "/api/integrations/github/authorize",
    response_model=GitHubAuthorizeResponse,
)
async def github_authorize(user: dict = Depends(require_user)):
    """Create a short-lived, user-bound OAuth state and authorization URL."""
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")

    # Create secure OAuth state in database
    state = secrets.token_urlsafe(32)
    state_hash = _hash_state(state)
    expires_at = (utc_now() + STATE_TTL).isoformat().replace("+00:00", "Z")
    
    await run_blocking(
        storage.execute,
        """
        INSERT INTO oauth_states (state_hash, user_id, expires_at)
        VALUES (?, ?, ?)
        """,
        (state_hash, user["id"], expires_at),
    )
    
    # Opportunistic cleanup of expired states
    await run_blocking(
        storage.execute,
        "DELETE FROM oauth_states WHERE expires_at < ?",
        (utc_now_iso(),),
    )
    
    query = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.github_redirect_uri,
            "scope": "read:user user:email repo",
            "state": state,
            "allow_signup": "false",
        }
    )
    return GitHubAuthorizeResponse(
        authorizeUrl=f"https://github.com/login/oauth/authorize?{query}",
        expiresIn=int(STATE_TTL.total_seconds()),
    )


@router.get(
    "/api/integrations/github/callback",
    include_in_schema=False,
)
async def github_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
):
    """Handle GitHub OAuth callback redirect.
    
    No auth dependency: identity comes from the state parameter.
    This is a browser redirect from GitHub, not an API call.
    """
    if error or not code or not state:
        logger.warning(f"GitHub OAuth callback failed: error={error}, code={'present' if code else 'missing'}, state={'present' if state else 'missing'}")
        return _build_frontend_redirect("error", "denied")
    
    # Consume state atomically (single-use, prevents replay attacks)
    state_hash = _hash_state(state)
    row = await run_blocking(
        storage.fetchone,
        """
        DELETE FROM oauth_states 
        WHERE state_hash = ? AND expires_at > ?
        RETURNING user_id
        """,
        (state_hash, utc_now_iso()),
    )
    
    if not row:
        logger.warning(f"GitHub OAuth callback: invalid or expired state")
        return _build_frontend_redirect("error", "invalid_state")
    
    user_id = row["user_id"]
    
    try:
        # Exchange code for access token
        async with _github_http_client() as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": settings.github_redirect_uri,
                },
                timeout=10.0,
            )
            token_response.raise_for_status()
            token_data = token_response.json()
            
            access_token = token_data.get("access_token")
            if not access_token:
                # GitHub returns 200 with {"error": "..."} on failure
                logger.error(f"GitHub OAuth token exchange failed: {token_data.get('error', 'no_access_token')}")
                return _build_frontend_redirect("error", "exchange_failed")
            
            # Fetch GitHub user info
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                },
                timeout=10.0,
            )
            user_response.raise_for_status()
            gh_user = user_response.json()
        
        # Store encrypted token and GitHub login
        now = utc_now_iso()
        encrypted_token = await run_blocking(
            encrypt_token, access_token, _encryption_secret()
        )
        
        try:
            await run_blocking(
                storage.execute,
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
                    user_id,
                ),
            )
        except sqlite3.IntegrityError as exc:
            logger.warning(f"GitHub account {gh_user.get('login')} already connected to another user")
            return _build_frontend_redirect("error", "account_already_connected")
        
        logger.info(f"Successfully connected GitHub account {gh_user.get('login')} for user {user_id}")
        return _build_frontend_redirect("connected")
        
    except httpx.HTTPError as exc:
        logger.exception("GitHub OAuth HTTP request failed")
        return _build_frontend_redirect("error", "exchange_failed")
    except Exception as exc:
        logger.exception("GitHub OAuth callback failed")
        return _build_frontend_redirect("error", "exchange_failed")


@router.delete("/api/integrations/github")
async def github_disconnect(user: dict = Depends(require_user)):
    """Disconnect GitHub account from the current user."""
    await run_blocking(
        storage.execute,
        """
        UPDATE users
        SET github_token_enc = NULL, github_login = NULL, 
            github_connected_at = NULL, updated_at = ?
        WHERE id = ?
        """,
        (utc_now_iso(), user["id"]),
    )
    return {"ok": True}


@router.get("/api/integrations/github/repos", response_model=GitHubReposResponse)
async def github_repos(user: dict = Depends(require_user)):
    """List user's GitHub repositories."""
    
    encrypted_token = user.get("github_token_enc")
    if not encrypted_token:
        raise HTTPException(
            status_code=400,
            detail="GitHub not connected. Use /api/integrations/github/connect first."
        )
    
    # Decrypt the stored token
    try:
        github_token = await run_blocking(
            decrypt_token, encrypted_token, _encryption_secret()
        )
    except Exception as exc:
        logger.exception("Failed to decrypt GitHub token")
        raise HTTPException(
            status_code=400,
            detail="Failed to decrypt GitHub token. Please reconnect your GitHub account."
        ) from exc
    
    try:
        async with _github_http_client() as client:
            response = await client.get(
            "https://api.github.com/user/repos?per_page=100&sort=updated",
            headers={
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "nuvora",
            })
            response.raise_for_status()
            repos = response.json()
            if not isinstance(repos, list):
                raise ValueError("Unexpected GitHub repositories response")
        
        return GitHubReposResponse(
            repos=[
                GitHubRepo(
                    id=r["id"],
                    fullName=r["full_name"],
                    htmlUrl=r["html_url"],
                    description=r.get("description"),
                    updatedAt=r.get("updated_at"),
                    defaultBranch=r.get("default_branch"),
                    private=r.get("private", False),
                )
                for r in repos
            ]
        )
    except Exception as exc:
        logger.exception("GitHub repository listing failed")
        raise HTTPException(status_code=502, detail="GitHub API request failed") from exc


@router.post("/api/projects/{project_id}/sync", response_model=SyncResponse)
async def sync_commits(project_id: str, request: SyncRequest, user: dict = Depends(require_user)):
    """Pull recent commits from GitHub repository."""
    project = await run_blocking(storage.owned_project, project_id, user["id"])
    
    encrypted_token = user.get("github_token_enc")
    if not encrypted_token:
        raise HTTPException(status_code=400, detail="GitHub not connected")
    
    # Decrypt the stored token
    try:
        github_token = await run_blocking(
            decrypt_token, encrypted_token, _encryption_secret()
        )
    except Exception as exc:
        logger.exception("Failed to decrypt GitHub token")
        raise HTTPException(
            status_code=400,
            detail="Failed to decrypt GitHub token. Please reconnect your GitHub account."
        ) from exc
    
    # Parse GitHub repo URL
    repo = request.repoUrl or project.get("repo") or ""
    if project.get("repo"):
        try:
            if _normalize_repo_url(repo) != _normalize_repo_url(project["repo"]):
                raise HTTPException(
                    status_code=400,
                    detail="Repository must match the project repository",
                )
        except HTTPException:
            raise
    owner, name = _parse_github_repo(repo)
    
    try:
        # Fetch commits from GitHub
        async with _github_http_client() as client:
            response = await client.get(
            f"https://api.github.com/repos/{owner}/{name}/commits",
            params={"per_page": 30, "sha": request.branch},
            headers={
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "nuvora",
            })
            response.raise_for_status()
            gh_commits = response.json()
            if not isinstance(gh_commits, list):
                raise ValueError("Unexpected GitHub commits response")
    except Exception as exc:
        logger.exception("GitHub commit synchronization failed")
        raise HTTPException(status_code=502, detail="GitHub API request failed") from exc
    
    try:
        inserted = await run_blocking(
            _store_synced_commits, project_id, gh_commits
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=500, detail="Failed to store GitHub commit") from exc
    
    return SyncResponse(ok=True, inserted=inserted, fetched=len(gh_commits))


@router.post("/api/webhooks/github")
async def github_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
):
    """Receive GitHub webhook for auto-sync."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.github_webhook_max_bytes:
                raise HTTPException(
                    status_code=413, detail="Webhook payload too large"
                )
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail="Invalid Content-Length header"
            ) from exc

    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > settings.github_webhook_max_bytes:
            raise HTTPException(status_code=413, detail="Webhook payload too large")
    body = bytes(chunks)
    
    if not settings.github_webhook_secret:
        raise HTTPException(status_code=503, detail="GitHub webhook is not configured")
    if not x_hub_signature_256:
        raise HTTPException(status_code=401, detail="Missing signature")
        
    expected = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()
        
    if not hmac.compare_digest(x_hub_signature_256, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Only process push events
    if x_github_event != "push":
        return {
            "ok": True,
            "event": x_github_event,
            "message": f"Event '{x_github_event}' ignored (only 'push' events are processed)",
        }
    
    # Extract repository info
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload")
    repo_data = payload.get("repository", {})
    commits_data = payload.get("commits", [])
    if not isinstance(repo_data, dict) or not isinstance(commits_data, list):
        raise HTTPException(status_code=400, detail="Invalid webhook payload")
    repo_url = repo_data.get("html_url", "")
    commits_data = commits_data[:100]
    
    if not repo_url or not commits_data:
        return {
            "ok": True,
            "message": "No commits or repository URL in payload",
        }
    
    # Find all projects matching this repository
    try:
        normalized_repo = _normalize_repo_url(repo_url)
    except HTTPException:
        raise HTTPException(status_code=400, detail="Invalid repository URL in payload")
    matching_projects = await run_blocking(_matching_projects, normalized_repo)
    
    if not matching_projects:
        return {
            "ok": True,
            "message": f"No projects found for repository {repo_url}",
            "commits_count": len(commits_data),
        }
    
    # Auto-sync commits to matching projects
    try:
        synced_count = await run_blocking(
            _store_webhook_commits, matching_projects, commits_data
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=500, detail="Failed to store webhook commit") from exc
    
    return {
        "ok": True,
        "event": x_github_event,
        "repository": repo_url,
        "commits_received": len(commits_data),
        "projects_updated": len(matching_projects),
        "commits_synced": synced_count,
    }
