CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  date date NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Milestones are viewable by everyone" ON public.milestones FOR SELECT TO public USING (true);

CREATE POLICY "Staff can insert milestones" ON public.milestones FOR INSERT TO authenticated WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can update milestones" ON public.milestones FOR UPDATE TO authenticated USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can delete milestones" ON public.milestones FOR DELETE TO authenticated USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');