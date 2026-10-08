-- 0017_tasks_archive_and_search.sql
-- 1. Update status constraint to include 'archived'
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('inbox', 'open', 'completed', 'archived'));

-- 2. Update completed_at constraint to permit archived completed tasks
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_completed_at_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_completed_at_check
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status = 'archived' AND (completed_at IS NOT NULL OR completed_at IS NULL)) OR
    (status IN ('inbox', 'open') AND completed_at IS NULL)
  );

-- 3. Functional GIN index for full-text search across title and notes
CREATE INDEX IF NOT EXISTS tasks_search_gin_idx ON public.tasks 
  USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(notes, ''))
  );

-- 4. Fast index for archive filtering
CREATE INDEX IF NOT EXISTS tasks_user_archived_idx ON public.tasks (user_id, status)
  WHERE status = 'archived';
