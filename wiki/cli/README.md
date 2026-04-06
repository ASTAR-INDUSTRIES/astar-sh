# CLI

Bun + Commander CLI with 14 command groups.

## Structure

Root program in `cli/src/index.ts`. Each command module exports a `registerXxxCommands(program)` function:

| Module | Commands |
|--------|----------|
| auth | login, logout, whoami |
| skill | list, search, info, install, remove, installed, diff, update, init, push |
| news | list, info |
| feedback | submit, list, close, reject |
| shipped | log milestone, browse calendar |
| hours | log, ask, check, month (CFA agent queue) |
| todo | create, done, info, assign, mine, team, list, triage, accept, dismiss, link, velocity, next, --monitor |
| audit | query with filters |
| agent | list, info, register, pause, resume, retire, logs, login, hire, start, stop, --monitor |
| ask | send message to any agent |
| health | system diagnostics, --extended, --fix |
| status | personal dashboard, --full, --json |
| changelog | show recent CLI changes |
| update | self-update via git pull |

## API client

`AstarAPI` class in `cli/src/lib/api.ts`:
- Constructor takes auth token
- Private `fetch<T>(path)` method handles auth header, error wrapping
- 401 → "Session expired", 404 → "Feature not available"
- Base URL: `https://owerciqeeelwrqseajqq.supabase.co/functions/v1/skills-api`

## Dashboard

Running `astar` with no args shows a branded dashboard:
- User info, skill count, news count, installed skills
- Task summary, feedback count
- Version display

## Monitor views

Two live-updating TUI dashboards:
- `astar todo --monitor` — task list with priority color bars, subtask tree, 10s refresh
- `astar agent --monitor` — agent status rows, inbox stats, activity feed

Both support `ctrl+o` to expand/collapse details and `ctrl+c` to exit.

## Config

- `~/.astar/config.json` — user preferences
- `~/.astar/auth.json` — auth tokens
- `~/.astar/agents/<slug>/` — per-agent workstations

## Key files

- `cli/src/index.ts` — entry point, version constant, dashboard
- `cli/src/lib/api.ts` — API client class
- `cli/src/lib/auth.ts` — auth helpers
- `cli/src/lib/ui.ts` — terminal colors, table renderer
- `cli/src/commands/*.ts` — 14 command modules
