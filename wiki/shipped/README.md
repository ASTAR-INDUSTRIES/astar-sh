# Shipped (Milestones)

Milestone logging for shipped deliverables. Tracks what was shipped, when, and in which category.

## Data model

`milestones` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| title | text | What was shipped |
| category | text | `general`, `contract`, `technical`, `product`, `team` |
| date | date | Ship date (default: today) |
| created_by | text | Email |
| project_id | uuid | Optional project attachment |
| created_at | timestamptz | |

## Flow

1. User ships something meaningful (deliverable, contract, feature)
2. Logs via `astar shipped "title"` with optional category and project
3. Appears in shipped calendar, filterable by category and project
4. Task links of type `milestone` auto-create milestones as a side effect

## Surfaces

**CLI** (`cli/src/commands/shipped.ts`):
- `astar shipped "title"` — log milestone
- `astar shipped list` — browse calendar
- Options: `--category <cat>`, `--date <YYYY-MM-DD>`, `--project <slug>`

**REST** (`supabase/functions/skills-api/index.ts`):
- `GET /milestones` — list (auth required)
- `POST /milestones` — create

**MCP** (2 tools):
- `create_milestone`, `list_milestones`
