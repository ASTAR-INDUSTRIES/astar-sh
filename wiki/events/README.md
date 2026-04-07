# Events

First-class event tracking for time-bounded work such as conferences, partner meetings, speaking slots, and podcasts.

## Data model

### events table

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| slug | text | Unique identifier used by CLI and MCP |
| title | text | Required |
| type | text | arranged, speaking, attending, podcast |
| status | text | tentative, confirmed, completed, cancelled |
| goal | text | Required justification / success criteria |
| date | date | Optional |
| date_tentative | boolean | Marks an approximate date |
| location | text | Optional |
| attendees | jsonb | Internal + external attendees |
| visibility | text | private, team, public |
| created_by | text | Email of creator |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

## Task linkage

- Tasks can point at an event through `tasks.event_id`
- Event detail views load all top-level tasks plus subtasks for that event
- Task list endpoints accept an `event` filter (slug or UUID)

## Surfaces

- CLI: `astar events`, `astar events info <slug>`, `astar events update <slug>`
- REST API: `GET/POST /events`, `GET/PATCH /events/:slug`
- MCP: `create_event`, `list_events`, `get_event`, `update_event`

## Key files

- `cli/src/commands/events.ts` — event CLI
- `cli/src/commands/todo.ts` — task/event filters
- `supabase/functions/skills-api/index.ts` — REST endpoints
- `supabase/functions/mcp-server/index.ts` — MCP tools
- `supabase/migrations/20260407160000_events.sql` — schema
