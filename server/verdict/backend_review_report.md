# Backend Review Report: `backend.zip`

**Scope:** 6 conditions: production-grade, bug-free, Next.js integrable, latency, reliability, scalable.
**Files reviewed:** all 45 source/config files in the archive (`__pycache__` excluded). Total about 5,960 lines of Python.

## How to read this report

The sandbox had no network access, so `fastapi` and `pydantic` could not be installed and **the API was never started**. Each finding is tagged by how it was checked:

| Tag | Meaning |
|---|---|
| **[RAN]** | Executed against the real code using stdlib-only stubs (`/tmp/verify.py`) or grep |
| **[READ]** | Certain from the code alone (Python / sqlite3 semantics) |
| **[LIB]** | Depends on documented library behaviour (FastAPI / pydantic) that I did **not** execute. Confirm with a test |

Line numbers are per file. Nothing below is claimed without one of these tags.

---

## 1. Verdict

| Condition | Result | Main reason |
|---|---|---|
| Production-grade | **Fail** | Reset token returned in API response, unauthenticated webhook by default, home-made cipher |
| Bug-free | **Fail** | Several endpoints crash; response models don't match the data they return |
| Next.js integrable | **Fail** | `.env.example` uses the wrong prefix, missing dependencies, advertised routes don't exist |
| Latency | **Fail** | Blocking calls inside `async def`, new DB connection per query, N+1 queries |
| Reliability | **Fail** | Uncaught constraint errors, silent `except: continue`, large dead/legacy code paths |
| Scalable | **Fail** | In-process rate limiter/event bus, 9 separate `Storage` instances, page-size "total" |

---

## 2. Bugs that crash or break endpoints

### 2.1 `/api/auth/me`, `PATCH /api/auth/me`, `/api/auth/logout` return 500 [READ]
- **Where:** `src/api/routes/auth.py` lines 225, 239, 249.
- **Problem:** `user = await require_user(authorization)`. `require_user` (line 114) is a plain `def` returning a `dict`, so `await` on it raises `TypeError`.
- **Fix:** use dependency injection, as `projects.py` does:
  ```python
  async def get_current_user_profile(user: dict = Depends(require_user)):
      return storage.user_public(user, owner=True)
  ```
  Do the same for `logout` and `update_current_user`. For `logout`, read the token from the `Authorization` header via a small dependency.

### 2.2 `GET /api/waitlist` (admin) is broken [READ]
- **Where:** `src/api/routes/waitlist.py` line 70.
- **Problem:** `await require_admin()` is called with no argument. Its `user` parameter defaults to a `Depends` object, and it is not awaitable anyway. The endpoint crashes and never performs a real admin check.
- **Fix:** remove line 70 and add `admin: dict = Depends(require_admin)` to the function signature.

### 2.3 `POST /api/projects/{id}/publish` always crashes [RAN]
- **Where:** `src/api/routes/publishing.py` line 135 (also 136, 137). Rows come from `storage.fetchall` at line 112.
- **Problem:** `e.get("title")` is called on a `sqlite3.Row`. `sqlite3.Row` has no `.get` (`hasattr(sqlite3.Row, 'get')` is `False`).
- **Fix:** after line 115, add `rows = [dict(r) for r in rows]`. Do the same wherever `.get` is used on a row (`publishing.py` line 94 uses `pub.get(...)` on a `dict`, which is fine, but line 275 `owner.get` works only because `get_user_by_id` returns a dict).

### 2.4 Response models require fields the code never returns [READ for the mismatch, LIB for the 500]
| Model | Requires | Formatter returns | Location |
|---|---|---|---|
| `ProjectResponse` (`projects.py:42-53`) | `createdAt`, `updatedAt`, `commitCount`, `evidenceCount`, `repo: str`, `summary: str`, `span: str` | `created_at`, `updated_at`, `commit_count`, `evidence_count`, nullable repo/summary/span | `db.py:1593` `hydrate_project` |
| `CommitResponse` (`commits.py:34-40`) | `createdAt` | `created_at` | `db.py:1639` `commit_row` |
| `EvidenceResponse` (`evidence.py:42-54`) | `createdAt`, `source: str` | `created_at`, `source` may be `NULL` | `db.py:1657` `evidence_row` |
| `WaitlistEntry` (`waitlist.py:29-32`) | `joinedAt`, `tools: str` | `joined_at`, `tools` nullable | `waitlist.py:82` |

- **Impact:** endpoints using `response_model` should fail validation with a 500. Endpoints without one (`GET/POST/PATCH /api/projects...`) return snake_case, which contradicts the declared models.
- **Fix:** choose one casing (camelCase for a Next.js frontend). Emit it from the formatters. Make nullable columns `Optional[...]` in models. Use pydantic `alias_generator=to_camel` with `populate_by_name=True`.

### 2.5 Recreating a deleted project fails [RAN]
- **Where:** `src/storage/schema.py:49` (`UNIQUE (user_id, slug)`), `src/storage/db.py:1690` (`unique_slug`).
- **Problem:** deletes are soft (`deleted_at`). `unique_slug` ignores deleted rows and returns `my-app` again, but the UNIQUE constraint still counts the deleted row. The verified result is `IntegrityError: UNIQUE constraint failed: projects.user_id, projects.slug`.
- **Fix:** replace the table constraint with a partial index:
  ```sql
  CREATE UNIQUE INDEX uq_projects_user_slug ON projects(user_id, slug) WHERE deleted_at IS NULL;
  ```

### 2.6 Wrong error for invalid `kind` [RAN]
- **Where:** `commits.py:24, 103`; `evidence.py:20`.
- **Problem:** `kind` is a free `str`. A bad value raises a CHECK-constraint `IntegrityError`. `commits.py:103` reports every `IntegrityError` as "Commit hash already exists". `evidence.py` does not catch it, so it returns 500.
- **Fix:** `kind: Literal["resource","snag","proof","ai"]` in `CommitCreate`, `CommitUpdate`, `EvidenceCreate`. Catch `IntegrityError` narrowly and inspect the message.

### 2.7 Other functional bugs
| Issue | Location | Detail |
|---|---|---|
| Wrong pagination total | `projects.py:96-97` | `total = len(rows)` is the page size, not the total count. Run a `COUNT(*)` |
| Repo names with dots truncated | `github.py:212` | Regex `([^/.]+)` turns `next.js` into `next`. Strip a trailing `.git` instead |
| Duplicate commits | `github.py:351` vs `:243` | Webhook stores 7-char hashes, sync stores full SHAs, so the same commit is stored twice |
| Reset email always says 60 min | `storage/email.py:155, 182` | Hard-coded, ignores `password_reset_ttl_minutes` |
| Branch not URL-encoded | `github.py:221` | `sha={request.branch}` is interpolated raw. Use `urlencode` |
| `owner`/`name` not validated before URL build | `github.py:216-221` | Regex limits characters, but nothing else validates it |

---

## 3. Security (production-grade blockers)

### 3.1 Password-reset token leaked in the response [READ]
- **Where:** `auth.py:324-326`.
- **Problem:** when SMTP is not configured, the response includes `dev_token`. Anyone who knows an email can reset that account's password.
- **Fix:** delete it. In dev mode, log the link server-side only, behind an explicit `NUVORA_ENV=dev` flag.

### 3.2 GitHub webhook is unauthenticated by default [READ]
- **Where:** `github.py:295` (`if settings.github_webhook_secret:`), default is `""` (`config.py:36`).
- **Problem:** with no secret set, anyone can POST commits into any project. `github.py:334` also does `repo LIKE '%{repo_url}%'` with the payload's unescaped `repo_url`, so `%` matches every project.
- **Fix:** refuse with 503 when the secret is unset. Compare normalized exact repo URLs instead of `LIKE`.

### 3.3 Auth rate limiter is never used [RAN]
- **Where:** `auth.py:93` defines `check_auth_rate_limit`. A grep shows no `Depends(check_auth_rate_limit)` anywhere.
- **Fix:** add `dependencies=[Depends(check_auth_rate_limit)]` to `signup`, `login`, `password/reset`, `password/confirm`.

### 3.4 Home-made encryption for GitHub tokens [RAN]
- **Where:** `storage/encryption.py:36, 81`.
- **Problem:** XOR with a 32-byte key repeated over the message. Verified: `ct[i]^ct[i+32] == pt[i]^pt[i+32]` is `True`. The file's own docstring says to replace it before production.
- **Fix:** use `cryptography` (`Fernet` or `AESGCM`), with the key derived once at startup rather than per call.

### 3.5 Session and token handling
| Issue | Location | Verified |
|---|---|---|
| Token with no `exp` claim is accepted | `storage/utils.py:139` | [RAN] `verify_token` returned the payload |
| Expired session rows never purged | `sessions` table | [READ] |
| Password has no minimum length | `auth.py:29-32, 60-63` | [READ] |
| `PATCH /me` changes email with no uniqueness check or re-verification | `auth.py:254-266` | [READ] |
| Signup/username races (check-then-insert) can return 500 | `auth.py:160-186`, `db.py:1678` | [READ] |

### 3.6 Config and publishing
| Issue | Location | Note |
|---|---|---|
| Weak-key filter rejects keys containing "dev", "test", "secret" | `config.py:76-78` | Can reject a valid random key. Check entropy/length instead |
| Demo seed creates an **admin** with a fixed password | `api/app.py:49` (`seed_demo`) | Guard behind a dev flag and never in production |
| Commit messages are published but not secret-scanned | `publishing.py:260-263` | Only evidence and project text are scanned |
| Phone-number regex is broad | `storage/security.py:70` | Likely false positives. Warning level only |
| `allow_credentials=True` with configurable origins | `app.py:165` | Fine if origins are exact. Never use `*` |

---

## 4. Next.js integration

| Issue | Location | Verified |
|---|---|---|
| `.env.example` uses `CONTINUITY_*` (9 lines), code reads `NUVORA_*` | `.env.example`, `config.py:10` | [RAN] grep |
| `secret_key`, `public_base_url`, `cors_origins` are required by validators | `config.py:64-120` | [LIB] the app will fail at import with the shipped example |
| `list[str]` env vars given as comma-separated strings | `config.py:27, 39, 101-127` | [LIB] pydantic-settings JSON-decodes complex types **before** your `mode="before"` validator. Verify with a test, or use `NoDecode` |
| `EmailStr` needs `email-validator`, which is not in `pyproject.toml` or `requirements.txt` | auth/waitlist models | [RAN] grep |
| `typer`/`rich` missing from `requirements.txt` (present in `pyproject.toml`) | `requirements.txt` | [RAN] grep |
| README says `uvicorn api.app:app`, but code lives in `src/` | README | [READ] works only from `src/` or with `PYTHONPATH=src` |
| Top-level packages named `mcp` and `config` can shadow installed packages | `src/mcp`, `src/config.py` | [READ] |
| README advertises `POST /v1/mcp`, but `handle_mcp_rpc` is never mounted | `mcp/server.py`, `app.py` | [RAN] grep |
| `github_redirect_uri` points to `/api/auth/github/callback`, which does not exist | `config.py:35` | [RAN] grep |
| Public page GET writes to the DB on every view; no cache headers | `publishing.py:265, 295, 333` | [READ] breaks CDN/ISR caching. Move counting to a background task |
| Casing inconsistent (snake_case in some payloads, camelCase in others) | routes and formatters | [READ] |
| Requires `Authorization: Bearer` header only. No cookie option | `auth.py:114-120` | [READ] fine for SPA. For Next.js SSR, plan how the token is stored (httpOnly cookie via a Next route handler) |

---

## 5. Latency

| Issue | Location | Evidence |
|---|---|---|
| Blocking work in `async def`: sqlite calls, PBKDF2, and `urllib` with 15–20 s timeouts | all routes; `github.py:78, 94, 108, 172, 228` | [READ] blocks the event loop |
| `hash_password` about 133 ms per call | `storage/utils.py:86` | [RAN] |
| `encrypt_token` about 58 ms per call (PBKDF2 each time) | `storage/encryption.py:11` | [RAN] |
| New connection plus 4 PRAGMAs on every query: 200 queries took 61 ms vs 1 ms on one connection | `db.py:22-29` | [RAN] |
| N+1: two extra queries per project in the list | `projects.py:92` via `db.py:1593` | [READ] |
| N+1: SELECT and INSERT per synced commit | `github.py:237-274` | [READ] |
| Analytics loads all rows into Python | `analytics.py:38-66` | [READ] use `COUNT`/`SUM ... GROUP BY` |
| `LIKE '%q%'` search cannot use an index | `projects.py:80-83` | [READ] |
| Missing indexes: `projects(user_id, updated_at)`, `commits(project_id, kind)` | `schema.py:102-105` | [READ] |

**Fixes:**
1. Make DB/hash/HTTP handlers plain `def`, or call `run_in_threadpool`. Replace `urllib` with `httpx.AsyncClient`.
2. Keep one long-lived connection per thread (`threading.local`) and set `journal_mode=WAL` once at init.
3. Batch inserts with `executemany` and `INSERT ... ON CONFLICT DO NOTHING`.
4. Fetch commit/evidence counts with one grouped query for the whole list.

---

## 6. Reliability

### 6.1 Large parts of the codebase target a different, non-existent schema [RAN]
- `storage/db.py` queries **15 tables that are not in `schema.py`**: `attempt, blocker, decision, feedback, goal, idempotency, integration, project, publication, reflection, resource, skill, stage, suggestion, task`.
- `db.py:140` uses `settings.default_owner_id`, which is not defined in `config.py`.
- `db.py:76-80` (`_evidence`) parses `payload` and `skill_ids` columns that the `evidence` table does not have.
- `Storage.seed_if_empty` (`db.py:1113`) and the MCP handlers (`mcp/server.py`) rely on this legacy layer and would fail.
- `domain/`, `mcp/`, `cli/` are not connected to the running FastAPI app.
- `cli/main.py` prints hard-coded fake output (no API calls).
- `GET /v1/guidance/next` returns a fixed placeholder (`app.py:209`).
- The README describes an append-only hash-chained ledger. The hash-chain module works in isolation [RAN: valid chain accepted, tampering detected], but no active route uses it.
- **Fix:** delete or move the legacy code into a separate package. Make the README describe only what runs.

### 6.2 Other reliability issues
| Issue | Location |
|---|---|
| Nine separate `Storage()` instances (one per module), so nine independent `_write_lock`s that don't coordinate | `app.py:27`, `auth.py:25`, `evidence.py:15`, `publishing.py:18`, `waitlist.py:15`, `analytics.py:12`, `projects.py:14`, `commits.py:15`, `github.py:21` |
| Silent `except Exception: continue` swallows real errors | `github.py:272, 387` |
| Storage created at **import time**, so a bad config crashes on import | every route module |
| `signup` check-then-insert without catching `IntegrityError` | `auth.py:160-186` |
| `/healthz` never touches the DB and hard-codes `"sqlite_mode": "WAL"` | `app.py:182-193` |
| No graceful handling of failed SMTP: `send_password_reset_email` return value is ignored | `auth.py:316` |
| No tests: README references `tests/`, `service.py`, `CONVERSION_GUIDE.md`, `future.txt`. None are in the zip | [RAN] `ls` |
| Archive contains `__pycache__/*.pyc` compiled by Python 3.14 | zip listing |
| `pyproject.toml` hatchling has no package config, and script entry points reference `api.app` / `cli.main` | not tested |

---

## 7. Scalability

| Issue | Location | Note |
|---|---|---|
| In-process rate limiter: not shared across workers/instances | `storage/ratelimit.py` | docstring admits it. Use Redis |
| `cleanup_old_buckets` is never called | `ratelimit.py:55` | [RAN] grep. Memory grows with unique IPs |
| `request.client.host` behind a proxy is the proxy IP | `auth.py:99` | run uvicorn with `--proxy-headers` and a trusted-proxy list |
| In-memory `EventBus` (SSE) is single-process, and is not mounted on any route | `api/events.py` | [RAN] grep |
| SQLite with app-level write lock: single-writer, single-node | `db.py` | acceptable for local use. For multi-instance, move to Postgres |
| Public-page view counter is a synchronous DB write per GET | `publishing.py:265` | move to queue or batch |
| Pagination by `OFFSET` on some lists, none on others (commits/evidence lists unbounded) | `commits.py:48`, `evidence.py:78` | add limit and cursor |
| Session lookup hits the DB on every request | `auth.py:123` | acceptable, but add a short-TTL cache |

---

## 8. Suggested fix order

1. **Security blockers:** remove `dev_token` (`auth.py:324`), make the webhook secret mandatory (`github.py:295`), apply the auth rate limiter (`auth.py:93`), replace the cipher (`encryption.py`).
2. **Crashing handlers:** `await require_user` (`auth.py:225/239/249`), `require_admin()` (`waitlist.py:70`), `Row.get` (`publishing.py:135`), response-model field names (`db.py:1593/1639/1657` vs models).
3. **Config and packaging:** align `.env.example` with the `NUVORA_` prefix, add `email-validator`, `typer`, `rich` to requirements, fix the run command, and add a startup test.
4. **Data model:** partial unique index for `(user_id, slug)`, `Literal` types for `kind`, narrow `IntegrityError` handling.
5. **Performance:** one shared `Storage` with connection reuse; move blocking work off the event loop; fix N+1 and add indexes.
6. **Cleanup:** delete or isolate the legacy Continuity code (`db.py` legacy sections, `domain/`, `mcp/`, `cli/`), and remove README claims that don't match the running code.
7. **Tests:** add a `tests/` smoke test that calls every route with `TestClient`. This would have caught most items in section 2 immediately.

---

## 9. Limits of this review

- The API was **not** run end-to-end (no network to install FastAPI/pydantic). Items tagged **[LIB]** must be confirmed by a real test run.
- Section 2.4 (response-model mismatch) and the pydantic-settings list-parsing behavior are the two highest-value items to confirm first.
- I did not review the Next.js frontend, only backend integrability.
- `db.py` legacy methods (lines ~120-1500) were reviewed by table/column references and structure, not line by line.
