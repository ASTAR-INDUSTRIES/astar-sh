-- Create a public view that excludes author_email
CREATE VIEW public.public_tweets AS
  SELECT id, content, author_name, created_at, updated_at
  FROM public.tweets;

-- Remove the overly permissive public SELECT policy
DROP POLICY "Tweets are viewable by everyone" ON public.tweets;

-- Add a policy that only lets authenticated staff read the full table
CREATE POLICY "Staff can view all tweets"
  ON public.tweets FOR SELECT
  TO authenticated
  USING ((SELECT (auth.jwt() ->> 'email'::text)) LIKE '%@astarconsulting.no');

-- Grant anon access to the view
GRANT SELECT ON public.public_tweets TO anon;
GRANT SELECT ON public.public_tweets TO authenticated;