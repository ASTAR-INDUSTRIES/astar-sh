
CREATE TABLE public.cli_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  skill_slug text,
  skill_title text,
  user_email text,
  user_name text,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.cli_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CLI events are viewable by everyone"
ON public.cli_events
FOR SELECT
USING (true);

CREATE POLICY "Edge functions can insert events"
ON public.cli_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE INDEX idx_cli_events_created_at ON public.cli_events (created_at DESC);
CREATE INDEX idx_cli_events_skill_slug ON public.cli_events (skill_slug);
