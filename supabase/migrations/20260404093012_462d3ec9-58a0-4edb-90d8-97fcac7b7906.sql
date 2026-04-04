
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  owner TEXT NOT NULL,
  skill_slug TEXT,
  scopes TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  machine TEXT,
  config JSONB DEFAULT '{}',
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Agents are publicly readable"
  ON public.agents FOR SELECT
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can register agents"
  ON public.agents FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Authenticated users can update agents"
  ON public.agents FOR UPDATE
  TO authenticated
  USING (true);

-- Index on slug for fast lookups
CREATE INDEX idx_agents_slug ON public.agents (slug);
CREATE INDEX idx_agents_status ON public.agents (status);
