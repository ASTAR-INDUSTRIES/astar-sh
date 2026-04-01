# Astar Platform Context

You are working on astar.sh — the internal platform for Astar Consulting (astarconsulting.no). This skill gives you full context on the architecture, conventions, and purpose of every component.

## When to Use

Activate this skill when:
- Working on any file in this repository
- Asked to build new features, fix bugs, or review code
- Needing to understand how components connect
- Making decisions about where code should live (CLI vs MCP vs API vs frontend)

## Platform Overview

Astar.sh is a nexus for Astar Consulting's engineering team. It has four layers:

1. **CLI** (`astar`) — local tool for colleagues. Install skills, browse news, manage sessions.
2. **MCP Server** — Claude Code integration. Rich content creation, CRUD operations, accessed through Claude conversations.
3. **REST API** — serves both CLI and dashboard. Supabase Edge Functions on Hono.
4. **Dashboard** — ambient display at astar.sh. Skills, news, tweets, CLI activity, milestone calendar.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   CLI (Bun)     │────>│  skills-api      │<────│  Dashboard  │
│   ~/.local/bin  │     │  (Hono/Deno)     │     │  (React)    │
└─────────────────┘     └────────┬─────────┘     └──────┬──────┘
                                 │                       │
┌─────────────────┐     ┌────────┴─────────┐            │
│  MCP Server     │────>│  Sanity CMS      │<───────────┘
│  (Hono/Deno)    │     │  (Content)       │
└─────────────────┘     └──────────────────┘
                        ┌──────────────────┐
                        │  Supabase        │
                        │  (Auth, Events,  │
                        │   Milestones)    │
                        └──────────────────┘
```

## Directory Structure

```
cli/                        # Bun CLI — installed via curl script
  src/
    index.ts                # Entry point, registers all commands
    commands/
      auth.ts               # login, logout, whoami
      skill.ts              # 10 skill commands (list, install, diff, etc.)
      news.ts               # news list, news info
      update.ts             # self-update + auto-check
    lib/
      api.ts                # AstarAPI class — REST client for skills-api
      auth.ts               # Microsoft MSAL device code flow + token refresh
      config.ts             # ~/.astar/ config and auth cache
      diff.ts               # LCS diff algorithm + terminal renderer
      manifest.ts           # Skill versioning metadata
      ui.ts                 # ANSI colors, table renderer, badges
  install.sh                # One-liner installer

supabase/functions/
  skills-api/index.ts       # REST API: /skills, /news endpoints
  mcp-server/index.ts       # MCP JSON-RPC: skills CRUD, news CRUD, tweets, stats
  microsoft-auth/index.ts   # OAuth callback for Microsoft SSO

src/                        # React dashboard (Vite + shadcn/ui)
  components/
    PublicDashboard.tsx      # Main ambient display
    ShippedCalendar.tsx      # Milestone calendar
    StaffWorkspace.tsx       # Admin workspace
  lib/
    sanity.ts               # Sanity client (projectId: fkqm34od)
  integrations/supabase/    # Supabase client + types
```

## Data Flow

### Skills
- **Create**: MCP `create_skill` → Sanity `knowledgeSkill` document
- **Install**: CLI `astar skill install` → REST `GET /skills/:slug` → writes `.claude/skills/<slug>/SKILL.md` + `references/` + `manifest.json`
- **Push**: CLI `astar skill push` → REST `POST /skills` → Sanity
- **Display**: Dashboard queries Sanity directly

### News
- **Create**: MCP `create_news` or REST `POST /news` → Sanity `newsPost` document
- **Browse**: CLI `astar news` → REST `GET /news`
- **Display**: Dashboard queries Sanity, click opens Dialog modal with full briefing
- **Schema**: title, excerpt, content, category, coverImage, sources[], consensus[], divergence[], takeaway

### Events
- Supabase `cli_events` table tracks skill downloads, list views, logins, news publishes
- Dashboard subscribes to realtime changes
- Download counts aggregated in `GET /skills` response

## Conventions

### CLI
- Zero extra dependencies beyond commander + @azure/msal-node
- All terminal output uses `c.*` ANSI helpers from `ui.ts`
- Read-only commands (list, search, info) don't require auth
- Write commands (install, push, update) require Microsoft auth
- Styled with `table()` for lists, dim/cyan/green for status

### API (skills-api)
- Hono framework on Deno (Supabase Edge Functions)
- CORS headers on all responses
- Auth via `validateMsToken()` for write operations
- GROQ queries to Sanity, enrichment from Supabase cli_events
- Response wrappers: `{ skills: [...] }`, `{ skill: {...} }`, `{ news: [...] }`, `{ article: {...} }`

### MCP Server
- OAuth with Microsoft via device code or redirect flow
- MCP JSON-RPC protocol (tools/list, tools/call)
- Sanity mutations via `sanityMutate([{ createOrReplace: doc }])`
- Document IDs: `knowledgeSkill-{slug}`, `newsPost-{slug}`
- Slug stored as `{ _type: "slug", current: string }`

### Frontend
- React + Vite + shadcn/ui + Tailwind
- Sanity client with `useCdn: true` (cache delay up to 60s)
- React Query for data fetching with refetchInterval
- Supabase realtime for CLI events
- Monospace font throughout, ambient display aesthetic

### News Content
- Factual titles only — no clickbait
- Multi-source: minimum 3 sources from different regions
- Include consensus (where sources agree) and divergence (where they disagree)
- Astar-specific takeaway for every briefing
- Verify recency (48h window) and dedup against existing posts

## Auth
- Microsoft Entra ID, tenant: astarconsulting.no
- CLI: device code flow with MSAL, tokens cached in ~/.astar/
- MCP: OAuth redirect flow, sessions in Supabase mcp_sessions table
- Dashboard: Supabase auth via microsoft-auth callback function
- All gates restricted to @astarconsulting.no accounts
