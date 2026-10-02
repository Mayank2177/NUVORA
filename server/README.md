# NUVORA Backend

FastAPI backend for NUVORA, a portfolio-evidence platform. The active API
supports authentication, projects, commits, evidence, publishing, analytics,
waitlist administration, and GitHub synchronization.

## Setup

Python 3.12 is required. The production image and CI use Python 3.12.

```bash
pip install -r requirements-dev.txt
cp .env.example .env
```

Replace every placeholder secret in `.env`. Production deployments must use
HTTPS origins and separate random values for `NUVORA_SECRET_KEY`,
`NUVORA_ENCRYPTION_KEY`, and `NUVORA_GITHUB_WEBHOOK_SECRET`.

SQLite and the in-memory limiter are development/test fallbacks. Install and
configure PostgreSQL and Redis before selecting the production environment.

## Run

The source directory must be on Python's import path:

```bash
PYTHONPATH=src uvicorn api.app:app --host 127.0.0.1 --port 4117
```

For local package development, `pip install -e .[dev]` also installs the
`nuvora-api` entry point.

Behind a trusted reverse proxy, enable proxy headers and list only that
proxy's address in `NUVORA_TRUSTED_PROXY_IPS`. Do not trust forwarded headers
from arbitrary internet clients.

## Production container

Create a production environment file and replace every placeholder before
starting the stack:

```bash
cp .env.production.example .env
docker compose config
docker compose up --build -d
docker compose ps
```

The API image runs as an unprivileged user with a read-only root filesystem.
The Compose stack binds the API to host loopback only; put an HTTPS reverse
proxy or load balancer in front of it. Set `NUVORA_TRUSTED_PROXY_IPS` to the
exact proxy address visible from the API container.

## Configuration

Settings use the `NUVORA_` prefix. See `.env.example` for a working local
template. Important production settings are:

- `NUVORA_ENVIRONMENT=production`
- `NUVORA_DATABASE_PATH` (development and tests)
- `NUVORA_DATABASE_URL` (required in production; PostgreSQL)
- `NUVORA_DATABASE_POOL_MIN_SIZE`
- `NUVORA_DATABASE_POOL_SIZE`
- `NUVORA_SECRET_KEY`
- `NUVORA_ENCRYPTION_KEY`
- `NUVORA_PUBLIC_BASE_URL`
- `NUVORA_FRONTEND_BASE_URL`
- `NUVORA_CORS_ORIGINS`
- `NUVORA_GITHUB_WEBHOOK_SECRET`
- `NUVORA_RATE_LIMIT_REDIS_URL` (required in production)
- `NUVORA_TRUSTED_PROXY_IPS`
- `NUVORA_REQUEST_BODY_MAX_BYTES`
- SMTP settings for password-reset delivery

`NUVORA_CORS_ORIGINS` is a comma-separated list. Wildcard CORS origins are
rejected because authenticated requests are enabled.
Production also requires HTTPS API/frontend/OAuth callback URLs and configured
SMTP delivery.

Admin privileges are never inferred from an email address. Provision or remove
an administrator from a trusted server shell:

```bash
PYTHONPATH=src python -m api.admin promote admin@example.com
PYTHONPATH=src python -m api.admin demote admin@example.com
```

## API

OpenAPI documentation is available at `/docs` in development and test
environments. It is disabled in production.
The main route groups are:

- `/api/auth` — signup, login, profile, logout, password reset
- `/api/projects` — project CRUD and project-scoped resources
- `/api/projects/{id}/commits` — bounded commit listing and CRUD
- `/api/projects/{id}/evidence` — bounded evidence listing, CRUD, and scanning
- `/api/projects/{id}/blockers` — blockers and attempt/resolution tracking
- `/api/projects/{id}/tasks` — staged tasks and completion toggling
- `/api/projects/{id}/designs` — design links and bounded JPEG previews
- `/api/projects/{id}/decisions` — staged decisions and rationales
- `/api/projects/{id}/publish` — publication management
- `/api/projects/{id}/continuity` — guidance, skill claims, evidence-chain audit, and PROJECT.md export
- `/api/integrations/github` — GitHub OAuth exchange and repository sync
- `/api/webhooks/github` — signed GitHub push webhooks
- `/api/waitlist` — public join and admin-only listing
- `/v1/mcp` — authenticated JSON-RPC project tools
- `/healthz` — application and database health
- `/livez` — process-only liveness probe

Protected routes use `Authorization: Bearer <token>`. For Next.js SSR, store
the token in an `httpOnly`, `Secure`, `SameSite` cookie managed by a Next.js
route handler; do not expose it to browser JavaScript.

Start GitHub OAuth with `GET /api/integrations/github/authorize`. It returns a
short-lived, user-bound authorization URL. GitHub redirects to the configured
Next.js callback route; that route must submit both `code` and `state` from the
authenticated session to `POST /api/integrations/github/connect`.

The installed `nuvora` CLI calls the same authenticated HTTP API; it does not
execute project shell commands. Set `NUVORA_API_TOKEN` and use commands such as
`nuvora guidance <project-id>` or `nuvora export <project-id>`.

Frontend contract alignment with `api-requirements.md` is in progress. The new
blocker/task/design/decision routes use snake-case objects wrapped in their
named envelopes, with default-100 pagination. Their mutation routes are
`/api/blockers/{id}/attempts`, `/api/blockers/{id}/resolve`,
`/api/tasks/{id}/toggle`, and `/api/{resource}/{id}` for deletion. Resolving a
blocker atomically records private evidence and an audit entry; identical
retries return the existing resolution. Stage order is not enforced.

The existing project/evidence/publishing payloads and authentication token
format are **not yet aligned** with that frontend contract. See the remaining
work in `DEPLOYMENT_TASKS.md`; do not assume frontend drop-in compatibility.
Validation errors currently use status 422 with an `error`/`details` envelope.

Project deletion now permanently removes its related records through database
cascades, including publications and evidence audits. There is no API undo;
use backups for recovery. The additive migration does not delete existing data.

## Security and deployment notes

- GitHub access tokens use AES-256-GCM with a dedicated encryption key.
- GitHub webhooks are rejected unless a secret and valid signature are present.
- Password-reset tokens are never returned by the API.
- Signup and email changes never grant administrator access.
- General request bodies and GitHub webhook bodies have enforced size limits.
- Authentication rate limits use Redis in production and are shared across
  workers and instances. The in-memory limiter is a development/test fallback.
- SQLite is supported for development and tests. Production configuration
  requires PostgreSQL and uses a pooled PostgreSQL storage connection.
- Blocking database, password-hashing, and token-encryption work is isolated
  from the ASGI event loop.
- Public project responses are immutable scanned snapshots with ETag
  revalidation and do not perform a database write on every page view.
- Evidence create/update/delete operations append atomically to a
  project-scoped SHA-256 audit chain.
- Startup fails fast when required PostgreSQL, Redis, or cryptography support
  is unavailable. Shutdown closes database and Redis pools cleanly.
- Production OpenAPI documentation endpoints are disabled.

## Tests

```bash
PYTHONPATH=src pytest
```

The suite covers authentication and revocation, project/commit/evidence CRUD,
publishing and cache behavior, password-reset confirmation, signed idempotent
webhooks, pagination, configuration validation, rate limiting, and concurrent
authenticated reads. Real PostgreSQL, Redis, SMTP, and GitHub integration tests
should also run in the deployment pipeline.

The in-process latency budget for authenticated profile and project-list reads
is p95 below 250 ms and p99 below 500 ms with 20 concurrent requests.
Production deployments should enforce the same budget with representative
network traffic and their actual PostgreSQL/Redis sizes.

Run the read-only deployment gate with a dedicated test account token:

```bash
NUVORA_LOAD_BASE_URL=https://api.example.com \
NUVORA_LOAD_TOKEN=replace-with-test-token \
PYTHONPATH=src python scripts/http_load_probe.py
```
