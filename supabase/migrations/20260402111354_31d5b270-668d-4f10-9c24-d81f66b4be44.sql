
-- Create sequence for task numbers
CREATE SEQUENCE IF NOT EXISTS public.task_number_seq START 1;

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number INTEGER NOT NULL DEFAULT nextval('public.task_number_seq'),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_by TEXT NOT NULL,
  assigned_to TEXT,
  completed_by TEXT,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  source TEXT NOT NULL DEFAULT 'human',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(task_number)
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can insert tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can delete tasks" ON public.tasks
  FOR DELETE TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

-- Create task_activity table
CREATE TABLE public.task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'human',
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view task activity" ON public.task_activity
  FOR SELECT TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can insert task activity" ON public.task_activity
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

-- Allow edge functions (anon role) to insert
CREATE POLICY "Anon can insert tasks" ON public.tasks
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can select tasks" ON public.tasks
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can update tasks" ON public.tasks
  FOR UPDATE TO anon USING (true);

CREATE POLICY "Anon can insert task activity" ON public.task_activity
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can select task activity" ON public.task_activity
  FOR SELECT TO anon USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for common queries
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_task_number ON public.tasks(task_number);
CREATE INDEX idx_task_activity_task_id ON public.task_activity(task_id);
