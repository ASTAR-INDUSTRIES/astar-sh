
-- Create financial_inquiries table
CREATE TABLE public.financial_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'question',
  content TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_name TEXT,
  delivery_channel TEXT DEFAULT 'cli',
  status TEXT NOT NULL DEFAULT 'pending',
  response TEXT,
  processed_by TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT,
  locked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_inquiries ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) can do everything - no RLS policies needed for service role
-- But we need anon/authenticated policies for the edge functions using service role key

-- Allow edge functions (using service role) full access - RLS is bypassed for service role
-- For direct client access (if ever needed):
CREATE POLICY "Users can view own inquiries"
ON public.financial_inquiries
FOR SELECT
TO authenticated
USING (author_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can insert own inquiries"
ON public.financial_inquiries
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Staff can view all inquiries"
ON public.financial_inquiries
FOR SELECT
TO authenticated
USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

CREATE POLICY "Staff can update inquiries"
ON public.financial_inquiries
FOR UPDATE
TO authenticated
USING ((SELECT (auth.jwt() ->> 'email')) LIKE '%@astarconsulting.no');

-- Add created_by column to milestones (used by skills-api)
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS created_by TEXT;
