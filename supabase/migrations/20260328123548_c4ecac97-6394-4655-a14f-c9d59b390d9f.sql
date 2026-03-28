
-- Create tweets table for short-form company thoughts
CREATE TABLE public.tweets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  author_name TEXT,
  author_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tweets ENABLE ROW LEVEL SECURITY;

-- Public can read all tweets
CREATE POLICY "Tweets are viewable by everyone"
ON public.tweets
FOR SELECT
TO public
USING (true);

-- Staff can insert tweets
CREATE POLICY "Staff can insert tweets"
ON public.tweets
FOR INSERT
TO authenticated
WITH CHECK ((SELECT (auth.jwt() ->> 'email'::text)) ~~ '%@astarconsulting.no'::text);

-- Staff can update tweets
CREATE POLICY "Staff can update tweets"
ON public.tweets
FOR UPDATE
TO authenticated
USING ((SELECT (auth.jwt() ->> 'email'::text)) ~~ '%@astarconsulting.no'::text);

-- Staff can delete tweets
CREATE POLICY "Staff can delete tweets"
ON public.tweets
FOR DELETE
TO authenticated
USING ((SELECT (auth.jwt() ->> 'email'::text)) ~~ '%@astarconsulting.no'::text);

-- Trigger for updated_at
CREATE TRIGGER update_tweets_updated_at
BEFORE UPDATE ON public.tweets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
