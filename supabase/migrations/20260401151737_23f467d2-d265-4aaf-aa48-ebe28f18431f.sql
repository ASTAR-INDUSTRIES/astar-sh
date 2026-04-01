-- Drop the view since we're using column-specific selects instead
DROP VIEW IF EXISTS public.public_tweets;

-- Re-add public SELECT policy for tweets
CREATE POLICY "Tweets are viewable by everyone"
  ON public.tweets FOR SELECT
  TO public
  USING (true);

-- Drop the redundant staff-only SELECT policy (the public one covers it)
DROP POLICY IF EXISTS "Staff can view all tweets" ON public.tweets;