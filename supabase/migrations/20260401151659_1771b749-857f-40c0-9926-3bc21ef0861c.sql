-- The view needs definer mode since anon can't read the base tweets table directly
-- This is the intended pattern: the view hides author_email from public access
ALTER VIEW public.public_tweets SET (security_invoker = off);