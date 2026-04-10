# MCP

MCP server providing 61 tools for Claude Code integration.

## Request flow

1. Claude Code calls MCP tool via `astar-platform` skill
2. Request hits `supabase/functions/mcp-server/index.ts`
3. Server validates Microsoft token from request headers
4. If caller is an agent (`ASTAR_AGENT` env var), checks scope enforcement
5. Tool handler executes against Supabase (admin client) or Sanity
6. Audit event logged
7. Response returned as MCP text content

## Scope enforcement

Agents have declared `scopes[]` (e.g. `["task.read", "task.create", "news.read"]`). Each MCP tool maps to a scope via `TOOL_SCOPES`. Calls to out-of-scope tools are denied and logged as `scope_denied` audit events.

## Tools by category

### Tweets (4)
post_tweet, list_tweets, delete_tweet, react_to_tweet

### Skills (8)
create_skill, update_skill, delete_skill, list_skills, get_skill, upload_skill_file, delete_skill_file, get_skill_history

### News (4)
create_news, update_news, delete_news, list_news

### Content (2)
query_content, get_stats

### Feedback (3)
submit_feedback, list_feedback, update_feedback

### Projects (4)
create_project, list_projects, get_project, update_project

### Events (4)
create_event, list_events, get_event, update_event

### Milestones (2)
create_milestone, list_milestones

### Agent Inbox (8)
ask_agent, list_inbox, read_inbox, respond_inbox, list_own_inquiries, list_pending_inquiries, submit_inquiry, respond_inquiry

### Tasks (12)
create_task, update_task, complete_task, list_tasks, get_task, comment_task, link_task, triage_tasks, accept_task, dismiss_task, get_velocity, suggest_next_task

### Audit (1)
query_audit

### Agents (3)
list_agents, get_agent, register_agent

### ETF (6)
list_etf, get_etf, create_etf, update_etf, rebalance_etf, refresh_etf_prices

## Key files

- `supabase/functions/mcp-server/index.ts` — all tool definitions and handlers
- Tools array starts with schema definitions, handlers in switch/case block
