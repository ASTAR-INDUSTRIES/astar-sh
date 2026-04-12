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
astar overtime recap              # morning summary with full activity
astar overtime stop               # kill running agents
astar overtime stop --clean       # kill + remove git worktrees
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

## State management

No local state files beyond PIDs. astar.sh is the source of truth.

- **Tasks**: parent task `[overtime] Title` with subtask per requirement
- **PIDs**: `.astar/overtime/pids.json` tracks running processes
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

## Limitations (v1)

- Runs on the machine that starts it — laptop must stay on
- Agents share one worktree — no parallel subtask work
- No cost cap — agents loop until done or stopped
- MCP tools must be configured in the active Claude session
