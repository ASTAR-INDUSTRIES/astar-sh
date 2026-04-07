# astar.sh

Internal platform for Astar Consulting — task management, agent orchestration, intelligence briefings, skill sharing, and AI-powered tooling.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ASTAR-INDUSTRIES/astar-sh/main/cli/install.sh | bash
astar login   # requires @astarconsulting.no Microsoft account
```

## Commands

### Tasks

```
astar todo "title" [-p high] [-d 2026-04-06] [-a email] [--parent 21] [--event nmai-2026]
astar todo done <number>
astar todo info <number>
astar todo mine                   Your open tasks
astar todo team                   All tasks grouped by assignee
astar todo list [--status open]   Filter tasks
astar todo --event nmai-2026      Show your tasks for one event
astar todo --monitor              Live task dashboard (10s refresh)
astar todo velocity               Completion stats
astar todo next                   AI-suggested next task
astar todo triage                 Review agent-created tasks
astar todo accept/dismiss <n>     Accept or dismiss agent tasks
astar todo link <n> --url <url>   Link tasks to skills, URLs, feedback
```

### Events

```
astar events                      List events
astar events "NM i AI 2026" --goal "..." --type arranged
astar events info nmai-2026       Show event details + linked tasks
astar events update nmai-2026 --status confirmed --date 2026-06-12
```

### Agents

```
astar agent list                  List registered agents
astar agent info <slug>           Agent details + activity
astar agent hire <slug>           One-command onboarding (register, auth, workstation, heartbeat)
astar agent login <slug>          Authenticate agent Microsoft account
astar agent start/stop <slug>     Control heartbeat via launchctl
astar agent pause/resume <slug>   Temporarily suspend an agent
astar agent retire <slug>         Permanently decommission
astar agent logs <slug>           Agent audit trail
astar agent --monitor             Live agent operations dashboard
astar ask <agent> "message"       Send a message to any agent
```

### Skills

```
astar skill list                  Browse available skills
astar skill search <query>        Search by title, description, or tag
astar skill info <slug>           Detailed view with preview
astar skill install <slug>        Install into .claude/skills/<slug>/
astar skill remove <slug>         Remove locally
astar skill installed             Show what's installed
astar skill diff <slug>           Show local vs remote changes
astar skill update [slug]         Update installed skill(s)
astar skill init                  Scaffold a new skill
astar skill push <slug>           Publish to astar.sh
```

### News & Intelligence

```
astar news list                   Browse intelligence briefings
astar news info <slug>            Full article with source perspectives
```

### Operations

```
astar status                      Personal dashboard — activity, tasks, streak
astar status --full               Breakdown bars + team leaderboard
astar audit [--today] [--actor x] Query audit trail
astar health [--extended] [--fix] System diagnostics
astar feedback "message"          Submit feedback (bug/feature/pain/praise)
astar shipped "title"             Log a shipped milestone
astar hours log/ask/check         Financial inquiry queue
astar changelog                   Recent CLI changes
astar update                      Self-update
```

## MCP Integration

57 MCP tools are available through the `astar-platform` skill, giving Claude Code direct access to tasks, events, agents, news, feedback, skills, audit, and more.

```bash
astar skill install astar-platform   # auto-installed on first login
```

## Architecture

| Component | Stack | Purpose |
|-----------|-------|---------|
| Dashboard | React + Vite + shadcn/ui | Live dashboard, news feed, activity heatmap |
| CLI | Bun + Commander | Task management, agent ops, skill package manager |
| API | Supabase Edge Functions (Hono) | REST endpoints for all platform entities |
| MCP Server | Supabase Edge Function | 38-tool Claude Code integration |
| CMS | Sanity | Skills, news articles, research content |
| Auth | Microsoft Entra ID (MSAL) | SSO with 90-day token persistence |
| Agents | launchd + MSAL per-agent auth | Non-human employee workstations at `~/.astar/agents/` |
| Audit | `audit_events` table | Event sourcing for all mutations (who, what, when, how, why) |

## Development

```bash
bun install && bun run dev           # website
cd cli && bun install                # CLI
bun run src/index.ts --help          # test CLI locally
```
