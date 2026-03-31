
CREATE TABLE public.tweet_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id uuid NOT NULL REFERENCES public.tweets(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tweet_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions are viewable by everyone"
ON public.tweet_reactions FOR SELECT
TO public
USING (true);

CREATE POLICY "Anyone can insert reactions"
ON public.tweet_reactions FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE INDEX idx_tweet_reactions_tweet_id ON public.tweet_reactions(tweet_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.tweet_reactions;
