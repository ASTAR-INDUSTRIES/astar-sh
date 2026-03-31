# astar.sh

Internal platform for Astar Consulting — skills, knowledge sharing, and AI-powered tooling.

## CLI

The `astar` CLI is a skill package manager for Claude Code. Install skills from astar.sh directly into your project's `.claude/skills/` directory.

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/ASTAR-INDUSTRIES/astar-sh/main/cli/install.sh | bash
```

### Authenticate

```bash
astar login
```

Requires an `@astarconsulting.no` Microsoft account.

### Commands

```
astar skill list              Browse available skills
astar skill search <query>    Search by title, description, or tag
astar skill info <slug>       Detailed view with preview
astar skill install <slug>    Install into .claude/skills/<slug>/
astar skill remove <slug>     Remove locally
astar skill installed         Show what's installed
astar skill diff <slug>       Show changes between local and remote
astar skill update [slug]     Update installed skill(s)
astar skill init              Scaffold a new skill
astar skill push <slug>       Publish to astar.sh
astar update                  Update the CLI itself
```

### Create and share a skill

```bash
astar skill init                      # scaffold
# edit .claude/skills/<slug>/SKILL.md
astar skill push <slug> --publish     # share with the team
```

## Architecture

| Component | Stack | Purpose |
|-----------|-------|---------|
| Website | React + Vite + shadcn/ui | Dashboard, skill browser, activity feed |
| CLI | Bun + Commander | Skill package manager |
| API | Supabase Edge Functions (Hono) | REST endpoints for skills |
| MCP Server | Supabase Edge Function | Claude Code integration |
| CMS | Sanity | Skills, news, research content |
| Auth | Microsoft Entra ID | SSO for astarconsulting.no |

## Development

```bash
# Website
bun install
bun run dev

# CLI (from repo root)
cd cli && bun install
bun run src/index.ts skill list
```
