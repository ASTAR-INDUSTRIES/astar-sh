-- Fix security definer view issue
ALTER VIEW public.public_tweets SET (security_invoker = on);