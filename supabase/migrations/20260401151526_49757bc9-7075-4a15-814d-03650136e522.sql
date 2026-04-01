-- 1. Lock down mcp_sessions: enable RLS with no public policies
-- Service role (used by edge functions) bypasses RLS automatically
ALTER TABLE public.mcp_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Add emoji validation on tweet_reactions
ALTER TABLE public.tweet_reactions
  ADD CONSTRAINT valid_emoji CHECK (emoji IN ('🔥', '👏', '🧠', '💡', '🎯'));