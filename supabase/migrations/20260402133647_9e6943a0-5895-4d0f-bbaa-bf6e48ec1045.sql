-- Phase 2: Add advanced columns to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tasks(id),
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS requires_triage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring jsonb,
  ADD COLUMN IF NOT EXISTS estimated_hours numeric;

-- Task links junction table
CREATE TABLE IF NOT EXISTS public.task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  link_type text NOT NULL,
  link_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can select task links" ON public.task_links FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert task links" ON public.task_links FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Staff can view task links" ON public.task_links FOR SELECT TO authenticated USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');
CREATE POLICY "Staff can insert task links" ON public.task_links FOR INSERT TO authenticated WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');
CREATE POLICY "Staff can delete task links" ON public.task_links FOR DELETE TO authenticated USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');