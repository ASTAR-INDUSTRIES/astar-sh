
-- overtime_runs
CREATE TABLE public.overtime_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  spec_title text NOT NULL,
  type text NOT NULL DEFAULT 'dev',
  parent_task_number integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  total_cycles_u integer NOT NULL DEFAULT 0,
  total_cycles_e integer NOT NULL DEFAULT 0,
  total_rejections integer NOT NULL DEFAULT 0,
  total_cost_usd numeric,
  model text,
  worktree_path text,
  branch_name text,
  git_commits text[] NOT NULL DEFAULT '{}',
  created_by text NOT NULL
);

ALTER TABLE public.overtime_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read overtime_runs" ON public.overtime_runs
  FOR SELECT TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can insert overtime_runs" ON public.overtime_runs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can update overtime_runs" ON public.overtime_runs
  FOR UPDATE TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

-- overtime_cycles
CREATE TABLE public.overtime_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.overtime_runs(id) ON DELETE CASCADE,
  agent text NOT NULL,
  cycle_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  exit_code integer,
  subtask_number integer,
  action_taken text,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric,
  model text,
  tool_calls_count integer,
  turns_used integer,
  max_turns integer
);

ALTER TABLE public.overtime_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read overtime_cycles" ON public.overtime_cycles
  FOR SELECT TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can insert overtime_cycles" ON public.overtime_cycles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can update overtime_cycles" ON public.overtime_cycles
  FOR UPDATE TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

-- Index for fast cycle lookups by run
CREATE INDEX idx_overtime_cycles_run_id ON public.overtime_cycles(run_id);

-- Reload schema cache so PostgREST picks up the new tables immediately
NOTIFY pgrst, 'reload schema';
