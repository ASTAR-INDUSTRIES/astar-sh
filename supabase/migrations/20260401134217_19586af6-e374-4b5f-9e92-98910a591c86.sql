DROP POLICY "Authenticated insert" ON public.feedback;
DROP POLICY "Authenticated update" ON public.feedback;

CREATE POLICY "Staff can insert feedback" ON public.feedback FOR INSERT TO authenticated
  WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can update feedback" ON public.feedback FOR UPDATE TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');