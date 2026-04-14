# Overtime — Overnight Agent System

## What it is

`astar overtime` spawns two local Claude agents that work through the night on your behalf. You write a spec, they implement and review it. In the morning you get a branch with commits and a detailed review trail.

## The two agents

**U-Agent (implementer)** — picks up requirements one by one, writes code, commits, and marks subtasks complete.

**E-Agent (reviewer)** — reviews U-Agent's work against the spec. Approves (LGTM) or rejects with specific feedback. Rejected work goes back to U-Agent. E-Agent does a comprehensive final sign-off before marking the job done.

They never talk directly. The astar.sh task queue is the protocol — task comments are the wire.

## Writing a good spec

Specs live in `.astar/overtime/*.md` in any project repo. The filename becomes the slug.

```markdown
# Title Goes Here

overtime: dev

Freetext context goes here. Write it like a note to yourself before
leaving work. Explain what you noticed, what's broken, what direction
to go. The more context, the better the agents perform.

## Requirements
- [ ] Each checkbox becomes a subtask
- [ ] Be specific — "handle concurrent JWT refresh" not "fix auth"
- [ ] One testable outcome per line
- [ ] Order matters — agents work top to bottom

## Notes
Constraints go here. What NOT to touch. What to be careful about.
External dependencies. Anything that prevents the agent from going
off in the wrong direction.
```

### Tips for effective specs

**Be specific, not vague:**
- Bad: `- [ ] Improve error handling`
- Good: `- [ ] Return RFC 7807 problem details on all 4xx/5xx responses`

**One verifiable outcome per requirement:**
- Bad: `- [ ] Refactor and clean up the auth module`
- Good: `- [ ] Extract token refresh into a standalone function with its own tests`

**Include enough context:**
The agents don't know what you were thinking. The freetext section above requirements is their only window into your intent. Tell them:
- What you observed before leaving
- What you suspect the root cause is
- Which files or functions are involved
- What "done" looks like

**Use Notes to set boundaries:**
The agents will follow instructions in Notes strictly. Use this to:
- Prevent them from touching unrelated code
- Specify which test framework to use
- Flag files that are off-limits (e.g., "Don't modify the OAuth flow")
- Set scope ("Only the CLI, not the API server")

**Right-size your requirements:**
- Too small (10 min each): agents spend more time polling than working
- Too big (multi-hour each): harder to review, higher chance of rejection loops
- Sweet spot: 30-90 minutes of focused work per requirement

## Context files

Some facts can't be inferred from the code: which service user runs the process, how to trigger a rolling restart, the test command that hits a real database, file paths that differ per environment. Put these in a context file alongside your spec.

**Two locations are checked (slug-specific takes precedence):**

```
.astar/overtime/context.md               # shared by all specs in this repo
.astar/overtime/<slug>-context.md        # specific to one spec
```

When either file exists, its content is injected verbatim into both U-Agent and E-Agent prompts as an `ENVIRONMENT CONTEXT` block before the task description.

**Example `.astar/overtime/auth-hardening-context.md`:**

```
Service user: www-data (no sudo).
Deployment: Kubernetes — restart via `kubectl rollout restart deploy/auth-svc`.
Config lives at /etc/myapp/config.yaml (read-only at runtime).
Test command: make test-integration (requires DB_URL env var).
Do not modify the migration files — a separate DBA process owns those.
```

Context files are freetext — write them like a handoff note. The agents read them as given facts, not instructions.

## The overtime type field

The `overtime:` line sets the work type. Currently just metadata, but useful for filtering and understanding what kind of work the agents are doing:

- `dev` — feature implementation, bug fixes, refactoring
- `ops` — infrastructure, CI/CD, deployment configs
- `docs` — documentation, READMEs, wiki pages
- `test` — test coverage, test infrastructure

## CLI commands

```bash
astar overtime start              # start all specs in .astar/overtime/
astar overtime start --file auth  # start only auth.md
astar overtime status             # check what's running and progress
astar overtime status --verbose   # + last cycle cost/turns/model
astar overtime recap              # morning summary with full activity
astar overtime stop               # kill running agents
astar overtime stop --clean       # kill + remove git worktrees
astar overtime stats              # compare all runs: cost, subtasks, rejections
astar overtime stats <id>         # per-cycle breakdown for one run
astar overtime stats <id> --cycles  # tokens in/out split per cycle
astar overtime dashboard          # aggregate spend, efficiency, 7-day trend
astar overtime guide              # best practices for writing specs
```

## How it works internally

```
astar overtime start
  │
  ├─ Parse .astar/overtime/*.md
  ├─ Create parent task + subtasks on astar.sh (idempotent)
  ├─ Create git worktree: .astar/worktrees/overtime-<slug>
  ├─ Spawn U-Agent (bash loop → claude -p → sleep 3m → repeat)
  └─ Spawn E-Agent (5m delay → bash loop → claude -p → sleep 3m → repeat)

U-Agent cycle:
  1. Read task from astar.sh
  2. Find first open subtask
  3. Mark in_progress
  4. Implement, test, commit
  5. Comment on task with what changed
  6. Mark completed
  7. Exit → sleep 3m → next cycle

E-Agent cycle:
  1. Read task from astar.sh
  2. Find completed subtasks without LGTM
  3. Review: git diff, run tests, verify requirement met
  4. LGTM or reject (reopen + specific feedback)
  5. When ALL subtasks have LGTM → comprehensive final review:
     - Full branch diff review
     - Full test suite
     - Each requirement verified individually
     - Side effect check
     - Security check
     - Clean commit check
  6. Sign-off report → mark parent completed → touch done file
  7. Done file stops both agents
```

## Agent identity

Each overtime session gives both agents a session-scoped identity:

- **U-Agent**: `u-agent:<slug>` (e.g. `u-agent:auth-hardening`)
- **E-Agent**: `e-agent:<slug>` (e.g. `e-agent:auth-hardening`)

These are not registered agents — they're ephemeral string identifiers for one session.

**Tasks**: parent task and subtasks are `assigned_to: u-agent:<slug>` so task ownership reflects the agent, not the human.

**Audit trail**: When agents call `comment_task` or `update_task` via MCP, they pass `agent_id` in the call. The mcp-server stores this as `actor_agent_id` in the audit event. The `astar overtime recap` display shows the agent ID (e.g. `u-agent:auth-hardening`) instead of the human email when `actor_agent_id` is set.

The human's MS token is still used for authentication — access control is unchanged. The agent ID is purely an audit annotation.

## State management

No local state files beyond PIDs. astar.sh is the source of truth.

- **Tasks**: parent task `[overtime] Title` with subtask per requirement
- **PIDs**: `.astar/overtime/pids.json` tracks running processes (includes `uAgentId`, `eAgentId`)
- **Done signal**: `.astar/overtime/.done-<slug>` stops both loops
- **Logs**: `.astar/overtime/logs/<slug>.log`
- **Code**: `.astar/worktrees/overtime-<slug>` (git worktree)

Running `astar overtime start` twice is safe — it checks for existing tasks and running PIDs.

## After overnight

1. Run `astar overtime recap` to see results
2. Check the branch: `cd .astar/worktrees/overtime-<slug> && git log`
3. Review the diff: `git diff main...overtime/<slug>`
4. If happy, merge the branch or cherry-pick commits
5. Clean up: `astar overtime stop --clean`

## Telemetry

Each overnight run writes a persistent record to `overtime_runs` on astar.sh. The record is created when `astar overtime start` launches agents and updated when the session finishes (stop/done/failed).

### `overtime_runs` table

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `slug` | text | Spec slug (e.g. `auth-hardening`) |
| `spec_title` | text | Title from the spec file |
| `type` | text | `dev` / `ops` / `docs` / `test` |
| `parent_task_number` | integer | astar.sh task number |
| `started_at` | timestamptz | Session start time |
| `completed_at` | timestamptz | Session end time (null while running) |
| `status` | text | `running` / `done` / `failed` / `stopped` |
| `total_cycles_u` | integer | Total U-Agent cycles run |
| `total_cycles_e` | integer | Total E-Agent cycles run |
| `total_rejections` | integer | Subtasks sent back to open by E-Agent |
| `total_cost_usd` | numeric | Total USD spent across all cycles |
| `model` | text | Claude model used (from last cycle) |
| `worktree_path` | text | Absolute path to the git worktree |
| `branch_name` | text | Git branch name |
| `git_commits` | text[] | All commit hashes made during the run |

### `overtime_cycles` table

Each individual agent invocation writes one row here. Together with `overtime_runs` this gives full per-cycle visibility.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `run_id` | uuid | FK → `overtime_runs.id` (cascade delete) |
| `agent` | text | `u` (U-Agent) or `e` (E-Agent) |
| `cycle_number` | integer | 1-based cycle counter per run per agent |
| `started_at` | timestamptz | Cycle start time |
| `completed_at` | timestamptz | Cycle end time (null if still running) |
| `exit_code` | integer | claude CLI exit code |
| `subtask_number` | integer | Task number worked on this cycle (null if idle) |
| `action_taken` | text | `implemented` / `reviewed` / `approved` / `rejected` / `idle` |
| `tokens_in` | integer | Input tokens consumed |
| `tokens_out` | integer | Output tokens generated |
| `cost_usd` | numeric | Estimated USD cost for this cycle |
| `model` | text | Claude model used (e.g. `claude-sonnet-4-6`) |
| `tool_calls_count` | integer | Number of tool calls made |
| `turns_used` | integer | Turns consumed out of max |
| `max_turns` | integer | Max turns configured for this cycle |

### Run finalization

When a run ends — either via `astar overtime stop` or organically when E-Agent creates the done file — the CLI finalizes the run record with:

- `status`: `done` (done file existed) or `stopped` (manually killed)
- `completed_at`: timestamp of finalization
- `total_cycles_u` / `total_cycles_e`: counted from `overtime_cycles` records
- `total_cost_usd`: summed from cycle `cost_usd` values
- `total_rejections`: counted from `audit_events` via `GET /overtime/runs/:id/rejections`
- `git_commits`: all commit hashes on the branch since `main`

### Rejection counting

`total_rejections` measures how many times E-Agent sent a subtask back to open. The pattern: E-Agent calls PATCH /tasks/:number with `{ status: "open" }` on a subtask that was previously "completed". This generates an `audit_events` row with `action="updated"`, `state_before.status="completed"`, `state_after.status="open"`.

The `GET /overtime/runs/:id/rejections` endpoint reconstructs this count at finalization time by:
1. Looking up the run's `parent_task_number`
2. Finding all subtasks of that parent task
3. Querying `audit_events` for the completed→open pattern across all those subtask numbers

Both the TypeScript `stop` command and the bash E-Agent done-path use this endpoint, so `total_rejections` is accurate regardless of which path ends the run.

## Limitations (v1)

- Runs on the machine that starts it — laptop must stay on
- Agents share one worktree — no parallel subtask work
- No cost cap — agents loop until done or stopped
- MCP tools must be configured in the active Claude session
