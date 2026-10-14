"""GitHub integration endpoints for NUVORA."""
from typing import AsyncIterator, List, Literal, Optional
import asyncio
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlparse
from contextlib import asynccontextmanager
import json
import re
import hmac
import hashlib
import logging
import secrets
import sqlite3
import httpx
from fastapi import APIRouter, HTTPException, Request, Response, Header, Depends, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from src.config import settings
from src.storage.instance import storage
from src.storage.utils import (
    new_id,
    normalize_github_repo_url,
    normalize_iso_timestamp,
    utc_now,
    utc_now_iso,
)
from src.storage.encryption import encrypt_token, decrypt_token
from src.api.routes.auth import require_user
from src.api.concurrency import offload_database, run_blocking
from src.workers.queue import enqueue, redis_client

router = APIRouter(tags=["github-integration"])
logger = logging.getLogger(__name__)
_shared_github_client: Optional[httpx.AsyncClient] = None

# OAuth state configuration
STATE_TTL = timedelta(minutes=10)
ALLOWED_ERROR_REASONS = {"denied", "invalid_state", "exchange_failed", "account_already_connected"}


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
    owner, name = match.group(1), match.group(2)
    if owner in {".", ".."} or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")
    return owner, name


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


def _build_frontend_redirect(status: str, reason: str | None = None, return_to: str = "build") -> RedirectResponse:
    """Build a safe redirect back to the frontend after OAuth flow.
    
    Fixed base URL - never build from request input (open-redirect risk).
    """
    page = "onboarding" if return_to == "onboarding" else "build"
    url = f"{settings.frontend_base_url}/{page}?github={status}"
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
    inserted: int = 0
    fetched: int = 0
    queued: bool = False
    jobId: Optional[str] = None


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
                commit_hash = commit_hash.lower()
                if not conn.execute(
                    "SELECT 1 FROM evidence WHERE project_id = ? AND commit_hash = ? LIMIT 1",
                    (project["id"], commit_hash),
                ).fetchone():
                    message = str(commit.get("message") or "")[:2000]
                    source = str(commit.get("url") or "")
                    if not source.startswith("https://github.com/"):
                        source = ""
                    evidence_id = new_id("ev")
                    evidence = {
                        "id": evidence_id, "project_id": project["id"], "kind": "resource",
                        "title": f"Commit: {message.splitlines()[0] if message else 'Repository update'}",
                        "body": "Automatically added from a GitHub push.", "source": source,
                        "occurred_at": committed_at, "ai_assisted": 0, "verified": 0,
                        "publish": 0, "sensitive": 0, "commit_hash": commit_hash,
                        "created_at": now, "updated_at": now,
                    }
                    conn.execute(
                        """INSERT INTO evidence (id, project_id, kind, title, body, source, occurred_at,
                           ai_assisted, verified, publish, sensitive, commit_hash, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        tuple(evidence.values()),
                    )
                    storage.append_evidence_audit(
                        conn, project_id=project["id"], evidence_id=evidence_id,
                        actor_id=project["user_id"], action="create", payload=evidence,
                    )
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
async def github_authorize(
    response: Response,
    return_to: Literal["build", "onboarding"] = Query("build"),
    user: dict = Depends(require_user),
):
    """Create a short-lived, user-bound OAuth state and authorization URL."""
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")

    # Create secure OAuth state in database
    state = secrets.token_urlsafe(32)
    response.set_cookie(
        "github_oauth_state", state, max_age=int(STATE_TTL.total_seconds()),
        httponly=True, secure=settings.environment.lower() == "production",
        samesite="lax", path="/api/integrations/github/callback",
    )
    response.set_cookie(
        "github_oauth_return_to", return_to, max_age=int(STATE_TTL.total_seconds()),
        httponly=True, secure=settings.environment.lower() == "production",
        samesite="lax", path="/api/integrations/github/callback",
    )
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
            "scope": "read:user user:email public_repo",
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
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
):
    """Handle GitHub OAuth callback redirect.
    
    No auth dependency: identity comes from the state parameter.
    This is a browser redirect from GitHub, not an API call.
    """
    def redirect(status: str, reason: str | None = None):
        response = _build_frontend_redirect(status, reason, request.cookies.get("github_oauth_return_to", "build"))
        response.delete_cookie("github_oauth_state", path="/api/integrations/github/callback")
        response.delete_cookie("github_oauth_return_to", path="/api/integrations/github/callback")
        return response

    if error or not code or not state:
        logger.warning(f"GitHub OAuth callback failed: error={error}, code={'present' if code else 'missing'}, state={'present' if state else 'missing'}")
        return redirect("error", "denied")

    if not hmac.compare_digest(request.cookies.get("github_oauth_state", ""), state):
        return redirect("error", "invalid_state")
    
    # Consume state atomically (single-use, prevents replay attacks)
    state_hash = _hash_state(state)
    row = await run_blocking(
        storage.executemany_tx,
        lambda conn: conn.execute(
            "DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING user_id",
            (state_hash, utc_now_iso()),
        ).fetchone(),
    )
    
    if not row:
        logger.warning("GitHub OAuth callback: invalid or expired state")
        return redirect("error", "invalid_state")
    
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
                return redirect("error", "exchange_failed")
            
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
        except sqlite3.IntegrityError:
            logger.warning(f"GitHub account {gh_user.get('login')} already connected to another user")
            return redirect("error", "account_already_connected")
        
        logger.info(f"Successfully connected GitHub account {gh_user.get('login')} for user {user_id}")
        return redirect("connected")
        
    except httpx.HTTPError:
        logger.exception("GitHub OAuth HTTP request failed")
        return redirect("error", "exchange_failed")
    except Exception:
        logger.exception("GitHub OAuth callback failed")
        return redirect("error", "exchange_failed")


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


@router.get("/api/integrations/github/user/{username}")
async def validate_github_user(username: str):
    """Validate a GitHub username and return public repo count (no auth required)."""
    try:
        async with _github_http_client() as client:
            response = await client.get(
                f"https://api.github.com/users/{username}",
                headers={"Accept": "application/vnd.github+json"},
                timeout=10.0,
            )
            response.raise_for_status()
            user_data = response.json()
            
            return {
                "login": user_data.get("login"),
                "public_repos": user_data.get("public_repos", 0),
                "avatar_url": user_data.get("avatar_url"),
            }
    except httpx.HTTPError as exc:
        logger.warning(f"GitHub user validation failed for {username}")
        raise HTTPException(
            status_code=404,
            detail="GitHub user not found"
        ) from exc


@router.get("/api/integrations/github/repo")
async def validate_github_repo(repo: str = Query(..., min_length=3, max_length=200)):
    """Check a public GitHub repository and report its commit and pull request counts."""
    match = re.fullmatch(r"([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)", repo.strip())
    if not match:
        raise HTTPException(status_code=400, detail="Use owner/repository format")
    owner, name = match.groups()

    async def get_count(client: httpx.AsyncClient, resource: str) -> int:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{name}/{resource}",
            params={"per_page": 1, **({"state": "all"} if resource == "pulls" else {})},
            headers={"Accept": "application/vnd.github+json"},
            timeout=10.0,
        )
        if response.status_code == 409 and resource == "commits":
            return 0  # GitHub reports an empty repository as a conflict.
        response.raise_for_status()
        last = response.links.get("last", {}).get("url")
        if last:
            return int(parse_qs(urlparse(last).query).get("page", ["1"])[0])
        return len(response.json())

    try:
        async with _github_http_client() as client:
            repository = await client.get(
                f"https://api.github.com/repos/{owner}/{name}",
                headers={"Accept": "application/vnd.github+json"},
                timeout=10.0,
            )
            repository.raise_for_status()
            commits, prs = await asyncio.gather(
                get_count(client, "commits"), get_count(client, "pulls")
            )
            return {"commits": commits, "prs": prs}
    except httpx.HTTPStatusError as exc:
        status = 404 if exc.response.status_code == 404 else 502
        raise HTTPException(status_code=status, detail="Could not read this public GitHub repository") from exc
    except httpx.HTTPError as exc:
        logger.warning("GitHub repository validation failed for %s/%s", owner, name)
        raise HTTPException(status_code=502, detail="GitHub API request failed") from exc


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
    if not repo:
        raise HTTPException(
            status_code=400,
            detail="No repository URL provided. Either provide repoUrl in request or ensure project has a repo configured."
        )
    
    if project.get("repo") and request.repoUrl:
        try:
            if _normalize_repo_url(repo) != _normalize_repo_url(project["repo"]):
                raise HTTPException(
                    status_code=400,
                    detail="Repository URL must match the project repository",
                )
        except HTTPException:
            raise
    
    try:
        owner, name = _parse_github_repo(repo)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GitHub repository URL: {repo}"
        ) from exc

    if owner.casefold() != str(user.get("github_login") or "").casefold():
        try:
            async with _github_http_client() as client:
                repository = await client.get(
                    f"https://api.github.com/repos/{owner}/{name}",
                    headers={"Authorization": f"Bearer {github_token}",
                             "Accept": "application/vnd.github+json", "User-Agent": "nuvora"},
                )
                repository.raise_for_status()
                permissions = repository.json().get("permissions") or {}
                if not permissions.get("pull"):
                    raise HTTPException(status_code=403, detail="You need read access to this repository")
        except HTTPException:
            raise
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=403, detail="Repository access could not be verified") from exc
    
    try:
        job_id = enqueue(redis_client(), "github_sync", {
            "project_id": project_id, "user_id": user["id"], "repo": repo,
            "owner": owner, "name": name, "branch": request.branch,
        }, owner_id=user["id"])
    except Exception as exc:
        logger.exception("Could not queue GitHub sync")
        raise HTTPException(status_code=503, detail="Background worker queue unavailable") from exc
    return SyncResponse(ok=True, queued=True, jobId=job_id)


async def _project_github_resource(project_id: str, resource: str, limit: int, user: dict) -> list[dict]:
    project = await run_blocking(storage.owned_project, project_id, user["id"])
    encrypted = user.get("github_token_enc")
    if not encrypted or not project.get("repo"):
        raise HTTPException(status_code=400, detail="Connect GitHub and link a repository first")
    try:
        token = await run_blocking(decrypt_token, encrypted, _encryption_secret())
        owner, name = _parse_github_repo(project["repo"])
        params = {"per_page": limit}
        if resource != "commits":
            params.update(sort="updated", direction="desc")
        async with _github_http_client() as client:
            response = await client.get(
                f"https://api.github.com/repos/{owner}/{name}/{resource}",
                params=params,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            )
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, list):
            raise ValueError("Unexpected GitHub response")
        return data
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("GitHub %s fetch failed for project %s", resource, project_id)
        raise HTTPException(status_code=502, detail="GitHub activity could not be loaded") from exc


@router.get("/api/projects/{project_id}/github/pull-requests")
async def project_pull_requests(project_id: str, limit: int = Query(30, ge=1, le=100), user: dict = Depends(require_user)):
    return {"pullRequests": await _project_github_resource(project_id, "pulls", limit, user)}


@router.get("/api/projects/{project_id}/github/issues")
async def project_issues(project_id: str, limit: int = Query(30, ge=1, le=100), user: dict = Depends(require_user)):
    issues = await _project_github_resource(project_id, "issues", limit, user)
    return {"issues": [issue for issue in issues if "pull_request" not in issue]}


@router.get("/api/projects/{project_id}/github/activity")
async def project_activity(project_id: str, limit: int = Query(30, ge=1, le=100), user: dict = Depends(require_user)):
    commits, pulls, issues = await asyncio.gather(
        _project_github_resource(project_id, "commits", limit, user),
        _project_github_resource(project_id, "pulls", limit, user),
        _project_github_resource(project_id, "issues", limit, user),
    )
    events = ([{"type": "commit", **item} for item in commits]
              + [{"type": "pull_request", **item} for item in pulls]
              + [{"type": "issue", **item} for item in issues if "pull_request" not in item])
    events.sort(key=lambda item: item.get("updated_at") or ((item.get("commit") or {}).get("author") or {}).get("date", ""), reverse=True)
    return {"activity": events[:limit]}


@router.post("/api/webhooks/github")
async def github_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
):
    """Receive GitHub webhook for auto-sync."""
    # Check if webhook is configured first, before reading body
    if not settings.github_webhook_secret:
        raise HTTPException(status_code=503, detail="GitHub webhook is not configured")
    if not x_hub_signature_256:
        raise HTTPException(status_code=401, detail="Missing signature")
    
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
    
    try:
        job_id = enqueue(redis_client(), "github_webhook", {
            "repo_url": _normalize_repo_url(repo_url), "commits": commits_data,
        })
    except Exception as exc:
        logger.exception("Could not queue GitHub webhook")
        raise HTTPException(status_code=503, detail="Background worker queue unavailable") from exc
    return {
        "ok": True,
        "event": x_github_event,
        "repository": repo_url,
        "commits_received": len(commits_data),
        "queued": True,
        "jobId": job_id,
    }


@router.get("/api/github/commits")
@offload_database
def get_github_commits(limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0),
                       user: dict = Depends(require_user)):
    rows = storage.fetchall(
        """SELECT c.*, p.name AS project_name FROM commits c
           JOIN projects p ON p.id = c.project_id
           WHERE p.user_id = ? AND p.deleted_at IS NULL
           ORDER BY c.committed_at DESC LIMIT ? OFFSET ?""",
        (user["id"], limit, offset),
    )
    total = storage.fetchone(
        "SELECT COUNT(*) AS total FROM commits c JOIN projects p ON p.id = c.project_id "
        "WHERE p.user_id = ? AND p.deleted_at IS NULL", (user["id"],)
    )["total"]
    return {"commits": [{"id": row["id"], "projectId": row["project_id"],
                         "projectName": row["project_name"], "hash": row["hash"],
                         "message": row["message"], "author": row["author"],
                         "committedAt": row["committed_at"], "kind": row["kind"]}
                        for row in rows], "total": int(total)}


@router.get("/api/github/repositories/{repo_id}/metadata")
async def get_github_repo_metadata(repo_id: str, user: dict = Depends(require_user)):
    if not repo_id.isdecimal():
        raise HTTPException(status_code=400, detail="Repository ID must be numeric")
    headers = {"Accept": "application/vnd.github+json"}
    encrypted = user.get("github_token_enc")
    if encrypted:
        try:
            token = await run_blocking(decrypt_token, encrypted, _encryption_secret())
            headers["Authorization"] = f"Bearer {token}"
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Could not read the connected GitHub token") from exc
    try:
        async with _github_http_client() as client:
            response = await client.get(f"https://api.github.com/repositories/{repo_id}", headers=headers)
            response.raise_for_status()
            repo = response.json()
    except httpx.HTTPStatusError as exc:
        status = 404 if exc.response.status_code == 404 else 502
        raise HTTPException(status_code=status, detail="Could not load GitHub repository metadata") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub API request failed") from exc
    return {"id": repo["id"], "fullName": repo["full_name"], "name": repo["name"],
            "description": repo.get("description"), "url": repo["html_url"],
            "private": repo["private"], "stars": repo["stargazers_count"],
            "forks": repo["forks_count"], "defaultBranch": repo["default_branch"]}


@router.get("/api/jobs/{job_id}")
def get_job_status(job_id: str, user: dict = Depends(require_user)):
    from src.workers.queue import job_status
    status = job_status(redis_client(), job_id)
    if not status or status.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"id": job_id, "status": status["status"], "type": status["type"],
            "result": json.loads(status["result"]) if status.get("result") else None,
            "error": status.get("error")}


