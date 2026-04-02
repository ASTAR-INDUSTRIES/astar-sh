-- Phase 3: Full-text search on tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_tasks_search ON public.tasks USING gin(search_vector);

CREATE OR REPLACE FUNCTION public.tasks_search_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, '') || ' ' || array_to_string(NEW.tags, ' '));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_search ON public.tasks;
CREATE TRIGGER trg_tasks_search BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_search_update();

-- Backfill existing rows
UPDATE public.tasks SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(tags, ' '));