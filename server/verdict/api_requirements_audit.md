# Nuvora API requirements compliance audit

Audit date: 2026-09-30. Source of truth: `api-requirements.md`, checked against the current source, registered FastAPI routes, local tests, and direct in-process HTTP probes.

## Result

**28 of 61 counted requirements are fully satisfied (45.9%).** Another **22 are partially satisfied (36.1%)**, and **11 are not satisfied (18.0%)**. Partial implementations are not included in the fulfilled count.

| Category | Counted | Full | Partial | Not satisfied |
| --- | ---: | ---: | ---: | ---: |
| Data models | 9 | 4 | 4 | 1 |
| Endpoint contracts | 31 | 17 | 8 | 6 |
| Security | 7 | 3 | 2 | 2 |
| Validation rules | 5 | 2 | 3 | 0 |
| Data integrity | 4 | 1 | 2 | 1 |
| Performance | 4 | 1 | 2 | 1 |
| Error response format | 1 | 0 | 1 | 0 |
| **Total** | **61** | **28** | **22** | **11** |

### Counting and grading rules

- The document does not supply one overall numbered requirement list. This audit counts its nine named models, 31 explicitly specified method/path endpoint contracts, 20 numbered additional requirements, and one error-envelope requirement.
- Each model is one requirement, including its fields, defaults, enums, and constraints. Each endpoint is one requirement, including its request, response envelope, documented statuses, and specified behavior. Individual fields are not separately counted.
- Endpoint grades measure the resource contract; shared security and validation policies are separately graded in their own rows. Therefore a full endpoint grade does not imply JWT compliance.
- **Full** means the specified contract is implemented and has supporting source/test evidence. Extra response metadata does not invalidate an otherwise compatible response. **Partial** means related functionality exists but a material part of the specified contract differs. **Not satisfied** means the required feature or mandated mechanism is absent.
- The overview repeats these features. Suggested technologies, optional GitHub work, the testing checklist, and implementation advice are not additional core requirements in this denominator. Models, endpoints, and cross-cutting policies overlap by design; this is a section-level checklist, not a deduplicated or field-weighted score.
- These grades describe local implementation, not production certification. Real PostgreSQL/Redis execution, production email delivery, frontend end-to-end compatibility, and supported-runtime validation remain unverified here.

## Requirement-by-requirement assessment

### Data models — 4/9 full

| ID | Requirement | Grade | Evidence / gap |
| --- | --- | --- | --- |
| M01 | User | Partial | User persistence and normalized unique email exist, but IDs use `usr-...`, not UUIDs; API timestamps use `createdAt`/`updatedAt`, not `created_at`. `src/api/routes/auth.py:54`, `src/storage/utils.py:50`, `src/storage/schema.py:13`. |
| M02 | Project | Partial | Project persistence exists, but `goal`, `users`, `constraints`, and journey `stage` are absent; name limits are 1–120 rather than 2–60; repository URLs replace `owner/repo`; IDs and timestamps differ. `src/api/routes/projects.py:45`, `src/api/routes/projects.py:100`, `src/storage/schema.py:47`. |
| M03 | Evidence | Partial | Legacy `kind/title/body/when/publish/aiAssisted` API replaces `type/text/date/public/provenance`; no generic stage/provenance contract or 140-character text constraint. Blocker-generated evidence has a special frontend serializer, not general evidence API alignment. `src/api/routes/evidence.py:22`, `src/api/routes/journey.py:127`. |
| M04 | Blocker | Full | UUID IDs, project linkage, title limit, attempts, open/resolved status, solution, and timestamps implemented. `src/schemas/journey.py:26`, `src/storage/schema.py:127`, `src/api/routes/journey.py:49`. |
| M05 | Task | Full | UUID IDs, title/stage, false completion default, creation timestamp, and nullable completion timestamp implemented. `src/schemas/journey.py:38`, `src/storage/schema.py:139`, `src/api/routes/journey.py:190`. |
| M06 | Design | Full | Required fields, enums, title/note bounds, HTTP(S) validation, and bounded JPEG normalization at quality 80 implemented. `src/schemas/journey.py:49`, `src/storage/schema.py:149`. |
| M07 | Decision | Full | UUID IDs, project linkage, decision/reason bounds, stage, and creation timestamp implemented. `src/schemas/journey.py:43`, `src/storage/schema.py:162`. |
| M08 | PublishDraft | Not satisfied | No draft table/model or draft GET/PUT handlers. Publication rows are not drafts. `src/storage/schema.py:107`, `src/api/routes/publishing.py:20`. |
| M09 | PublishedSnapshot | Partial | Immutable scanned publication payload exists, but uses legacy project/evidence data and lacks required story, audience/goal/stage, author shape, and resolved-blocker collection. `src/api/routes/publishing.py:185`. |

### Endpoint contracts — 17/31 full

There are **25/31 exact method/path registrations**, but only **17/31 complete resource contracts**. Route presence alone is not fulfillment.

| ID | Required method and path | Grade | Evidence / gap |
| --- | --- | --- | --- |
| E01 | POST `/api/auth/signup` | Partial | Returns user/token with 201, but token is not JWT; invalid signup returns 422 and duplicate email 409 instead of 400. `src/api/routes/auth.py:214`. |
| E02 | POST `/api/auth/login` | Partial | Login, user/token envelope, and invalid-credential 401 exist; token is not JWT. `src/api/routes/auth.py:278`. |
| E03 | POST `/api/auth/password-reset-request` | Full | Alias, specified message, and enumeration-resistant success behavior implemented. Real-provider delivery is not certified. `src/api/routes/auth.py:398`, `tests/test_frontend_journey_contract.py:229`. |
| E04 | GET `/api/projects` | Partial | Owner-scoped projects envelope exists, but project fields/timestamps are incompatible. `src/api/routes/projects.py:125`. |
| E05 | POST `/api/projects` | Partial | Project creation exists, but documented repository format fails validation, goal/audience/constraints/stage are not persisted, and response lacks `{project}` envelope. `src/api/routes/projects.py:227`. |
| E06 | PATCH `/api/projects/{project_id}` | Partial | Legacy updates exist; specified stage/constraints updates are silently ignored, and response lacks `{project}` envelope. `src/api/routes/projects.py:280`. |
| E07 | GET `/api/projects/{project_id}/evidence` | Partial | Evidence envelope exists, but evidence item fields and filters differ. `src/api/routes/evidence.py:114`. |
| E08 | POST `/api/projects/{project_id}/evidence` | Partial | Legacy create exists; specified payload returns 422 for missing `kind/title/when`; response is not `{evidence}`. `src/api/routes/evidence.py:194`. |
| E09 | PATCH `/api/evidence/{evidence_id}/toggle-public` | Not satisfied | Exact route absent; project-scoped legacy evidence updates are not this ID-only toggle contract. |
| E10 | DELETE `/api/evidence/{evidence_id}` | Not satisfied | Exact route absent; legacy deletion requires a project-scoped path. |
| E11 | GET `/api/projects/{project_id}/blockers` | Full | Owner-scoped list and blockers envelope. `src/api/routes/journey.py:98`. |
| E12 | POST `/api/projects/{project_id}/blockers` | Full | Validated creation, 201, and blocker envelope. `src/api/routes/journey.py:106`. |
| E13 | POST `/api/blockers/{blocker_id}/attempts` | Full | Attempt append and updated blocker envelope. `src/api/routes/journey.py:112`. |
| E14 | POST `/api/blockers/{blocker_id}/resolve` | Full | Atomic resolution with blocker/evidence envelopes and automatic private `Blocker resolved` evidence; identical retries do not duplicate evidence. `src/api/routes/journey.py:139`, `tests/test_frontend_journey_contract.py:88`. |
| E15 | DELETE `/api/blockers/{blocker_id}` | Full | Owner-scoped deletion with 204. `src/api/routes/journey.py:171`. |
| E16 | GET `/api/projects/{project_id}/tasks` | Full | Owner-scoped list and tasks envelope. `src/api/routes/journey.py:177`. |
| E17 | POST `/api/projects/{project_id}/tasks` | Full | Validated creation, 201, and task envelope. `src/api/routes/journey.py:184`. |
| E18 | PATCH `/api/tasks/{task_id}/toggle` | Full | Completion toggle sets/clears `done_at`, returns task envelope. `src/api/routes/journey.py:190`. |
| E19 | DELETE `/api/tasks/{task_id}` | Full | Owner-scoped deletion with 204. `src/api/routes/journey.py:202`. |
| E20 | GET `/api/projects/{project_id}/designs` | Full | Owner-scoped list and designs envelope. `src/api/routes/journey.py:208`. |
| E21 | POST `/api/projects/{project_id}/designs` | Full | Validated creation, 201, and design envelope; image normalization runs off the event loop. `src/api/routes/journey.py:215`. |
| E22 | DELETE `/api/designs/{design_id}` | Full | Owner-scoped deletion with 204. `src/api/routes/journey.py:228`. |
| E23 | GET `/api/projects/{project_id}/decisions` | Full | Owner-scoped list and decisions envelope. `src/api/routes/journey.py:234`. |
| E24 | POST `/api/projects/{project_id}/decisions` | Full | Validated creation, 201, and decision envelope. `src/api/routes/journey.py:241`. |
| E25 | DELETE `/api/decisions/{decision_id}` | Full | Owner-scoped deletion with 204. `src/api/routes/journey.py:247`. |
| E26 | GET `/api/projects/{project_id}/publish/draft` | Not satisfied | Exact route and draft implementation absent. |
| E27 | PUT `/api/projects/{project_id}/publish/draft` | Not satisfied | Exact route and draft implementation absent. |
| E28 | POST `/api/projects/{project_id}/publish` | Partial | Legacy publication exists, but requires `evidenceIds`; documented story payload returns 422; response lacks `{snapshot}` and required snapshot fields. `src/api/routes/publishing.py:20`, `src/api/routes/publishing.py:112`. |
| E29 | DELETE `/api/projects/{project_id}/publish` | Full | Owner-scoped unpublish removes publication, updates flags, returns 204. `src/api/routes/publishing.py:304`. |
| E30 | GET `/api/public/{slug}` | Not satisfied | Exact route absent; current `/api/public/{username}/{slug}` also has a different response shape. `src/api/routes/publishing.py:427`. |
| E31 | GET `/api/projects/{project_id}/publish/check-slug/{slug}` | Not satisfied | Exact availability-check route absent. |

### Additional requirements — 7/20 full

| ID | Requirement | Grade | Evidence / gap |
| --- | --- | --- | --- |
| S01 | JWT tokens with 7-day expiration | Not satisfied | Custom two-segment HMAC token, not JWT; default TTL is 336 hours / 14 days. `src/storage/utils.py:148`, `src/config.py:43`. |
| S02 | bcrypt or Argon2 password hashing | Not satisfied | PBKDF2-SHA256 used instead; no mandated hash implementation/migration. `src/storage/utils.py:103`. |
| S03 | Valid JWT authorization on nonpublic endpoints | Partial | Protected resource routes validate signed, stored sessions and expiration, but not JWTs. Auth entry points necessarily remain unauthenticated. `src/api/routes/auth.py:163`. |
| S04 | Project ownership checks | Full | Owner checks on legacy project resources and new journey resources; isolation regression coverage. `src/api/routes/journey.py:20`, `tests/test_bug_regressions.py:44`, `tests/test_frontend_journey_contract.py:48`. |
| S05 | Rate limiting on auth endpoints | Full | Auth rate-limit dependencies and limiter tests implemented. Redis-backed production execution remains unverified locally. `src/api/routes/auth.py:140`, `tests/test_production_contract.py:504`, `tests/test_bug_regressions.py:598`. |
| S06 | Input validation according to models | Partial | Journey bounds/enums validated, but project/evidence/publication requests use incompatible models; unsupported project fields can be ignored. `src/schemas/journey.py:22`, `src/api/routes/projects.py:45`, `src/api/routes/evidence.py:22`. |
| S07 | Secret scanning before publication | Full | Specified key/assignment pattern families covered, and blocking findings prevent publication. `src/storage/security.py:17`, `src/api/routes/publishing.py:145`, `tests/test_frontend_journey_contract.py:223`. |
| V01 | Slug regex and 3–50 character length | Partial | Slugification exists, but request permits 1–80 characters and normalizes rather than enforcing the specified regex/bounds. `src/api/routes/publishing.py:20`, `src/api/routes/publishing.py:181`. |
| V02 | Lowercase valid email | Full | EmailStr validation and normalization before storage/login/reset. `src/api/routes/auth.py:37`, `src/api/routes/auth.py:219`. |
| V03 | Valid HTTP(S) URLs | Full | Design URLs and legacy repository URLs validated for HTTP(S); repository contract mismatch is graded separately. `src/schemas/journey.py:63`, `src/api/routes/projects.py:23`. |
| V04 | Defined stages only | Partial | All 12 stages validated for tasks/designs/decisions, but generic projects/evidence do not expose the required stage field. `src/schemas/journey.py:11`, `tests/test_frontend_journey_contract.py:154`. |
| V05 | Evidence/design enums | Partial | Design enums implemented; generic evidence API still accepts legacy kinds, not the specified evidence types. Unused type aliases alone do not fulfill the API requirement. `src/schemas/journey.py:15`, `src/schemas/journey.py:51`, `src/api/routes/evidence.py:23`. |
| I01 | Cascade project deletes | Full | Hard deletion with child foreign-key cascades and tests; no draft table exists to exercise draft deletion. `src/api/routes/projects.py:314`, `src/storage/schema.py:62`, `tests/test_frontend_journey_contract.py:48`. |
| I02 | Globally unique published slugs | Partial | Only `(username, slug)` uniqueness enforced; different authors can use the same slug. `src/storage/schema.py:107`. |
| I03 | One PublishDraft per project | Not satisfied | Draft entity absent; a unique project publication is not a unique draft. `src/storage/schema.py:107`. |
| I04 | Automatically set created_at/updated_at | Partial | Legacy entities receive creation/update timestamps and task/blocker state timestamps exist, but journey tables do not maintain `updated_at`; draft timestamp is absent. `src/storage/schema.py:127`, `src/api/routes/journey.py:80`. |
| P01 | Pagination, default limit 100 | Partial | Journey lists default to 100; project lists default to 20 and evidence lists to 50. `src/api/routes/projects.py:129`, `src/api/routes/evidence.py:120`, `src/api/routes/journey.py:100`. |
| P02 | Evidence stage/type/provenance/public filters | Not satisfied | Specified query parameters not implemented. Legacy `kind/published/aiAssisted` filters are not the four required filters. `src/api/routes/evidence.py:116`. |
| P03 | Date sorting, descending by default | Partial | Descending defaults implemented; project sort controls exist, but evidence/journey lists have fixed date order without selectable direction. `src/api/routes/projects.py:182`, `src/api/routes/evidence.py:166`, `src/api/routes/journey.py:60`. |
| P04 | Foreign-key and frequent-query indexes | Full | Implemented resource/project/session/commit/evidence/publication indexes with index regression coverage. Missing entities have no indexes to validate. `src/storage/schema.py:171`, `tests/test_bug_regressions.py:896`. |

### Error response format — 0/1 full

| ID | Requirement | Grade | Evidence / gap |
| --- | --- | --- | --- |
| X01 | All errors return `{error, details?}` | Partial | HTTP/validation/database/body-limit/rate-limit errors use the envelope, but unexpected server exceptions still return plain-text 500. Confirmed by injecting a temporary RuntimeError into an owner check in an isolated in-process probe. `src/api/app.py:256`, `src/api/middleware.py:1`. |

## Validation performed

### Test results

Full suite command: `PYTHONPATH=src pytest -q`.

- **59 passed, 1 failed, 3 skipped** in 6.34 seconds.
- Failure: `tests/test_production_contract.py:396` (`test_configuration_and_portable_sql_contracts`). `.env.example` still contains `CONTINUITY_*`, contrary to the expected `NUVORA_*` template. This is a deployment/test failure, not an extra core API requirement in the 61-item denominator.
- Skips: PostgreSQL not configured, Redis not configured, and the rate-limiter/encryption-primitives test because `cryptography` is unavailable. The current runtime is **Python 3.13.15**, not the supported Python 3.12 runtime.
- A full-suite rerun with `PYTHONPATH=src pytest -q -rs` confirmed the same **59 passed, 1 failed, 3 skipped** outcome in 6.56 seconds and exposed the exact skip reasons above.
- Focused rerun: `PYTHONPATH=src pytest -q -rs tests/test_frontend_journey_contract.py tests/test_services_integration.py tests/test_production_contract.py::test_concurrent_authenticated_reads` yielded **26 passed, 2 skipped** in 3.22 seconds. The journey contract file contributes 25 passing cases.
- No dependencies were installed, no environments were created, and no application source was changed. Probes used isolated test databases, not production data.

Passing existing tests does not establish frontend compliance: several tests deliberately exercise the legacy project/evidence/publication contract.

### Direct HTTP and route checks

- Registered routes: **25 present / 31 required**; six exact method/path contracts missing.
- Signup returns 201 but a prefixed non-UUID user ID and a two-segment token; configured default lifetime is 14 days.
- The specified project POST example with `repo: "ada/eduboost-ai"` returns **422**.
- Changing only that repository to an HTTPS GitHub URL returns 201, but project output omits `goal/users/constraints/stage` and `{project}`.
- PATCH with only the specified `stage` and `constraints` returns **200 without those values**: fields are silently ignored.
- The specified evidence POST payload returns **422**, requiring legacy `kind/title/when`.
- The specified publication POST payload returns **422**, requiring legacy `evidenceIds`.
- Invalid signup returns **422**, and duplicate signup returns **409**, rather than the documented 400 statuses.
- Project/evidence pagination metadata confirms default limits of **20/50**, not 100.
- A simulated unexpected handler failure returns **500, text/plain, `Internal Server Error`**, not the required JSON error envelope.

## Priority gaps

1. Align project fields, repository format, validation limits, UUIDs/timestamps, and response envelopes; reject or handle unknown fields rather than silently dropping stage/constraints.
2. Align generic evidence fields/enums/provenance/stages, four filters, and ID-only toggle/delete routes.
3. Implement publish drafts, story snapshots, resolved-blocker inclusion, global slug uniqueness, slug checking, and `/api/public/{slug}`.
4. Replace custom session tokens with validated seven-day JWTs; migrate password hashing to bcrypt or Argon2 and align signup error statuses.
5. Complete slug validation, pagination defaults, selectable date sorting, update timestamps, and unexpected-error envelopes.
6. Repair the existing environment-template test failure and execute production dependency tests under Python 3.12 before claiming release readiness.


## Detailed API completion specification

This supplement turns the audit into an implementation checklist. **Everything marked target, required, proposed, or to add is future work, not a claim that the current server already supports it.** The 28/61 score and original test results remain unchanged by this documentation update.

### 1. API base addresses and access conventions

| Purpose | Address | Current state / instruction |
| --- | --- | --- |
| Local API origin | `http://127.0.0.1:4117` | Configured default host/port; the server must be started separately. |
| Local API prefix | `http://127.0.0.1:4117/api` | All 31 frontend contract endpoints use this prefix. |
| Frontend development origin | `http://localhost:3000` | Default frontend setting; allow the actual frontend origin in CORS. This is not the backend address. |
| Production API origin | `https://<your-api-host>` | Placeholder only. No actual production host or running public deployment was verified. |
| Production endpoint example | `https://<your-api-host>/api/projects` | Replace the placeholder with the configured ingress host. |
| Swagger UI | `http://127.0.0.1:4117/docs` | Enabled outside production; disabled in production. |
| ReDoc | `http://127.0.0.1:4117/redoc` | Enabled outside production; disabled in production. |
| OpenAPI JSON | `http://127.0.0.1:4117/openapi.json` | Enabled outside production; use this to verify paths and schemas. |
| Dependency health/readiness | `http://127.0.0.1:4117/healthz` | Existing endpoint; checks database and, in production, rate-limit dependency availability. |
| Process liveness | `http://127.0.0.1:4117/livez` | Existing endpoint; does not check external dependencies. |

Source: `src/config.py:30`, `src/api/app.py:230`, `src/api/app.py:338`, `src/api/app.py:360`.

Use these conventions in the address tables below:

```text
BASE = http://127.0.0.1:4117
Full request address = BASE + the path in the table
Example: GET http://127.0.0.1:4117/api/projects
Authorization: Bearer <token>
Content-Type: application/json
```

- `{project_id}`, `{evidence_id}`, `{blocker_id}`, `{task_id}`, `{design_id}`, and `{decision_id}` are substituted resource IDs, not literal braces in a request.
- `{slug}` is the URL-safe publication slug. `{username}` occurs only in the current legacy public address.
- Signup, login, password-reset request, and the public snapshot route must work without a user bearer token. Ownership-protected resource routes require one.
- A 204 response must have no JSON body. Do not call `response.json()` on successful DELETE responses.
- The browser-facing project page and the backend JSON endpoint are different concerns. `/api/public/{slug}` is the required JSON address; the frontend page URL is not specified by the requirements.
- The commands and examples here do not imply a server is already listening or a production ingress exists.

### 2. Six exact API addresses to add

| Audit ID | Method | Required new address | Auth | Success | Required behavior |
| --- | --- | --- | --- | ---: | --- |
| E09 | PATCH | `BASE/api/evidence/{evidence_id}/toggle-public` | Bearer | 200 | Resolve evidence ownership by ID, atomically invert `public`, return `{ "evidence": ... }`. |
| E10 | DELETE | `BASE/api/evidence/{evidence_id}` | Bearer | 204 | Resolve ownership by evidence ID, delete it, preserve applicable audit-chain semantics. |
| E26 | GET | `BASE/api/projects/{project_id}/publish/draft` | Bearer | 200 | Return the owner's stored publish draft in `{ "draft": ... }`. |
| E27 | PUT | `BASE/api/projects/{project_id}/publish/draft` | Bearer | 200 | Validate and upsert the one draft for this project, update `updated_at`, return `{ "draft": ... }`. |
| E30 | GET | `BASE/api/public/{slug}` | None | 200 | Find a globally unique published slug, return `{ "snapshot": ... }`; nonexistent/unpublished slug returns 404. |
| E31 | GET | `BASE/api/projects/{project_id}/publish/check-slug/{slug}` | Bearer | 200 | Check project ownership, validate slug, return availability and conflict reason where applicable. |

Suggested source placement: add an ID-scoped evidence router alongside the existing project-scoped evidence router in `src/api/routes/evidence.py:18`; add publishing routes in `src/api/routes/publishing.py:17`; register any new router in `src/api/app.py:27`. Avoid registering the new evidence paths underneath `/api/projects/{project_id}/evidence`, which would reproduce the wrong address.

#### E09: toggle evidence visibility

```http
PATCH /api/evidence/{evidence_id}/toggle-public
Authorization: Bearer <token>
```

No request body is specified. Required response: `{"evidence": <complete evidence object>}` with the inverted boolean. Return 401 for missing/invalid authentication and an ownership-safe 404 for missing or another user's evidence. The visibility update and evidence audit entry must commit together. Concurrent toggles must not use an unlocked read followed by a separate write. Toggling evidence after publishing should not silently rewrite an existing immutable snapshot; republishing is a separate action.

#### E10: delete evidence by ID

```http
DELETE /api/evidence/{evidence_id}
Authorization: Bearer <token>
```

Success is 204 with no body. Use an ownership-safe 404 for missing/foreign evidence. The legacy address `/api/projects/{project_id}/evidence/{evidence_id}` can be retained temporarily, but it does not replace this required ID-only route. Define what happens when deleting a blocker's resolution evidence: current retries can return a conflict after that evidence is removed, so retain and test an explicit policy.

#### E26/E27: read/save publish draft

```http
GET /api/projects/{project_id}/publish/draft
PUT /api/projects/{project_id}/publish/draft
Authorization: Bearer <token>
```

Required PUT body:

```json
{
  "slug": "eduboost-ai",
  "story": {
    "problem": "Students need a more accessible learning tool.",
    "process": "Interviewed students and tested several approaches.",
    "build": "Built the first learning dashboard.",
    "challenges": "Resolved authentication problems.",
    "result": "Delivered a working prototype."
  },
  "include_blockers": true
}
```

Required successful GET/PUT response shape:

```json
{
  "draft": {
    "id": "550e8400-e29b-41d4-a716-446655440020",
    "project_id": "550e8400-e29b-41d4-a716-446655440002",
    "slug": "eduboost-ai",
    "story": {
      "problem": "Students need a more accessible learning tool.",
      "process": "Interviewed students and tested several approaches.",
      "build": "Built the first learning dashboard.",
      "challenges": "Resolved authentication problems.",
      "result": "Delivered a working prototype."
    },
    "include_blockers": true,
    "updated_at": "2026-09-30T10:00:00Z"
  }
}
```

The draft model permits `story: null`; it must not be confused with an already published snapshot. Enforce unique `project_id` in storage, and make PUT an atomic upsert so simultaneous saves cannot create two drafts. `include_blockers` defaults to true.

**Unspecified policy to decide:** the requirements do not define GET behavior before the first draft has been saved, or a default slug for a new draft. To meet the documented 200 behavior, a possible policy is lazy creation of a default draft after an owner check, with a valid derived slug and `story: null`. Document and test the selected policy; do not present it as an existing implementation.

#### E30: public snapshot lookup

```http
GET /api/public/eduboost-ai
```

No bearer token is required. Successful response: `{"snapshot": <complete PublishedSnapshot>}`. Missing or unpublished slug: 404 with `{"error": "Project not found"}`. Query by globally unique slug, not `(username, slug)`. Do not expose account email, password hashes, session tokens, private evidence, unresolved blockers, or secret findings containing submitted secret values.

#### E31: slug availability

```http
GET /api/projects/{project_id}/publish/check-slug/eduboost-ai
Authorization: Bearer <token>
```

Required response examples:

```json
{"available": true}
```

```json
{"available": false, "reason": "Slug already taken"}
```

Check availability across every owner's published snapshots. Proposed behavior: an unchanged slug already owned by this same project's publication remains available to that project. The requirement does not state that drafts reserve slugs; do not introduce global draft reservations without an explicit product decision. The availability check is advisory: the publish transaction and database uniqueness constraint must still reject a racing conflict.

### 3. Complete 31-endpoint address inventory

`BASE` means the API origin defined in section 1. The "work" column is about the required contract, not just whether a handler exists.

| ID | Method and address | Required request body | Required success response | Work |
| --- | --- | --- | --- | --- |
| E01 | POST `BASE/api/auth/signup` | `name`, `email`, `password` | 201 `{user, token}` | Align JWT, UUIDs, timestamps and 400 signup errors. |
| E02 | POST `BASE/api/auth/login` | `email`, `password` | 200 `{user, token}` | Align JWT and user serialization. |
| E03 | POST `BASE/api/auth/password-reset-request` | `email` | 200 `{message}` | Retain; verify production delivery separately. |
| E04 | GET `BASE/api/projects` | None | 200 `{projects: [...]}` | Align every project item; default page limit 100. |
| E05 | POST `BASE/api/projects` | `name`, `goal`, `users`, optional `constraints`, `stage`, nullable `repo` | 201 `{project}` | Align request schema, persistence and envelope. |
| E06 | PATCH `BASE/api/projects/{project_id}` | Supplied mutable project fields, e.g. `stage`, `constraints` | 200 `{project}` | Persist supplied fields; stop silently ignoring them. |
| E07 | GET `BASE/api/projects/{project_id}/evidence` | None | 200 `{evidence: [...]}` | Align fields, filters and default limit. |
| E08 | POST `BASE/api/projects/{project_id}/evidence` | `type`, `text`, `date`, `source`, `provenance`, `stage`, optional `public` | 201 `{evidence}` | Replace/bridge legacy create contract. |
| E09 | PATCH `BASE/api/evidence/{evidence_id}/toggle-public` | None specified | 200 `{evidence}` | Add exact address. |
| E10 | DELETE `BASE/api/evidence/{evidence_id}` | None | 204, empty body | Add exact address. |
| E11 | GET `BASE/api/projects/{project_id}/blockers` | None | 200 `{blockers: [...]}` | Retain; extend shared sort/timestamp behavior as needed. |
| E12 | POST `BASE/api/projects/{project_id}/blockers` | `title` | 201 `{blocker}` | Retain. |
| E13 | POST `BASE/api/blockers/{blocker_id}/attempts` | `attempt` | 200 `{blocker}` | Retain. |
| E14 | POST `BASE/api/blockers/{blocker_id}/resolve` | `solution` | 200 `{blocker, evidence}` | Retain atomicity; align generated evidence with generic evidence schema. |
| E15 | DELETE `BASE/api/blockers/{blocker_id}` | None | 204, empty body | Retain. |
| E16 | GET `BASE/api/projects/{project_id}/tasks` | None | 200 `{tasks: [...]}` | Retain; extend shared sorting as needed. |
| E17 | POST `BASE/api/projects/{project_id}/tasks` | `title`, `stage` | 201 `{task}` | Retain. |
| E18 | PATCH `BASE/api/tasks/{task_id}/toggle` | None specified | 200 `{task}` | Retain `done_at` set/clear behavior. |
| E19 | DELETE `BASE/api/tasks/{task_id}` | None | 204, empty body | Retain. |
| E20 | GET `BASE/api/projects/{project_id}/designs` | None | 200 `{designs: [...]}` | Retain; extend shared sorting as needed. |
| E21 | POST `BASE/api/projects/{project_id}/designs` | `title`, `kind`, `tool`, `url`, nullable `image`, `note`, `stage` | 201 `{design}` | Retain URL/JPEG validation and offloading. |
| E22 | DELETE `BASE/api/designs/{design_id}` | None | 204, empty body | Retain. |
| E23 | GET `BASE/api/projects/{project_id}/decisions` | None | 200 `{decisions: [...]}` | Retain; extend shared sorting as needed. |
| E24 | POST `BASE/api/projects/{project_id}/decisions` | `decision`, `reason`, `stage` | 201 `{decision}` | Retain. |
| E25 | DELETE `BASE/api/decisions/{decision_id}` | None | 204, empty body | Retain. |
| E26 | GET `BASE/api/projects/{project_id}/publish/draft` | None | 200 `{draft}` | Add exact address and storage. |
| E27 | PUT `BASE/api/projects/{project_id}/publish/draft` | `slug`, `story`, `include_blockers` | 200 `{draft}` | Add exact address and atomic upsert. |
| E28 | POST `BASE/api/projects/{project_id}/publish` | `slug`, `story`, `include_blockers` | 201 `{snapshot}` | Align request, transaction, snapshot and status. |
| E29 | DELETE `BASE/api/projects/{project_id}/publish` | None | 204, empty body | Retain; ensure new snapshot lookup stops serving it. |
| E30 | GET `BASE/api/public/{slug}` | None | 200 `{snapshot}` | Add exact address and global slug lookup. |
| E31 | GET `BASE/api/projects/{project_id}/publish/check-slug/{slug}` | None | 200 `{available, reason?}` | Add exact address and global check. |

Current publish POST is declared without `status_code=201`, so its default success status is 200. This is another E28 mismatch in addition to the body/envelope differences. Source: `src/api/routes/publishing.py:110`.

### 4. Existing addresses that need contract alignment

#### Authentication: E01/E02, M01, S01/S02/S03, V02

Required examples:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "securepassword123"
}
```

```json
{
  "email": "ada@example.com",
  "password": "securepassword123"
}
```

Both successful responses contain `user` and `token`. At minimum the user response contains UUID `id`, `name`, and lowercase `email`; align full user serialization with `created_at` rather than only `createdAt`. Never serialize the stored password/hash.

Required changes:

- Generate and validate real JWTs with a seven-day expiration; simply changing `NUVORA_TOKEN_TTL_HOURS` to 168 does not turn the current custom token into a JWT.
- Preserve server-side revocation/session semantics if needed; test logout and password-reset invalidation after the token change.
- Use bcrypt or Argon2 for new password hashes. Define a backward-compatible migration for existing PBKDF2 users, for example verifying the old hash at login and upgrading only after a successful authentication. Do not invalidate all existing users without a migration decision.
- Signup validation errors must return 400, and duplicate normalized email must return 400. This requirement is signup-specific; the document does not mandate that every resource validation error use 400.
- Login invalid credentials must return 401 without disclosing whether the email exists.
- Keep authentication rate limiting, account lockout, reset cooldown, and enumeration-resistant password-reset request behavior.
- The requirements do not define a signup password-length minimum beyond the example; the current 12-character minimum is an implementation policy, not a newly inferred specification requirement.

#### Projects: E04/E05/E06, M02

Required POST body:

```json
{
  "name": "EduBoost AI",
  "goal": "Build an AI-powered learning platform for African students",
  "users": "African students and developers",
  "constraints": "Small team. Limited development time.",
  "stage": "Think",
  "repo": "ada/eduboost-ai"
}
```

Required POST/PATCH response:

```json
{
  "project": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "EduBoost AI",
    "goal": "Build an AI-powered learning platform for African students",
    "users": "African students and developers",
    "constraints": "Small team. Limited development time.",
    "stage": "Think",
    "repo": "ada/eduboost-ai",
    "created_at": "2026-09-30T10:00:00Z"
  }
}
```

Required PATCH example:

```json
{"stage": "Build", "constraints": "Updated constraints"}
```

Required GET response: `{"projects": [<project objects>]}`. Additional pagination metadata can coexist with this envelope.

| Target field / rule | Current mismatch | Required change |
| --- | --- | --- |
| `id`: UUID | Prefixed project ID | Plan compatible ID generation/migration; do not rewrite unrelated IDs blindly. |
| `user_id`: owner FK | Stored internally but absent from legacy project response | Set from authenticated user, not request input; expose where the specified full model requires it. |
| `name`: 2–60 characters | 1–120 | Validate both creation and supplied PATCH names. |
| `goal`: minimum 10 characters | Missing | Add storage, request validation and serialization. Do not assume every legacy summary is a valid goal. |
| `users`: audience description | Missing | Add storage and serialization. No numerical length limit is specified. |
| `constraints`: optional text | Missing | Add storage and PATCH support; document omitted/null handling. |
| `stage`: one of 12 stages | Legacy `status` is not a journey stage | Add independent stage field; do not equate `draft/published/archived` with journey stages. |
| `repo`: `owner/repo` or null | URL-oriented legacy validator | Accept/return canonical owner/repo and null; normalize legacy GitHub URLs without corrupting non-GitHub legacy data. |
| `created_at` | `createdAt` | Return snake-case ISO timestamp. |
| `updated_at` | `updatedAt` | Align shared timestamp policy without dropping the required `created_at`. |
| Response envelope | Direct project object | Return `{project}` on POST/PATCH. |

Proposed compatibility policy: reject unsupported request properties or explicitly map documented aliases, rather than returning success while dropping data. The requirements do not force a particular extra-field policy, but silently losing the specified fields is not compliance.

#### Evidence: E07/E08/E09/E10, M03, P02

Required POST body:

```json
{
  "type": "Screenshot",
  "text": "Dashboard layout finished on mobile",
  "date": "2026-09-30T10:00:00Z",
  "source": "CleanShot",
  "provenance": "Human",
  "stage": "Build",
  "public": false
}
```

Required POST/toggle response:

```json
{
  "evidence": {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "project_id": "550e8400-e29b-41d4-a716-446655440002",
    "type": "Screenshot",
    "text": "Dashboard layout finished on mobile",
    "date": "2026-09-30T10:00:00Z",
    "source": "CleanShot",
    "provenance": "Human",
    "stage": "Build",
    "public": false,
    "created_at": "2026-09-30T10:00:00Z"
  }
}
```

Required list response: `{"evidence": [<complete evidence objects>]}`.

| Target field | Current field / storage | Required action |
| --- | --- | --- |
| `id` | Prefixed `evd-...` | UUID policy and compatibility migration. |
| `project_id` | Response `projectId` | Snake-case response; ownership stays enforced. |
| `type` | API `kind` with four legacy values | Support all eight frontend types; new metadata column alone is insufficient. |
| `text`, max 140 | API `title`/`body` with larger bounds | Add canonical short text. Preserve long historical bodies rather than silently truncating them. |
| `date` | API `when`, storage `occurred_at` | Parse valid timestamps and expose canonical name. |
| `source` | Already exists | Preserve and scan before publication. |
| `provenance` | API boolean `aiAssisted` | Support four explicit provenance values; a boolean cannot distinguish collaborator/external evidence. |
| `stage` | Metadata exists only in selected flows | Validate and expose for all generic evidence operations. |
| `public`, default false | API `publish`, storage integer flag | Return JSON boolean under required name. |
| `created_at` | API `createdAt` | Align snake-case timestamp. |

Required filter capabilities on the existing list address:

```text
GET BASE/api/projects/{project_id}/evidence?stage=Build
GET BASE/api/projects/{project_id}/evidence?type=Screenshot
GET BASE/api/projects/{project_id}/evidence?provenance=Human
GET BASE/api/projects/{project_id}/evidence?public=true
GET BASE/api/projects/{project_id}/evidence?stage=Build&type=Screenshot&provenance=Human&public=true&limit=100&offset=0
```

The four filter names are required capabilities. The illustrated `limit`/`offset` combination follows the existing evidence/journey pagination style; a selectable `sort=asc|desc` parameter would be a **proposed API convention**, because the requirements do not prescribe its name.

Combine supplied filters with AND and apply them before counting/paginating. Validate stage/type/provenance values and return real booleans. Add query-matching indexes after choosing the final storage fields. Retain stable secondary ID ordering when dates tie.

Legacy kind/provenance conversion needs an explicit mapping policy. Do not automatically infer `External` or `Collaborator` from insufficient historical metadata, reinterpret old audit payloads, or claim that every `proof` kind is a `Screenshot`.

#### Publishing: E28/E29/E30/E31, M08/M09

Required publish request at the existing POST address:

```json
{
  "slug": "eduboost-ai",
  "story": {
    "problem": "Students need an accessible learning platform.",
    "process": "Gathered feedback and tested prototypes.",
    "build": "Implemented the dashboard and learning flow.",
    "challenges": "Resolved production authentication issues.",
    "result": "A working prototype is ready for validation."
  },
  "include_blockers": true
}
```

Do not require the legacy `evidenceIds` field for this request. Select only the project's evidence marked public, exclude unresolved blockers, and include resolved blockers only when `include_blockers` is true. Preserve any stricter existing sensitive-evidence safeguards.

Required response is **201** with this structure:

```json
{
  "snapshot": {
    "id": "550e8400-e29b-41d4-a716-446655440030",
    "slug": "eduboost-ai",
    "project_id": "550e8400-e29b-41d4-a716-446655440002",
    "name": "EduBoost AI",
    "goal": "Build an AI-powered learning platform for African students",
    "users": "African students and developers",
    "stage": "Publish",
    "repo": "ada/eduboost-ai",
    "author": "Ada Lovelace",
    "published_at": "2026-09-30T10:00:00Z",
    "story": {
      "problem": "Students need an accessible learning platform.",
      "process": "Gathered feedback and tested prototypes.",
      "build": "Implemented the dashboard and learning flow.",
      "challenges": "Resolved production authentication issues.",
      "result": "A working prototype is ready for validation."
    },
    "evidence": [],
    "blockers": []
  }
}
```

Empty arrays above demonstrate JSON shape; actual results contain complete eligible evidence and blocker objects. The requirements do not state a minimum public evidence count, so the current mandatory nonempty evidence-ID list must not become an undocumented frontend requirement.

Implementation checklist:

1. Authenticate and verify project ownership.
2. Validate slug format/length, the five story keys, and `include_blockers`; use the current user name for `author`.
3. Read project data, eligible public evidence, and eligible resolved blockers consistently.
4. Scan every user-controlled string that will appear in the snapshot, including story sections, project name/goal/audience/repository, evidence text/source, and included blocker titles/attempts/solutions. Preserve additional legacy scan coverage where applicable.
5. Build and persist the snapshot atomically with the uniqueness check and associated audit/state changes. Do not let a second owner publish the same slug between an availability check and a write.
6. Return the stored snapshot in `{snapshot}` with 201; public reads return that persisted representation, not live private rows.
7. Keep snapshot content stable when the underlying project is subsequently edited. Republish explicitly updates/replaces the served snapshot according to a documented policy.
8. Unpublish must make the old public slug unavailable for reads. Decide and test whether slug reuse becomes allowed immediately after deletion; the requirements do not mandate historical slug reservation.

**Stage policy to decide:** the example snapshot uses `Publish`. The document does not explicitly require automatically changing the editable project's stage when publishing. Choose and test a consistent snapshot-stage rule without introducing forced stage order.

### 5. Already implemented journey request examples

These are current working contracts, not additional missing addresses. They still depend on creating a project through the currently supported legacy project API until project alignment is implemented.

| Action | Method/path | Example JSON body | Success envelope |
| --- | --- | --- | --- |
| Create blocker | POST `/api/projects/{project_id}/blockers` | `{"title":"Authentication fails in production"}` | `{blocker}` |
| Append attempt | POST `/api/blockers/{blocker_id}/attempts` | `{"attempt":"Checked environment variables"}` | `{blocker}` |
| Resolve blocker | POST `/api/blockers/{blocker_id}/resolve` | `{"solution":"Updated production environment variables"}` | `{blocker, evidence}` |
| Create task | POST `/api/projects/{project_id}/tasks` | `{"title":"Complete one practice exercise","stage":"Practice"}` | `{task}` |
| Toggle task | PATCH `/api/tasks/{task_id}/toggle` | No body | `{task}` |
| Create design | POST `/api/projects/{project_id}/designs` | `{"title":"Dashboard wireframe","kind":"Wireframe","tool":"Figma","url":"https://example.com/design","image":null,"note":"Initial layout","stage":"Prototype"}` | `{design}` |
| Create decision | POST `/api/projects/{project_id}/decisions` | `{"decision":"Use PostgreSQL","reason":"Shared persistence","stage":"Build"}` | `{decision}` |

Deletion paths, list paths, and statuses are in the complete inventory. The generic `example.com` design URL illustrates valid HTTP(S) syntax; it is not a claim that a design resource exists there.

### 6. Complete model and validation checklist

The fields below are the specification's model fields. Cross-cutting `updated_at` support should be applied through a documented policy; it should not be confused with a field explicitly listed on every model.

| Model | Required model fields |
| --- | --- |
| User | `id`, `name`, `email`, stored hashed password, `created_at` |
| Project | `id`, `user_id`, `name`, `goal`, `users`, optional `constraints`, `stage`, nullable `repo`, `created_at` |
| Evidence | `id`, `project_id`, `type`, `text`, `date`, `source`, `provenance`, `stage`, `public`, `created_at` |
| Blocker | `id`, `project_id`, `title`, `status`, `attempts`, nullable `solution`, `created_at`, nullable `resolved_at` |
| Task | `id`, `project_id`, `title`, `stage`, `done`, `created_at`, nullable `done_at` |
| Design | `id`, `project_id`, `title`, `kind`, `tool`, `url`, nullable `image`, `note`, `stage`, `created_at` |
| Decision | `id`, `project_id`, `decision`, `reason`, `stage`, `created_at` |
| PublishDraft | `id`, unique `project_id`, `slug`, nullable `story`, `include_blockers`, `updated_at` |
| PublishedSnapshot | `id`, unique `slug`, `project_id`, `name`, `goal`, `users`, `stage`, nullable `repo`, `author`, `published_at`, `story`, full public `evidence` objects, full resolved `blockers` objects |

Required constants:

```text
STAGES:
Think, Learn, Practice, Get unstuck, Prototype, Build,
Validate, Document, Publish, Demonstrate, Opportunity, Contribution

EVIDENCE_TYPES:
Commit, Pull request, Test, Screenshot, Decision, Learning,
AI session, Blocker resolved

PROVENANCE:
Human, AI-assisted, Collaborator, External

DESIGN_KINDS:
Wireframe, Mockup, Flow, Diagram, Other

DESIGN_TOOLS:
Figma, Excalidraw, tldraw, Balsamiq, Penpot, draw.io, Mermaid, Other

STORY_KEYS:
problem, process, build, challenges, result
```

Required bounds/defaults:

| Field / behavior | Required rule |
| --- | --- |
| Project name | 2–60 characters |
| Project goal | At least 10 characters |
| Evidence text | At most 140 characters |
| Blocker title | At most 140 characters |
| Design title | At most 80 characters |
| Design note | At most 300 characters |
| Decision text | At most 120 characters |
| Decision reason | At most 300 characters |
| Slug | 3–50 characters, matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| Email | Valid email, normalized lowercase, globally unique account email |
| Design URL | Valid HTTP(S) URL |
| Design image | Nullable base64 JPEG data URL, maximum 1200px dimensions, normalized at quality 80 |
| Project repo | Nullable `owner/repo` string |
| Evidence public | False by default |
| Task done | False by default; set/clear `done_at` on toggle |
| Draft include_blockers | True by default |
| Stage transitions | All specified stages supported; no forced sequential progression required |
| List page limit | 100 by default |
| Date order | Descending by default; document selectable sort controls |
| JWT lifetime | Seven days |
| Deletion | Project deletion cascades to related resources |

Do not invent additional mandatory length bounds for fields where the document does not give them. Existing defensive input/body limits can remain as documented implementation safeguards.

### 7. Shared response, error and list behavior

Target error envelope:

```json
{
  "error": "Validation error",
  "details": {
    "field": "goal",
    "message": "Goal must contain at least 10 characters"
  }
}
```

The example `details` shape is illustrative, not a mandated field-error schema. `details` is optional. Never include submitted passwords, bearer/reset tokens, image data, raw database errors, or full detected secret values in returned validation/error context.

| Situation | Required or proposed status policy |
| --- | --- |
| Successful signup/resource creation | 201 where explicitly specified |
| Successful login/read/update/toggle/draft save/slug check | 200 |
| Successful deletion/unpublish | 204 with empty body |
| Signup invalid payload or duplicate email | 400, explicitly specified |
| Login invalid credentials | 401, explicitly specified |
| Missing/invalid token on protected resources | 401, consistent with existing authorization behavior |
| Missing public snapshot | 404 with `Project not found`, explicitly specified |
| Missing/foreign owned resource | Ownership-safe 404, retained existing policy |
| Non-signup input validation | Document consistently; 422 may remain because the specification does not fix these statuses |
| Racing slug conflict or incompatible repeat resolution | Proposed 409 conflict policy; document and test |
| Rate-limit exceeded | Retain 429 and useful retry semantics |
| Database/rate-limit dependency unavailable | Retain 503 JSON error envelope |
| Unexpected server exception | Add generic 500 JSON envelope with internal logging, not client-visible exception details |

Pagination design should retain each required plural key (`projects`, `evidence`, `blockers`, `tasks`, `designs`, `decisions`). Extra metadata is allowed. A possible common response is:

```json
{
  "evidence": [],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 0,
    "hasMore": false
  }
}
```

This metadata schema is a proposal based on the working journey lists, not a new requirement. Choose consistent pagination parameters, preserve stable ordering for equal dates, and ensure totals reflect all filters and ownership conditions. CORS must permit authenticated GET/POST/PATCH/PUT/DELETE requests from the deployed frontend origin.

### 8. Database and backward-compatibility work

| Area | Storage/migration work | Safety checks |
| --- | --- | --- |
| Project fields | Add canonical goal/audience/constraints/stage columns and canonical repository representation. | Preserve legacy summary/stack/span/status until all consumers migrate; do not blindly copy malformed legacy data into constrained fields. |
| Generic evidence | Expose canonical text/date/public and fully populate/validate type/provenance/stage metadata. | Keep legacy bodies and evidence audit history; avoid lossy type/provenance inference. |
| Publish drafts | Add a draft table with UUID ID, unique project FK, slug, nullable story payload, include-blockers default, timestamp. | Project cascade, repeatable migration, concurrent PUT uniqueness. |
| Published snapshots | Add/adapt storage for the full snapshot payload and globally unique slug. | Existing duplicate slugs across authors must be detected and resolved before installing global uniqueness. |
| IDs | Define new UUID generation and a legacy-ID compatibility strategy. | Any rewrite must preserve every referencing FK, stored publication reference, and audit-chain integrity; external bookmarks/clients need migration handling. |
| Password hashes | Support mandated new hash format while retaining a controlled legacy verification path. | Successful-login upgrade, reset upgrade, bad-password rejection, no secret logs. |
| JWT/session records | Replace custom token signing/validation without losing logout/reset revocation guarantees. | Decide whether old sessions are invalidated at cutover or temporarily accepted; test expiration and revocation. |
| Timestamps | Define server-generated UTC snake-case API timestamps and update timestamps for mutable records. | Do not reset historical creation dates; immutable snapshot publication timestamp remains stable. |
| Filtering indexes | Match owner/project/date and selected evidence filter predicates. | Check query plans on representative PostgreSQL data, not just empty SQLite fixtures. |

The current storage initializer records migrations through version 6 and adds evidence `type/provenance/stage` metadata. Continue with a new repeatable migration rather than rewriting historical migrations or pretending those metadata columns alone align the public API. Source: `src/storage/db.py:90`.

Proposed rollout:

1. Inventory existing records, duplicate public slugs, non-UUID IDs, non-GitHub repository URLs, and evidence that cannot be mapped safely.
2. Back up data and test restoration before schema changes.
3. Add storage and compatibility readers without destructive overwrites.
4. Backfill only fields whose meaning can be established; require user correction or an explicit policy for ambiguous values.
5. Introduce canonical schemas/routes and contract tests; retain legacy aliases for a documented transition if existing clients need them.
6. Migrate the frontend and optional integrations to canonical responses, verify real PostgreSQL behavior, then retire legacy contracts deliberately.

### 9. Optional and existing non-core API addresses

These are **outside the 31 required endpoints and outside the 61-item score**. Retain useful working extensions, but do not count them as substitutes for missing required paths.

| Address | Current purpose / optional target |
| --- | --- |
| POST `BASE/api/auth/logout` | Existing session revocation; test again after JWT migration. |
| GET/PATCH `BASE/api/auth/me` | Existing profile operations; align full user serialization. |
| POST `BASE/api/auth/password/reset` | Existing reset-request alias. |
| POST `BASE/api/auth/password/confirm` | Existing reset confirmation; not an explicitly listed frontend contract address. |
| GET/DELETE `BASE/api/projects/{project_id}` | Existing extra project detail/delete operations. |
| GET/PATCH/DELETE `BASE/api/projects/{project_id}/evidence/{evidence_id}` | Existing legacy evidence detail/update/delete operations. |
| POST `BASE/api/projects/{project_id}/evidence/scan` | Existing evidence scan operation. |
| GET `BASE/api/projects/{project_id}/publish/status` | Existing publication-status extension, not a publish draft. |
| GET `BASE/api/public/{username}/{slug}` | Existing legacy JSON publication lookup; not the required slug-only route. |
| GET `BASE/public/{username}/{slug}` | Existing legacy public rendering endpoint outside the `/api` prefix. |
| GET `BASE/api/integrations/github/authorize` | Existing GitHub authorization initiation. |
| POST `BASE/api/integrations/github/connect` | Existing OAuth connection operation. |
| GET `BASE/api/integrations/github/repos` | Existing repository listing. |
| POST `BASE/api/projects/{project_id}/sync` | Existing project repository synchronization. |
| POST `BASE/api/webhooks/github` | Existing signed webhook ingress; signature verification is not user JWT authentication. |
| `BASE/api/projects/{project_id}/github/connect` | Optional future address mentioned in requirements; method/body not specified there. |
| `BASE/api/projects/{project_id}/github/sync` | Optional future address mentioned in requirements; not the same as current `/sync`. |

Optional GitHub completion also needs secure token storage and an explicit decision on automatic evidence creation from commits/PRs. It must not accidentally publish imported private data. Verify OAuth callback and signed webhook behavior through the actual public ingress before deployment.

### 10. Implementation order and acceptance checks

| Step | Scope | Audit IDs primarily addressed | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Canonical project schemas, persistence, repository format, timestamps and envelopes | M02, E04–E06, parts of M01/S06/V04/I04 | Documented project example succeeds; PATCH values persist; boundary and owner-isolation tests pass. |
| 2 | Canonical evidence API, all enums/provenance/stages, filters and ID-only actions | M03, E07–E10, V05, P02 | Exact evidence example succeeds; all filter combinations work; toggle/delete ownership and concurrency tests pass. |
| 3 | Drafts, full story snapshots, global slugs and public lookup | M08/M09, E26–E28/E30/E31, I02/I03, V01 | All six new paths registered; race-safe slug conflicts; immutable/private-safe public snapshots; draft uniqueness. |
| 4 | Seven-day JWTs, mandated hashing and signup statuses | M01, E01/E02, S01–S03 | JWT expiration/tampering/revocation tests; old-hash upgrade; invalid/duplicate signup returns 400. |
| 5 | Shared timestamps, page defaults, sort controls and error envelopes | I04, P01/P03, X01 | Every resource default limit is 100; date order controls verified; unexpected errors return safe JSON. |
| 6 | Migration, supported runtime, services and release checks | Cross-cutting release evidence | Zero failing suite; real PostgreSQL/Redis tests execute; frontend end-to-end flows and deployment checks pass. |

These steps overlap; completing one row does not automatically fulfill every referenced audit ID. Preserve the existing full journey contracts throughout the changes.

Minimum new regression coverage:

- Every required method/path, request schema, success envelope, and documented status.
- New UUID IDs and consistent snake-case timestamps without leaking password hashes.
- Project name 1/2/60/61-character boundaries and goal 9/10-character boundaries.
- Evidence text 140/141-character boundaries; every type/provenance/stage; false visibility default.
- Omitted versus explicit null PATCH values; required fields cannot be cleared accidentally.
- Every new protected route with no token, invalid/expired token, owner token, and another user's token.
- Combined evidence filters, invalid enum values, empty/out-of-range pages, default limit 100, equal-date stable ordering and sorting controls.
- Concurrent evidence toggles, resolution retries, transactional rollback, and mutation audit-chain validity.
- Draft read-before-save policy, repeated PUT, concurrent PUT, one draft per project and deletion cascade.
- Slug boundary lengths, uppercase/underscore/space/repeated-hyphen rejection, globally conflicting authors, same-project republish, and simultaneous competing publishes.
- Published evidence is public only; included blockers are resolved only; include-blockers false excludes all blockers.
- Secrets in each story section, project fields, evidence fields and included blocker fields block publication without leaking the secret in the error response.
- Public access without authentication; unpublished/unknown slug 404; snapshot remains unchanged after private edits.
- Seven-day expiration, invalid token signature/algorithm rejection, logout/reset revocation and old-hash migration.
- Unexpected exception 500 envelope, database outage 503, body-limit and rate-limit error envelopes, authenticated CORS preflight including PUT.
- Repeatable migration of populated SQLite and PostgreSQL databases, historical evidence/audit preservation, and restore testing.

### 11. Manual verification commands and release limitations

After the required environment variables are supplied, an existing local launch command is:

```bash
PYTHONPATH=src uvicorn api.app:app --host 127.0.0.1 --port 4117
```

Do not assume copying the current `.env.example` is sufficient: it still uses legacy `CONTINUITY_*` keys, while `Settings` requires `NUVORA_SECRET_KEY`. Configure the actual `NUVORA_*` values and never commit real secrets. Production validation requires additional separate secrets and external services.

Address checks against a running local server:

```bash
curl -i http://127.0.0.1:4117/livez
curl -i http://127.0.0.1:4117/healthz
curl -i http://127.0.0.1:4117/openapi.json
```

Example target project/evidence requests, **expected to require the documented code changes before they succeed**:

```bash
export API_BASE=http://127.0.0.1:4117
export TOKEN='<token returned by signup or login>'
export PROJECT_ID='<project UUID>'

curl -i -X POST "$API_BASE/api/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"EduBoost AI","goal":"Build an accessible learning platform","users":"Students","constraints":"Small team","stage":"Think","repo":"ada/eduboost-ai"}'

curl -i -X POST "$API_BASE/api/projects/$PROJECT_ID/evidence" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"type":"Screenshot","text":"Dashboard finished","date":"2026-09-30T10:00:00Z","source":"CleanShot","provenance":"Human","stage":"Build","public":false}'

curl -i "$API_BASE/api/projects/$PROJECT_ID/publish/check-slug/eduboost-ai" \
  -H "Authorization: Bearer $TOKEN"

curl -i "$API_BASE/api/public/eduboost-ai"
```

Local regression command:

```bash
PYTHONPATH=src pytest -q -rs
```

For production integration tests, provide the actual PostgreSQL and Redis test-service variables used by `tests/test_services_integration.py:13`; do not point destructive test fixtures at a production database. Run under supported Python 3.12, with the declared dependencies available. This documentation expansion did not rerun the application suite; its last verified results are the original audit results above.

Additional filesystem observations during this expansion: `Dockerfile`, `.env.production.example`, and `.github/` were not present in the inspected workspace. `compose.yaml` references `build: .`, and README/deployment checklist claims about container/CI artifacts should therefore be checked against actual tracked release files. These are deployment observations, not added items in the 61-requirement denominator.

**Completion standard:** update the 61-row audit only after canonical schemas/routes, migration tests, the complete suite, real dependency tests and frontend integration demonstrate the claimed changes. A larger document, added route stub, or successful legacy-only test is not proof of full requirement fulfillment.

### 12. Environment and deployment configuration checklist

These are configuration keys the current code reads, not additional API paths. Local examples are illustrative; production values and credentials must be supplied by the deployment owner.

| Variable | Purpose / required work |
| --- | --- |
| `NUVORA_ENVIRONMENT` | `development`, `test`, or `production`; production activates stricter validation. |
| `NUVORA_HOST`, `NUVORA_PORT` | API binding. Default local address is `127.0.0.1:4117`; container listener configuration must match published ports. |
| `NUVORA_SECRET_KEY` | Required signing secret, at least 32 characters; use a strong generated secret, not a pasted example. |
| `NUVORA_ENCRYPTION_KEY` | Separate strong production encryption secret; must differ from signing secret. |
| `NUVORA_PUBLIC_BASE_URL` | Required URL used for published page links; HTTPS in production, no trailing slash. It need not equal the API origin. |
| `NUVORA_FRONTEND_BASE_URL` | Frontend origin/base URL; HTTPS in production. |
| `NUVORA_ENABLE_CORS`, `NUVORA_CORS_ORIGINS` | Enable CORS and supply the actual nonempty allowed frontend-origin list; no credentialed wildcard origins. |
| `NUVORA_DATABASE_PATH` | Local SQLite location; use a project-relative path such as `data/nuvora.sqlite3` for workspace-local development. |
| `NUVORA_DATABASE_URL` | Required PostgreSQL URL in production, including host and database name. |
| `NUVORA_DATABASE_POOL_MIN_SIZE`, `NUVORA_DATABASE_POOL_SIZE` | Bound PostgreSQL connection pool; minimum must not exceed maximum. |
| `NUVORA_RATE_LIMIT_ENABLED`, `NUVORA_RATE_LIMIT_REDIS_URL` | Enable rate limiting; production configuration requires Redis URL. Keep auth protections enabled. |
| `NUVORA_RATE_LIMIT_AUTH_MAX`, `NUVORA_RATE_LIMIT_AUTH_WINDOW` | Auth request budget/window. |
| `NUVORA_RATE_LIMIT_API_MAX`, `NUVORA_RATE_LIMIT_API_WINDOW` | General API request budget/window. |
| `NUVORA_TOKEN_TTL_HOURS` | Target value 168 for seven days after JWT alignment; current default 336. Does not fix token format by itself. |
| `NUVORA_REQUEST_BODY_MAX_BYTES` | Global body limit; coordinate with bounded design image payloads. |
| `NUVORA_TRUSTED_PROXY_IPS` | Only trusted ingress/proxy IP addresses should influence forwarded client identity. |
| `NUVORA_GITHUB_CLIENT_ID`, `NUVORA_GITHUB_CLIENT_SECRET` | OAuth credentials; current configuration requires nonplaceholder credentials in production although GitHub is optional in the API requirements. |
| `NUVORA_GITHUB_REDIRECT_URI` | Configured OAuth callback destination; HTTPS in production. Verify the actual frontend/backend callback flow rather than inventing a backend callback route. |
| `NUVORA_GITHUB_WEBHOOK_SECRET` | Strong production webhook signature secret. |
| `NUVORA_SMTP_HOST`, `NUVORA_SMTP_PORT` | Password-reset email provider connection settings. |
| `NUVORA_SMTP_USER`, `NUVORA_SMTP_PASSWORD`, `NUVORA_SMTP_FROM_EMAIL` | Current production configuration requires valid provider credentials/from address. |
| `NUVORA_SEED_DEMO` | Must be false in production. |
| `NUVORA_TEST_POSTGRES_URL` | Dedicated disposable PostgreSQL integration-test service, not a production database. |
| `NUVORA_TEST_REDIS_URL` | Dedicated Redis integration-test service. |

Source: `src/config.py:25`, `src/config.py:176`, `tests/test_services_integration.py:13`.

The project's current production configuration imposes operational requirements beyond the optional-GitHub frontend specification. Decide whether to keep that production policy or make the integration genuinely optional; this is a policy difference, not proof that the required GitHub project routes already exist.

Before release, verify the complete environment template uses `NUVORA_*`, deployment artifacts actually exist, startup succeeds with real configuration, the API host is reachable through HTTPS ingress, CORS matches the frontend origin, dependency health checks pass, email reset delivery works, backups restore successfully, and concurrency/failure-recovery tests run against real services.
The deployment checklist's previous `60 passed` statement is not the current local result. The codebase is **partially implemented, not fully compliant or validated for deployment**.