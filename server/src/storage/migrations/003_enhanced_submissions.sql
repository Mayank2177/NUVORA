-- Add enhanced submission fields for checks, criteria, tests, and reviews

-- Add new columns to task_submissions table
ALTER TABLE task_submissions ADD COLUMN developer_name TEXT;
ALTER TABLE task_submissions ADD COLUMN round INTEGER DEFAULT 1;
ALTER TABLE task_submissions ADD COLUMN summary TEXT DEFAULT '';
ALTER TABLE task_submissions ADD COLUMN link TEXT DEFAULT '';
ALTER TABLE task_submissions ADD COLUMN criteria TEXT DEFAULT '[]';  -- JSON array of {text, how}
ALTER TABLE task_submissions ADD COLUMN tests TEXT;  -- JSON object or NULL
ALTER TABLE task_submissions ADD COLUMN checks TEXT DEFAULT '[]';  -- JSON array of check objects
ALTER TABLE task_submissions ADD COLUMN review TEXT;  -- JSON object or NULL

-- Update existing records to have developer names
UPDATE task_submissions 
SET developer_name = (SELECT name FROM users WHERE users.id = task_submissions.developer_id)
WHERE developer_name IS NULL;

-- Create index for faster queries by task
CREATE INDEX IF NOT EXISTS idx_task_submissions_task ON task_submissions(task_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_submissions_developer ON task_submissions(developer_id, submitted_at DESC);
