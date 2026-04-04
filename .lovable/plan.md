

## Deploy Agent Inbox — Migration + Edge Functions

### What this does
Sets up a universal agent inbox system so any registered agent can receive and respond to messages from CLI users. Migrates existing financial inquiry data into the new unified inbox.

### Steps

1. **Run database migration** (`20260405000000_agent_inbox.sql`)
   - Ensures `cfa` agent exists in `agents` table
   - Creates `agent_inbox` table with FK to `agents(slug)`, status/type check constraints, RLS policies (public read, authenticated insert/update), and indexes
   - Migrates all existing `financial_inquiries` rows into `agent_inbox` with `agent_slug = 'cfa'`

2. **Deploy `skills-api` edge function**
   - 6 new routes under `/ask/:agent_slug` for submitting messages, listing own messages, reading pending queue, health check, polling single message, and agent responses
   - Old `/inquiries/*` endpoints remain untouched for backward compatibility

3. **Deploy `mcp-server` edge function**
   - New MCP tools: `ask_agent`, `list_inbox`, `read_inbox`, `respond_inbox`
   - Old inquiry tools updated to read/write from `agent_inbox` instead of `financial_inquiries`

4. **Verify deployment**
   - Test `/ask/cfa/health` returns valid JSON (no auth needed)
   - Test `/ping` still works

### Files affected
- `supabase/migrations/20260405000000_agent_inbox.sql` (new migration to run)
- `supabase/functions/skills-api/index.ts` (deploy as-is)
- `supabase/functions/mcp-server/index.ts` (deploy as-is)

