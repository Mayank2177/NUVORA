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
  role TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('developer','employer')),
  headline TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  location TEXT DEFAULT '',
  website TEXT DEFAULT '',
  github_handle TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  skills TEXT DEFAULT '[]',
  hidden_projects TEXT DEFAULT '[]',
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
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

-- Marketplace task-for-hire system tables
CREATE TABLE IF NOT EXISTS marketplace_tasks (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  raw_need TEXT,
  summary TEXT,
  requirements TEXT NOT NULL DEFAULT '[]',
  skills_required TEXT NOT NULL DEFAULT '[]',
  complexity TEXT CHECK (complexity IN ('Small','Medium','Large')),
  scope TEXT,
  acceptance TEXT NOT NULL DEFAULT '[]',
  budget_min INTEGER,
  budget_max INTEGER,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','assigned','in_review','changes_requested','completed','closed','cancelled')),
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS task_applications (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  proposal TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (task_id, developer_id)
);

CREATE TABLE IF NOT EXISTS task_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  developer_name TEXT NOT NULL,
  application_id TEXT NOT NULL REFERENCES task_applications(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1,
  submission_url TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  criteria TEXT NOT NULL DEFAULT '[]',
  tests TEXT,
  checks TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','revision_requested')),
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  review TEXT
);

CREATE TABLE IF NOT EXISTS developer_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 5),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, skill_name)
);

CREATE TABLE IF NOT EXISTS match_scores (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
  skill_match REAL NOT NULL,
  evidence_match REAL NOT NULL,
  availability_match REAL NOT NULL,
  calculated_at TEXT NOT NULL,
  UNIQUE (task_id, developer_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_employer ON marketplace_tasks(employer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_status ON marketplace_tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_applications_task ON task_applications(task_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_applications_developer ON task_applications(developer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_submissions_task ON task_submissions(task_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_developer_skills_user ON developer_skills(user_id, skill_name);
CREATE INDEX IF NOT EXISTS idx_match_scores_task ON match_scores(task_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_match_scores_developer ON match_scores(developer_id, score DESC);

-- Task offers/invitations system
CREATE TABLE IF NOT EXISTS task_offers (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  developer_name TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('invite','interest')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','closed')),
  created_at TEXT NOT NULL,
  responded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_offers_task ON task_offers(task_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_offers_developer ON task_offers(developer_id, status, created_at DESC);

-- Developer onboarding profiles
CREATE TABLE IF NOT EXISTS developer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  goals TEXT NOT NULL DEFAULT '[]',
  interests TEXT NOT NULL DEFAULT '[]',
  skills TEXT NOT NULL DEFAULT '[]',
  github_handle TEXT,
  open_to_work INTEGER NOT NULL DEFAULT 0 CHECK (open_to_work IN (0,1)),
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_developer_profiles_open_to_work ON developer_profiles(open_to_work, updated_at DESC);

-- Employer onboarding profiles
CREATE TABLE IF NOT EXISTS employer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  industry TEXT NOT NULL,
  team_size TEXT NOT NULL,
  website TEXT,
  needs TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings TEXT NOT NULL DEFAULT '{}',
  preferences TEXT NOT NULL DEFAULT '{}',
  notifications TEXT NOT NULL DEFAULT '{}',
  onboarding_completed_at TEXT,
  updated_at TEXT NOT NULL
);

-- Skill verifications (employer validations)
CREATE TABLE IF NOT EXISTS skill_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  task_id TEXT REFERENCES marketplace_tasks(id) ON DELETE SET NULL,
  task_title TEXT NOT NULL,
  company TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_verifications_user ON skill_verifications(user_id, skill_name, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_verifications_skill ON skill_verifications(skill_name, verified_at DESC);

-- Workspace state for code editor
CREATE TABLE IF NOT EXISTS workspace_states (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  files TEXT NOT NULL DEFAULT '{}',
  folders TEXT NOT NULL DEFAULT '[]',
  open_tabs TEXT NOT NULL DEFAULT '[]',
  active_tab TEXT NOT NULL DEFAULT '',
  ai_dirty INTEGER NOT NULL DEFAULT 0 CHECK (ai_dirty IN (0,1)),
  ai_files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_states_updated ON workspace_states(updated_at DESC);
"""
