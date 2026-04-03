# Changelog

All notable changes to astar.sh are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)

## [Unreleased]

## [0.0.15] - 2026-04-03

## [0.0.14] - 2026-04-03
### Added
- Base skill rewrite with full system coverage (38 MCP tools, all CLI commands)
- Behavioral inference rules for hours logging, task creation, news, feedback, milestones
- Claude now infers project from context when logging hours

### Fixed
- Health `--fix` correctly detects hash mismatch in base skill
- Health always checks CLI version (not just in `--extended` mode)

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
