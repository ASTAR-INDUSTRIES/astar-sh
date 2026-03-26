
-- Add write policies for posts table (restricted to astarconsulting.no domain)
CREATE POLICY "Authenticated astarconsulting.no users can insert posts"
ON public.posts
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);

CREATE POLICY "Authenticated astarconsulting.no users can update posts"
ON public.posts
FOR UPDATE
TO authenticated
USING (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);

CREATE POLICY "Authenticated astarconsulting.no users can delete posts"
ON public.posts
FOR DELETE
TO authenticated
USING (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);

-- Add write policies for research_articles table (restricted to astarconsulting.no domain)
CREATE POLICY "Authenticated astarconsulting.no users can insert research"
ON public.research_articles
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);

CREATE POLICY "Authenticated astarconsulting.no users can update research"
ON public.research_articles
FOR UPDATE
TO authenticated
USING (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);

CREATE POLICY "Authenticated astarconsulting.no users can delete research"
ON public.research_articles
FOR DELETE
TO authenticated
USING (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);

-- Also allow authenticated astarconsulting.no users to SELECT all posts/research (including unpublished)
CREATE POLICY "Staff can view all posts"
ON public.posts
FOR SELECT
TO authenticated
USING (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);

CREATE POLICY "Staff can view all research"
ON public.research_articles
FOR SELECT
TO authenticated
USING (
  (SELECT (auth.jwt()->>'email')::text) LIKE '%@astarconsulting.no'
);
