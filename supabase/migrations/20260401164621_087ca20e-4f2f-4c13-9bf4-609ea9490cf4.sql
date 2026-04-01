
DROP POLICY "Users can insert own inquiries" ON public.financial_inquiries;
CREATE POLICY "Staff can insert inquiries"
ON public.financial_inquiries
FOR INSERT
TO authenticated
WITH CHECK ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');
