
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'private';

-- Use a trigger for validation instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_task_visibility()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.visibility NOT IN ('private', 'team', 'public') THEN
    RAISE EXCEPTION 'visibility must be private, team, or public';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER check_task_visibility
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_task_visibility();

UPDATE tasks SET visibility = 'private' WHERE visibility IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON tasks (visibility);

NOTIFY pgrst, 'reload schema';
