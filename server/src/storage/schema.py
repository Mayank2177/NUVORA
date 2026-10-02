"""Portable SQLite/PostgreSQL schema for the active NUVORA API."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT INTO schema_migrations (version, applied_at)
VALUES (1, '2026-09-29T00:00:00Z')
ON CONFLICT(version) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  github_id TEXT UNIQUE,
  github_token TEXT,
  avatar_url TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  repo TEXT,
  summary TEXT,
  stack TEXT NOT NULL DEFAULT '[]',
  span TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  message TEXT NOT NULL,
  author TEXT,
  committed_at TEXT NOT NULL,
  hidden TEXT,
  kind TEXT CHECK (kind IN ('resource','snag','proof','ai')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, hash)
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('resource','snag','proof','ai')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  source TEXT,
  occurred_at TEXT NOT NULL,
  ai_assisted INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  publish INTEGER NOT NULL DEFAULT 0,
  sensitive INTEGER NOT NULL DEFAULT 0,
  commit_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_audit (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  evidence_id TEXT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','baseline')),
  payload TEXT NOT NULL,
  position INTEGER NOT NULL,
  prev_hash TEXT,
  entry_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, position)
);

CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  project_id TEXT UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  username TEXT NOT NULL,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  payload TEXT,
  public_url TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  UNIQUE (username, slug)
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  tools TEXT,
  joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blockers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  attempts TEXT NOT NULL DEFAULT '[]',
  solution TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  created_at TEXT NOT NULL,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  tool TEXT NOT NULL,
  url TEXT NOT NULL,
  image TEXT,
  note TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  stage TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_drafts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  story TEXT,
  include_blockers INTEGER NOT NULL DEFAULT 1 CHECK (include_blockers IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blockers_project_time ON blockers(project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project_time ON tasks(project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_designs_project_time ON designs(project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_project_time ON decisions(project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_user_slug_active
  ON projects(user_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user_status_updated
  ON projects(user_id, status, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_repo_normalized ON projects(LOWER(repo));
CREATE INDEX IF NOT EXISTS idx_commits_project ON commits(project_id, committed_at);
CREATE INDEX IF NOT EXISTS idx_commits_project_kind ON commits(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_commits_project_kind_time
  ON commits(project_id, kind, committed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_evidence_project_kind_time
  ON evidence(project_id, kind, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_audit_project
  ON evidence_audit(project_id, position);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_resets_expiry ON password_resets(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_publications_lookup ON publications(username, slug);
CREATE INDEX IF NOT EXISTS idx_waitlist_joined ON waitlist(joined_at DESC);
"""
