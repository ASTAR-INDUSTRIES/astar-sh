# Feedback

User-submitted bugs, feature requests, pain points, and praise. Can link to skills.

## Data model

`feedback` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| message | text | Feedback content |
| type | text | `bug`, `feature`, `pain`, `praise` |
| status | text | `new`, `accepted`, `rejected`, `done` |
| author_email | text | Submitter |
| skill_slug | text | Optional linked skill |
| repo | text | Auto-detected git repo |
| branch | text | Auto-detected git branch |
| created_at | timestamptz | |

## Flow

1. User submits via CLI or MCP
2. Git context (repo, branch) auto-captured from CLI
3. Feedback appears in list with status `new`
4. Owner can `close` (→ done) or `reject` (→ rejected)
5. Linking to a task auto-sets feedback status to `done`

## Surfaces

**CLI** (`cli/src/commands/feedback.ts`):
- `astar feedback "message"` — submit (prompts for type)
- `astar feedback list` — browse with status filter
- `astar feedback close <id>` — mark as done
- `astar feedback reject <id>` — reject

**REST** (`supabase/functions/skills-api/index.ts`):
- `GET /feedback` — list (auth required)
- `POST /feedback` — submit
- `PATCH /feedback/:id` — update status

**MCP** (3 tools):
- `submit_feedback`, `list_feedback`, `update_feedback`
