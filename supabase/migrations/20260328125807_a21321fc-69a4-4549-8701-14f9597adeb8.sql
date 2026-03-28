
-- MCP OAuth sessions for Claude Desktop auth flow
CREATE TABLE public.mcp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT UNIQUE,
  client_redirect_uri TEXT,
  code_challenge TEXT,
  code_challenge_method TEXT DEFAULT 'S256',
  auth_code TEXT UNIQUE,
  access_token TEXT UNIQUE,
  user_email TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

-- Enable RLS
ALTER TABLE public.mcp_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions use service role)
-- No public policies needed - all access is through edge functions

-- Index for token lookups
CREATE INDEX idx_mcp_sessions_access_token ON public.mcp_sessions(access_token);
CREATE INDEX idx_mcp_sessions_auth_code ON public.mcp_sessions(auth_code);
CREATE INDEX idx_mcp_sessions_state ON public.mcp_sessions(state);

-- Auto-cleanup expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_mcp_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.mcp_sessions WHERE expires_at < now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_mcp_sessions
AFTER INSERT ON public.mcp_sessions
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_expired_mcp_sessions();
