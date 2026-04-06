# Audit

Append-only event sourcing for all platform mutations.

## Design

Every mutation across the platform (task created, news published, agent heartbeat, etc.) is immutably logged to `audit_events`. This replaces the earlier `cli_events` + `task_activity` tables with a unified system.

## audit_events table

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| timestamp | timestamptz | Default now() |
| actor_email | text | Who did it |
| actor_name | text | Display name |
| actor_type | text | human, agent, system |
| actor_agent_id | text | Agent slug (if actor is agent) |
| entity_type | text | Required — what was affected |
| entity_id | text | Identifier of the entity |
| action | text | Required — what happened |
| state_before | jsonb | Previous state (for diffs) |
| state_after | jsonb | New state |
| channel | text | cli, mcp, api, dashboard, system |
| raw_input | jsonb | Original request payload |
| context | jsonb | Additional context (task_uuid, reason, etc.) |

## Entity types

task, skill, news, feedback, inquiry, milestone, agent — extensible.

## Actions

created, updated, completed, published, deleted, assigned, linked, commented, scope_denied, triage_accepted, triage_dismissed, recurring_created — extensible.

## Channels

| Channel | Source |
|---------|--------|
| cli | `astar` CLI commands |
| mcp | MCP tool calls (Claude Code) |
| api | Direct REST API calls |
| dashboard | Web dashboard actions |
| system | Automated (recurring tasks, link effects) |

## Querying

- CLI: `astar audit [--today] [--entity task] [--actor erik] [--channel mcp]`
- MCP: `query_audit` tool
- API: `GET /audit` with query params

## Key files

- `supabase/functions/skills-api/index.ts` — `logAudit()` helper + REST endpoint
- `supabase/functions/mcp-server/index.ts` — `query_audit` tool
- `cli/src/commands/audit.ts` — CLI command
