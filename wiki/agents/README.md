# Agents

Non-human employees with their own Microsoft accounts, heartbeats, and workstations.

## Lifecycle

```
hire → active → pause → resume → active → retire
```

### Hire (one-command onboarding)

`astar agent hire <slug>` does everything:

1. Registers agent in DB (slug, name, email, skill, scopes, machine, owner)
2. Creates workstation at `~/.astar/agents/<slug>/`
3. Authenticates agent's Microsoft account
4. Generates `MEMORY.md` with initial state
5. Creates `run.sh` heartbeat script with circuit breaker
6. Installs launchd plist at `~/Library/LaunchAgents/com.astar.agent.<slug>.plist`

### Heartbeat

launchd triggers `run.sh` every N seconds (default 30):

1. Increment daily beat counter (`.beats_YYYYMMDD`)
2. Check circuit breaker (default max 100 beats/day)
3. Invoke Claude with agent's skill, allowed tools, max 20 turns
4. Claude reads inbox → processes messages → updates MEMORY.md
5. All actions logged via audit trail

### Status transitions

| From | To | Command |
|------|-----|---------|
| — | active | `astar agent hire <slug>` |
| active | paused | `astar agent pause <slug>` |
| paused | active | `astar agent resume <slug>` |
| active | retired | `astar agent retire <slug>` |

## Workstation directory

```
~/.astar/agents/<slug>/
  auth.json           # Agent's Microsoft token
  msal-cache.json     # MSAL cache for silent refresh
  MEMORY.md           # Agent state (readable/writable by agent)
  run.sh              # Heartbeat executable
  beat.log            # stdout from heartbeats
  beat.err            # stderr from heartbeats
  .beats_YYYYMMDD     # Daily beat counter
```

## launchd plist

```
Label:              com.astar.agent.<slug>
ProgramArguments:   [path to run.sh]
StartInterval:      heartbeat frequency (seconds)
RunAtLoad:          true
Env:                ASTAR_AGENT=<slug>, PATH, HOME
```

## Scope enforcement

Agents can only call MCP tools matching their declared scopes. Denied tool calls are logged to audit with `scope_denied` action.

## DB schema

`agents` table: id, slug (unique), name, email, role, owner, skill_slug, scopes[], status, machine, config (jsonb), last_seen, created_at.

## Key files

- `cli/src/commands/agent.ts` — all agent commands + monitor
- `supabase/functions/skills-api/index.ts` — agent API endpoints
- `supabase/functions/mcp-server/index.ts` — scope enforcement
