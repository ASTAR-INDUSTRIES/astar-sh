
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  actor_email TEXT,
  actor_name TEXT,
  actor_type TEXT NOT NULL DEFAULT 'human',
  actor_agent_id TEXT,
  channel TEXT,
  state_before JSONB,
  state_after JSONB,
  context JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit events are viewable by everyone" ON public.audit_events FOR SELECT TO public USING (true);
CREATE POLICY "Anon can insert audit events" ON public.audit_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated can insert audit events" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON public.audit_events (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_events (actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_channel ON public.audit_events (channel);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_lookup ON public.audit_events (entity_type, entity_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_events;
