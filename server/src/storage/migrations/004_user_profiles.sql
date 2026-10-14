-- Add user profile fields

ALTER TABLE users ADD COLUMN headline TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN location TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN website TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN github_handle TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN linkedin_url TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN skills TEXT DEFAULT '[]';  -- JSON array
ALTER TABLE users ADD COLUMN hidden_projects TEXT DEFAULT '[]';  -- JSON array
ALTER TABLE users ADD COLUMN is_public INTEGER DEFAULT 0 CHECK (is_public IN (0,1));

-- Create index for public profiles
CREATE INDEX IF NOT EXISTS idx_users_username_public ON users(username, is_public);
CREATE INDEX IF NOT EXISTS idx_users_is_public ON users(is_public, updated_at DESC);
