# Changelog

All notable changes to astar.sh are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)

## [Unreleased]

## [0.0.58] - 2026-04-06

## [0.0.57] - 2026-04-06

## [0.0.56] - 2026-04-06

## [0.0.55] - 2026-04-06

## [0.0.54] - 2026-04-06

## [0.0.53] - 2026-04-06

## [0.0.52] - 2026-04-06

## [0.0.51] - 2026-04-06

## [0.0.50] - 2026-04-06

## [0.0.49] - 2026-04-06

## [0.0.48] - 2026-04-06

## [0.0.47] - 2026-04-06

## [0.0.46] - 2026-04-06
### Added
- `astar etf ASTX --monitor` — live-updating single-fund dashboard with NAV, holdings with ▲/▼ arrows, prices, changes, SPY alpha, and linked news headlines (30s refresh)
- `astar etf --monitor` — live overview dashboard of all active ETF funds with NAV, daily and cumulative returns
- `astar etf ASTX` — ticker shorthand now routes directly to fund detail (same as `astar etf info ASTX`)
- `ctrl+o` toggle between compact (NAV + holdings) and expanded (+ news + strategy) in ETF monitor
- `ctrl+c` clean exit from ETF monitor

## [0.0.45] - 2026-04-06
### Added
- SPY (S&P 500) benchmark tracking — automatically fetched alongside ETF holdings for alpha comparison
- Alpha calculation displayed in `astar etf info` and monitor views (fund cumulative return vs SPY)
- SPY cumulative return timeline in `astar etf performance` for side-by-side comparison
- 6 MCP tools: `list_etf`, `get_etf`, `create_etf`, `update_etf`, `rebalance_etf`, `refresh_etf_prices`
- ETF wiki page documenting data model, NAV calculation, and price fetching strategy

### Changed
- Price engine now fetches 1 month of daily data (was 5 days) — recovers from multi-day gaps automatically
- NAV calculated for all missing trading days since inception (was today-only) — handles weekends and downtime
- Price fetch errors reported per-symbol in API response instead of failing silently

## [0.0.44] - 2026-04-06
### Added
- Simulated ETF portfolio system — create, track, and analyze paper ETF funds
- `astar etf list/info/performance/news/refresh` CLI commands
- ASTX (ASTAR Space ETF) seeded with 12 space economy holdings (RKLB, ASTS, PL, LUNR, KTOS, IRDM, RDW, SATS, GSAT, VSAT, MNTS, BKSY)
- Yahoo Finance price fetching with weighted daily NAV calculation (base NAV 100, compounding)
- Auto-linked news: articles with entities matching ETF holding names/domains surface automatically via GROQ query
- 8 REST API endpoints: list funds, fund detail, performance history, linked news, create fund, update fund, rebalance holdings, refresh prices
- 4 new Supabase tables: `etf_funds`, `etf_holdings`, `etf_prices`, `etf_performance`

## [0.0.43] - 2026-04-06
### Fixed
- `astar todo info` crash — was referencing `actor` and `created_at` fields but audit_events uses `actor_email` and `timestamp`
- Activity log now shows audit `reason` from context when present

## [0.0.42] - 2026-04-06
### Added
- `astar todo --monitor` highlights your own tasks in bold white (others stay dim)
- `astar todo mine --monitor` — live-updating view filtered to your tasks only, with header "MY TASKS"

## [0.0.41] - 2026-04-06
### Added
- Wiki structure with subsystem documentation: auth, agents, tasks, audit, news, skills, mcp, cli
- `wiki/index.md` master index linking all subsystem pages
- Post-commit Claude Code hook reminding to check wiki updates when committing

## [0.0.40] - 2026-04-06

## [0.0.39] - 2026-04-06

## [0.0.38] - 2026-04-06

## [0.0.37] - 2026-04-06
### Added
- Subtask hierarchy in monitor view — subtasks shown indented under parent tasks with progress indicators `[done/total]`
- Subtask display in task table (`mine`, `list`, `team`) with tree-style `└` indentation
- `include_subtasks` API parameter for fetching task hierarchy in a single request

## [0.0.36] - 2026-04-05
### Added
- Daily beat circuit breaker — agents auto-stop after 100 beats/day (configurable via `--max-beats`)

## [0.0.35] - 2026-04-05
### Changed
- `astar ask` now returns instantly (fire-and-forget) instead of polling for response

## [0.0.34] - 2026-04-05
### Fixed
- Agent monitor rendering — single buffered write eliminates flicker

## [0.0.33] - 2026-04-05
### Changed
- Agent monitor rewritten to use inbox-based activity feed

## [0.0.32] - 2026-04-05
### Fixed
- Agent monitor flicker + `claude` not found in PATH

## [0.0.31] - 2026-04-05
### Added
- `astar agent --monitor` — live agent operations dashboard with status rows, inbox stats, and activity feed
- `ctrl+o` toggle to expand/collapse activity feed

## [0.0.30] - 2026-04-05
### Added
- `--dangerously-skip-permissions` flag for agent heartbeat

## [0.0.29] - 2026-04-05
### Added
- `--skip-auth` flag for `astar agent hire`

## [0.0.28] - 2026-04-05
### Added
- Per-agent auth: `ASTAR_AGENT` env var routes CLI to agent-specific MSAL/auth caches
- `astar agent login <slug>` — authenticate an agent's Microsoft account
- `astar agent hire <slug>` — one-command onboarding: register, auth, workstation, launchd heartbeat
- `astar agent start/stop <slug>` — control agent heartbeat via launchctl
- Agent workstation dirs at `~/.astar/agents/<slug>/` with MEMORY.md, run.sh, auth

## [0.0.27] - 2026-04-05
### Added
- Task visibility control (`private`, `team`, `public`) with RLS enforcement
- `state_before` captured on task update/complete audit events for full change diffs
- Optional `reason` parameter on task mutation MCP tools for audit accountability

### Fixed
- Audit events now correctly record `actor_type: "agent"` when MCP tools are called by agents

## [0.0.26] - 2026-04-05
### Fixed
- `astar todo --monitor` no longer shows 0 tasks when token expires — keeps last known state, shows warning
- Monitor now refreshes auth token each cycle instead of reusing stale token

## [0.0.25] - 2026-04-04
### Added
- Scope enforcement on MCP tools — agents can only call tools matching their scopes
- Denied tool calls logged to audit with `scope_denied` action

## [0.0.24] - 2026-04-04
### Added
- `agent_inbox` table — unified message queue for all agents
- `astar ask <agent> "message"` — talk to any registered agent
- Type inference: questions poll for response, actions fire-and-forget
- `ask_agent`, `list_inbox`, `read_inbox`, `respond_inbox` MCP tools
- `POST/GET/PATCH /ask/:agent_slug` API endpoints

### Changed
- `astar hours` now uses generalized inbox (same UX, new backend)

## [0.0.23] - 2026-04-04
### Added
- `astar todo --monitor` now shows task descriptions (expanded by default)
- `ctrl+o` toggle to expand/collapse descriptions in monitor view

## [0.0.22] - 2026-04-04
### Fixed
- Todo monitor uses full terminal width for task titles

## [0.0.21] - 2026-04-04
### Added
- `astar todo --monitor` — live-updating task view with priority color bars, auto-refreshes every 10s

## [0.0.20] - 2026-04-04
### Added
- Server-side news quality validation (title max 80 chars, 2+ sources, consensus required, entities required)
- Published hardened ai-news-briefing skill to Sanity with strict quality rules

### Changed
- create_news MCP tool now rejects articles missing consensus, entities, or with titles over 80 chars

## [0.0.19] - 2026-04-03
### Added
- Agent registry: `agents` table for tracking non-human employees
- `astar agent list/info/register/pause/resume/retire/logs` commands
- Heartbeat endpoint for agent liveness monitoring (returns status + scopes)
- `list_agents`, `get_agent`, `register_agent` MCP tools
- API: POST/GET/PATCH /agents + POST /agents/:slug/heartbeat

## [0.0.18] - 2026-04-03
### Added
- `astar feedback close <id>` — mark feedback as done with optional resolution
- `astar feedback reject <id>` — mark feedback as not relevant
- `PATCH /feedback/:id` API endpoint for status updates
- `update_feedback` MCP tool

## [0.0.17] - 2026-04-03
### Added
- `astar status` — personal weekly report card with activity bars, streak, tasks, leaderboard
- `astar status --full` — adds breakdown bars and team leaderboard
- `astar status --json` — machine-readable output
- `GET /status` API endpoint with aggregated personal stats

## [0.0.16] - 2026-04-03
### Added
- Install and update tracking via `/ping` endpoint (no auth, logs to audit_events)
- `astar changelog` command to view recent changes
- CHANGELOG.md auto-versioned by pre-commit hook

## [0.0.15] - 2026-04-03
### Fixed
- Health always checks CLI version (not just in `--extended` mode)

## [0.0.14] - 2026-04-03
### Added
- Base skill rewrite with full system coverage (38 MCP tools, all CLI commands)
- Behavioral inference rules for hours logging, task creation, news, feedback, milestones
- Claude now infers project from context when logging hours

### Fixed
- Health `--fix` correctly detects hash mismatch in base skill

## [0.0.12] - 2026-04-03
### Added
- Company logos on news articles via Clearbit API (`entities[]` with name + domain)
- Article continuations (`continues` field linking follow-up stories)
- Dashboard news list shows primary entity logo
- Detail modal shows all entity logos + continuation badge

## [0.0.9] - 2026-04-03
### Added
- `astar health` command — system diagnostic
- `--extended` flag for global skills, API, CFA checks
- `--json` flag for machine-readable output
- `--fix` flag to auto-repair missing/corrupted skills
- Exit codes: 0=healthy, 1=warning, 2=critical
- SHA-256 content integrity hashing for installed skills

### Fixed
- Health auto-refreshes expired auth tokens silently
- API health check uses `/audit` endpoint (root path returns 404)

## [0.0.8] - 2026-04-02
### Added
- Unified audit system — event sourcing for all mutations
- `audit_events` table replaces `cli_events` + `task_activity`
- Every action captures: who, what, when, how (channel), why (context)
- `astar audit` command with filters (`--entity`, `--actor`, `--channel`, `--today`)
- `query_audit` MCP tool for tracing event chains
- Dashboard CLI Activity panel shows channel badges (cli/mcp)

### Removed
- Direct writes to `cli_events` and `task_activity` tables (replaced by `audit_events`)

## [0.0.7] - 2026-04-02
### Added
- Auto version bump pre-commit hook (bumps `0.0.x` on every commit)
- `.claude/skills` and `.claude/worktrees` added to `.gitignore`

## [0.0.6] - 2026-04-02
### Added
- [TODO Phase 3] Velocity tracking and priority intelligence
- `astar todo velocity` — completion stats (completed, created, avg days to close)
- `astar todo next` — ranked priority suggestion with score and reasoning
- `get_velocity` and `suggest_next_task` MCP tools
- Full-text search via tsvector on tasks
- Auto-archival endpoints for old completed/cancelled tasks

## [0.0.5] - 2026-04-02
### Added
- [TODO Phase 2] Subtasks, polymorphic links, agent triage, recurring tasks
- `parent_task_id` for subtask hierarchy
- `task_links` junction table connecting tasks to skills, news, feedback, URLs
- Agent triage queue with confidence scores (`astar todo triage/accept/dismiss`)
- Recurring tasks (`--recurring weekly|monthly|quarterly`)
- `estimated_hours` field
- Bidirectional link effects (completing task closes linked feedback, creates milestone)
- Subtask completion guard (warns before completing parent with open subtasks)

## [0.0.4] - 2026-04-02
### Added
- [TODO Phase 1] Core task system
- `tasks` table with auto-incrementing `task_number` (user-facing IDs: #1, #2, #3)
- `task_activity` append-only audit log
- `astar todo` — create, done, info, assign, mine, team, list, search
- 6 MCP tools: `create_task`, `update_task`, `complete_task`, `list_tasks`, `get_task`, `comment_task`
- Tasks count on dashboard summary

## [0.0.3] - 2026-04-02
### Fixed
- Hours UX: CFA health check before submitting, 30s timeout (was 2min)
- Skip polling when CFA is offline — queue immediately with message
- Show CFA offline warning with pending count in `astar hours check`

## [0.0.2] - 2026-04-01
### Added
- [PHASE 3.5] CLI UX polish
- Branded dashboard on `astar` with no args (skills, news, tasks, feedback counts)
- Rich `astar whoami` (session status, skills count, version)
- `astar skill` defaults to list (consistency with other commands)
- Dashboard shows version near clock
- CLAUDE.md with versioning rules

### Fixed
- Friendly 404 errors ("feature not deployed yet" instead of raw HTTP codes)
- Friendly 401 errors ("session expired" instead of raw status)

## [0.0.1] - 2026-04-01
### Added
- CLI from scratch (Bun + Commander) with one-liner install script
- Microsoft SSO with device code flow + 90-day token persistence via MSAL cache
- Skill package manager: list, search, info, install, remove, push, update, diff, init, installed
- Skill versioning with manifest.json + LCS diff engine (zero deps)
- `--global` flag for machine-wide skill installs
- Auto-install `astar-platform` base skill on first login (Y/n prompt)
- News intelligence system: multi-source briefings with sources[], consensus[], divergence[], takeaway
- News detail modal on dashboard with source perspectives and region badges
- `astar news list` and `astar news info` CLI commands
- Feedback system: `astar feedback "message"` with type (bug/feature/pain/praise)
- Shipped calendar write path: `astar shipped "title"` with categories
- Financial inquiry queue for CFA agent: `astar hours log/ask/check/month`
- CFA health check with offline detection and queue status
- `astar update` with self-update via git pull + auto-check once daily
- 20+ MCP tools for skills, news, tweets, feedback, milestones, inquiries
- README with install instructions and architecture overview
- Public repo on GitHub (ASTAR-INDUSTRIES/astar-sh)
