
-- Ensure cfa agent exists
INSERT INTO public.agents (slug, name, owner, status)
VALUES ('cfa', 'CFA', 'system', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Create agent_inbox table
CREATE TABLE IF NOT EXISTS public.agent_inbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_slug TEXT NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'question',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  response TEXT,
  delivery_channel TEXT DEFAULT 'cli',
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  processed_at TIMESTAMPTZ,
  processed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_inbox ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Agent inbox is publicly readable"
  ON public.agent_inbox FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON public.agent_inbox FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update messages"
  ON public.agent_inbox FOR UPDATE TO authenticated
  USING (true);

-- Indexes
CREATE INDEX idx_agent_inbox_slug_status ON public.agent_inbox (agent_slug, status);
CREATE INDEX idx_agent_inbox_author ON public.agent_inbox (author_email);

-- Migrate existing financial_inquiries
INSERT INTO public.agent_inbox (id, agent_slug, author_email, author_name, content, type, status, response, delivery_channel, locked_at, locked_by, processed_at, processed_by, created_at)
SELECT id, 'cfa', author_email, author_name, content, type, status, response, delivery_channel, locked_at, locked_by, processed_at, processed_by, created_at
FROM public.financial_inquiries;
