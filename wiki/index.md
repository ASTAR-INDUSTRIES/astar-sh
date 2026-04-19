# astar.sh Wiki

System documentation for the astar.sh platform. Each section covers one subsystem — architecture, data model, and how the pieces connect.

**Last updated:** 2026-04-10

## Sections

| Section | Description | Key files |
|---------|-------------|-----------|
| [Auth](auth/) | Microsoft SSO, per-agent auth, MSAL token persistence | `cli/src/lib/auth.ts` |
| [Agents](agents/) | Agent lifecycle, workstations, heartbeat, hire/retire | `cli/src/commands/agent.ts`, `supabase/functions/skills-api/index.ts` |
| [Tasks](tasks/) | Task model, subtasks, links, triage, recurring | `cli/src/commands/todo.ts`, `supabase/functions/skills-api/index.ts` |
| [Projects](projects/) | Workstreams with visibility, members, and cross-entity linking | `cli/src/commands/projects.ts`, `supabase/functions/skills-api/index.ts` |
| [Events](events/) | First-class events with goals, attendees, and linked tasks | `cli/src/commands/events.ts`, `supabase/functions/skills-api/index.ts` |
| [Feedback](feedback/) | Bug reports, feature requests, pain points, praise | `cli/src/commands/feedback.ts`, `supabase/functions/skills-api/index.ts` |
| [Shipped](shipped/) | Milestone logging with categories and project attachment | `cli/src/commands/shipped.ts`, `supabase/functions/skills-api/index.ts` |
| [Audit](audit/) | Event sourcing, entity types, actions, channels | `supabase/functions/skills-api/index.ts` |
| [News](news/) | Intelligence pipeline, quality validation, sources | `supabase/functions/mcp-server/index.ts` |
| [Skills](skills/) | Skill packaging, install/push, versioning, diff | `cli/src/commands/skill.ts` |
| [MCP](mcp/) | All MCP tools, request flow, agent scope enforcement | `supabase/functions/mcp-server/index.ts` |
| [CLI](cli/) | Command structure, API client, auth flow | `cli/src/index.ts`, `cli/src/lib/api.ts` |
| [Desktop](desktop/) | macOS Tauri app — minimal PTY wrapper around `astar todo --monitor` | `app/src-tauri/src/`, `app/src/main.ts` |
| [ETF](etf/) | Simulated portfolios, Yahoo Finance prices, NAV, benchmark | `cli/src/commands/etf.ts`, `supabase/functions/skills-api/index.ts` |
| [Overtime](overtime/) | Overnight U-Agent/E-Agent system, spec format, done detection | `cli/src/commands/overtime.ts` |

## How to maintain

When committing changes that affect a subsystem's behavior, data model, or API surface — update the corresponding wiki page. The post-commit hook will remind you.

Pages should describe **how things work**, not duplicate code. Focus on:
- Data model (tables, fields, relationships)
- Flow (what happens when X is called)
- Decisions (why it works this way)
- Gotchas (non-obvious behavior)
