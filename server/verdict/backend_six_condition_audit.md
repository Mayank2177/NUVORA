# Backend Production Readiness Audit — Six-Condition Report

## Scope

This report consolidates the validated findings from the latest `backend(1).zip` audit.

The backend was evaluated against:

1. Production-grade
2. Bug-free
3. Next.js integrable
4. Low latency
5. Reliable
6. Scalable

> **Important:** Findings below are limited to issues verified from the uploaded code and runtime validation. No issue is listed as remaining where the latest code was verified to have fixed it.

---

# Executive Verdict

| Condition | Status | Verdict |
|---|---:|---|
| Production-grade | ❌ | Not met |
| Bug-free | ❌ | Not met |
| Next.js integrable | ⚠️ | Architecture compatible, but not ready for production integration |
| Low latency | ❌ | Not met |
| Reliable | ❌ | Not met |
| Scalable | ❌ | Not met |

## Current deployment decision

**DO NOT deploy this backend publicly as production yet.**

The most important confirmed runtime problem is:

```text
POST /api/auth/signup → 201 OK
GET  /api/auth/me     → TypeError / application failure
```

The `/api/auth/me` failure was reproduced against the uploaded backend.

---

# 1. Production-Grade

## ❌ NOT MET

### P0-01 — Authentication runtime regression

**Location**

```text
src/api/routes/auth.py:225
src/api/routes/auth.py:239
src/api/routes/auth.py:249
```

### Problem

`require_user()` is synchronous, but the routes still call it with `await`.

Current pattern:

```python
user = await require_user(authorization)
```

This produces:

```text
TypeError: object dict can't be used in 'await' expression
```

### Fix

Change:

```python
user = await require_user(authorization)
```

to:

```python
user = require_user(authorization)
```

This is a **P0 mandatory fix**.

---

### P0-02 — `.env.example` does not match the actual configuration

**Location**

```text
backend/.env.example
```

### Problem

The example uses old `CONTINUITY_*` variables while the application uses:

```text
NUVORA_*
```

The CORS example also does not use the required format for the Pydantic list setting.

### Fix

Use the actual variables, for example:

```env
NUVORA_HOST=127.0.0.1
NUVORA_PORT=4117
NUVORA_DATABASE_PATH=~/.nuvora/nuvora.sqlite3
NUVORA_LOG_LEVEL=INFO
NUVORA_ENABLE_CORS=true
NUVORA_CORS_ORIGINS=["http://localhost:3000"]
NUVORA_SEED_DEMO=false
NUVORA_SECRET_KEY=<strong-random-secret>
NUVORA_PUBLIC_BASE_URL=http://localhost:4117
```

Use HTTPS production origins in deployment.

---

### P0-03 — Custom XOR encryption is not production-grade cryptography

**Location**

```text
src/storage/encryption.py:14-45
```

### Problem

The current implementation uses custom XOR + HMAC encryption.

The code itself indicates that production should use AES-GCM instead.

### Fix

Replace the custom encryption implementation with a standard authenticated encryption scheme such as:

```text
AES-256-GCM
```

using a fresh random nonce for every encryption operation.

Add the required cryptography dependency and keep the encryption key separate from the JWT/session signing secret.

---

### P1-01 — GitHub webhook secret can be absent

**Location**

```text
src/api/routes/github.py:294-306
```

### Problem

Webhook signature verification only happens when a webhook secret is configured.

Production should not accept unsigned GitHub webhook requests.

### Fix

Require:

```env
NUVORA_GITHUB_WEBHOOK_SECRET=<secret>
```

in production and reject webhook requests when it is missing.

---

# 2. Bug-Free

## ❌ NOT MET

### P0-01 — Confirmed `/api/auth/me` runtime failure

See:

```text
src/api/routes/auth.py:225
src/api/routes/auth.py:239
src/api/routes/auth.py:249
```

This is a confirmed runtime bug and independently prevents a bug-free certification.

---

### P1-01 — Deprecated FastAPI parameter

**Locations**

```text
src/api/routes/commits.py:51
src/api/routes/evidence.py:81
```

### Problem

The code uses:

```python
Query(..., regex="...")
```

### Fix

Use:

```python
Query(..., pattern="...")
```

---

### P1-02 — No sufficient automated API integration test coverage

The uploaded backend does not contain a test suite sufficient to certify the complete API as bug-free.

The runtime auth failure demonstrates why this matters.

### Fix

Add automated tests for at least:

```text
signup
login
/me
logout
revoked session
project CRUD
commit CRUD
evidence CRUD
publish
unpublish
public page
password reset
GitHub sync
GitHub webhook signature
CORS
rate limiting
error handling
```

---

# 3. Next.js Integration

## ⚠️ ARCHITECTURALLY COMPATIBLE, BUT NOT PRODUCTION-READY

The backend uses a conventional HTTP/JSON REST API and is therefore structurally compatible with a Next.js frontend.

However, authenticated frontend flows currently fail because of the `require_user()` regression.

### Required fix

First fix:

```text
src/api/routes/auth.py:225
src/api/routes/auth.py:239
src/api/routes/auth.py:249
```

Then add frontend/backend contract tests covering:

```text
Next.js
  ↓
signup/login
  ↓
access token/session
  ↓
/me
  ↓
protected API
  ↓
logout/revocation
```

---

# 4. Low Latency

## ❌ NOT MET

No specific latency number is claimed here because a production latency benchmark was not performed. The following code-level causes of avoidable latency/blocking were verified.

---

### P0-01 — Synchronous SQLite/database operations in async request handlers

**Locations**

```text
src/storage/db.py:22-29
```

and API routes using synchronous database methods.

### Problem

The application uses:

```text
async def
+
synchronous sqlite3/database calls
```

Synchronous database work can block the event loop under concurrent load.

### Fix

For production:

```text
PostgreSQL
+
async database driver / async SQLAlchemy
+
connection pooling
```

Alternatively, synchronous database work must be explicitly isolated from the event loop.

---

### P0-02 — Blocking GitHub HTTP requests

**Location**

```text
src/api/routes/github.py
```

The GitHub integration uses synchronous `urllib.request.urlopen()` inside async route handlers.

Some requests have timeouts up to 15–20 seconds.

### Problem

A slow GitHub request can block the event loop and reduce concurrent request capacity.

### Fix

Use:

```text
httpx.AsyncClient
```

with explicit:

```text
connect timeout
read timeout
write timeout
pool timeout
```

---

### P1-01 — Evidence endpoint has no pagination

**Location**

```text
src/api/routes/evidence.py:91-111
```

### Problem

The endpoint can return the full evidence history for a project.

Large projects therefore create larger database queries and larger JSON responses.

### Fix

Add bounded pagination:

```text
limit
cursor
```

with a maximum limit.

Prefer cursor pagination for large datasets.

---

### P1-02 — Commit endpoint has no pagination

**Location**

```text
src/api/routes/commits.py:58-64
```

### Fix

Add cursor/limit pagination and enforce a maximum page size.

---

### P1-03 — N+1 query pattern in project hydration

**Location**

```text
src/storage/db.py:1593-1615
```

`hydrate_project()` performs additional queries such as project counts/publication lookups for each project.

### Problem

A list of N projects can trigger approximately:

```text
1 + 2N
```

database operations.

### Fix

Batch the related information using:

```text
JOIN
COUNT()
GROUP BY
```

or batch queries.

---

# 5. Reliability

## ❌ NOT MET

### P0-01 — Authentication failure

The confirmed `/api/auth/me` runtime failure prevents reliability certification.

See:

```text
src/api/routes/auth.py:225
src/api/routes/auth.py:239
src/api/routes/auth.py:249
```

---

### P1-01 — Rate limiter exists but is not applied to required auth routes

**Locations**

```text
src/storage/ratelimit.py
src/api/routes/auth.py
```

### Problem

A rate-limit implementation exists, but the sensitive public authentication endpoints do not consistently enforce it.

Relevant endpoints include:

```text
POST /api/auth/login
POST /api/auth/signup
POST /api/auth/password/reset
POST /api/auth/password/confirm
```

### Fix

Attach rate limiting to the actual routes/dependencies.

---

### P1-02 — Rate limiter is process-local

**Location**

```text
src/storage/ratelimit.py:17-19
```

### Problem

The limiter uses in-process state:

```python
self._buckets = defaultdict(...)
self._lock = threading.Lock()
```

Multiple backend workers/instances therefore have separate counters.

### Fix

Use shared infrastructure such as:

```text
Redis
```

for distributed rate limiting.

---

### P1-03 — Email delivery failure is not handled robustly

**Location**

```text
src/storage/email.py:81-83
src/api/routes/auth.py:316-321
```

### Problem

Email sending can return `False`, but the password-reset flow does not robustly act on the failure.

### Fix

Implement:

```text
retry handling
failure logging
delivery monitoring
background email jobs
```

Keep the public response generic so email existence is not disclosed.

---

# 6. Scalability

## ❌ NOT MET

### P0-01 — SQLite-based production architecture

**Locations**

```text
src/config.py
src/storage/db.py
src/storage/schema.py
```

### Problem

The application is built around a SQLite database file.

This is suitable for local/small deployments but is not an appropriate foundation for a horizontally scalable public multi-instance backend.

### Fix

Use:

```text
PostgreSQL
```

for production with:

```text
connection pooling
transactions
indexes
migrations
async DB access
```

SQLite can remain available for local development/testing.

---

### P0-02 — Process-local write lock

**Location**

```text
src/storage/db.py:17
```

Current:

```python
self._write_lock = threading.Lock()
```

### Problem

The lock coordinates threads only inside one Python process.

It cannot coordinate writes across multiple backend workers/instances.

### Fix

Move transactional consistency to PostgreSQL transactions and database-level locking where needed.

Do not depend on a Python `threading.Lock` for distributed coordination.

---

### P1-01 — GitHub operations should not remain synchronous request work

**Location**

```text
src/api/routes/github.py
```

### Problem

Repository synchronization can take long enough to occupy an API worker.

### Fix

Convert large/slow integrations to asynchronous jobs:

```text
Next.js
  ↓
POST /sync
  ↓
create job
  ↓
return 202
  ↓
background worker
  ↓
GitHub
  ↓
database
```

Use a shared queue such as Redis-backed jobs or a managed task system.

---

# Previously Reported Issues That Are Now Fixed

The latest backend was checked against the previous report. These items should **not** be treated as remaining issues:

## ✅ Demo seeding default

`config.py` now has:

```text
seed_demo = false
```

This is correct for production defaults.

---

## ✅ Usable default secret

The previous hard-coded production secret was removed.

The current configuration requires a sufficiently strong secret.

---

## ✅ Public URL validation

The public base URL is now validated.

---

## ✅ Environment-driven CORS

CORS is now configuration-driven.

The remaining problem is that `.env.example` does not accurately document the current configuration format.

---

## ✅ Plaintext GitHub token storage

GitHub tokens are now passed through encryption before storage.

The remaining issue is the **quality of the encryption implementation**, which should be replaced with AES-GCM.

---

## ✅ Public HTML escaping

The publishing endpoint now escapes user-controlled HTML content.

The previously identified direct HTML injection issue is therefore considered fixed in the latest code.

---

## ✅ GitHub webhook signature implementation

Signature verification now exists.

The remaining issue is that production should require the webhook secret rather than making verification conditional on configuration.

---

## ✅ GitHub commit NULL response issue

The latest commit formatting supplies defaults for fields that previously could be NULL.

This previous issue is not considered outstanding.

---

# Recommended Fix Order

## Phase 1 — P0 blockers

```text
1. Fix auth.py require_user() await regression
2. Fix .env.example
3. Replace XOR encryption with AES-256-GCM
4. Move production database from SQLite to PostgreSQL
5. Remove blocking DB operations from async request paths
6. Replace blocking urllib GitHub requests with async HTTP client
7. Add pagination to evidence
8. Add pagination to commits
```

## Phase 2 — Reliability

```text
9. Apply rate limiting to authentication endpoints
10. Move rate limiting to Redis/shared storage
11. Improve password-reset email failure/retry handling
12. Require GitHub webhook secret in production
13. Add comprehensive API integration tests
14. Fix deprecated FastAPI regex parameters
```

## Phase 3 — Scalability

```text
15. Remove N+1 project hydration queries
16. Move GitHub sync to background jobs
17. Add PostgreSQL connection pooling
18. Add database indexes based on production query patterns
19. Add health/readiness checks
20. Add structured logging, metrics, and tracing
```

---

# Final Certification Matrix

| Requirement | Current Status | Blocking Reason |
|---|---:|---|
| Production-grade | ❌ | Auth regression, crypto, DB architecture, webhook/config issues |
| Bug-free | ❌ | Confirmed `/api/auth/me` runtime crash |
| Next.js integrable | ⚠️ | REST architecture is compatible, but authenticated flow currently fails |
| Low latency | ❌ | Blocking DB/HTTP work, unbounded queries, N+1 queries |
| Reliable | ❌ | Auth failure, non-distributed rate limiting, weak email failure handling |
| Scalable | ❌ | SQLite architecture, process-local locking, synchronous integrations |

## Bottom line

**The latest backend is improved, but it does not yet satisfy all six conditions.**

The first mandatory correction is:

```text
src/api/routes/auth.py
225 / 239 / 249

await require_user(...)
        ↓
require_user(...)
```

After that, the major architectural work is:

```text
SQLite
   ↓
PostgreSQL

blocking urllib
   ↓
async HTTP client

unbounded API lists
   ↓
cursor pagination

in-process rate limiting
   ↓
Redis/shared limiter

synchronous GitHub sync
   ↓
background jobs
```

Only after these changes and a full integration/load test should the backend be considered for production deployment.
