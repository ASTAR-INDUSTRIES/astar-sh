# Tasks

Core task management with subtasks, polymorphic links, agent triage, and recurring tasks.

## Data model

### tasks table

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| task_number | int | Auto-increment, user-facing (#1, #2, #3) |
| title | text | Required |
| description | text | Optional |
| status | text | open, in_progress, completed, blocked, cancelled |
| priority | text | low, medium, high, critical |
| created_by | text | Email, required |
| assigned_to | text | Email |
| completed_by | text | Email |
| due_date | date | Optional |
| completed_at | timestamptz | Set on completion |
| source | text | human, agent, feedback, system |
| tags | text[] | Array |
| parent_task_id | uuid | FK → tasks (subtask hierarchy) |
| confidence | numeric | AI-generated confidence 0-1 |
| requires_triage | boolean | Agent-created tasks default true |
| recurring | jsonb | `{"interval": "weekly"}` |
| estimated_hours | numeric | Optional |
| archived_at | timestamptz | Soft delete |

### task_links table (polymorphic relationships)

| Field | Type | Notes |
|-------|------|-------|
| task_id | uuid | FK → tasks |
| link_type | text | skill, news, feedback, url, milestone, task |
| link_ref | text | Slug, URL, or ID of linked resource |

### Link side effects

When a task with links is completed:
- `feedback` link → feedback status set to `done`
- `milestone` link → milestone created automatically

## Subtasks

- Set via `parent_task_id` on child tasks
- Parent shows `[done/total]` progress indicator
- Completing parent with open subtasks is blocked (unless `force=true`)
- `include_subtasks` API parameter fetches full hierarchy in one query

## Triage workflow

1. Agent creates task → `requires_triage=true`, `source="agent"`, optional `confidence` score
2. Human reviews via `astar todo triage`
3. Accept → `requires_triage=false`, task enters main list
4. Dismiss → `status=cancelled`, `archived_at` set

## Recurring tasks

When a recurring task is completed, a new task is auto-created with:
- Same title, assignee, tags, recurring config
- Due date shifted by interval (weekly +7d, monthly +30d, quarterly +90d)
- Linked to original task via `parent_task_id`

## Key files

- `cli/src/commands/todo.ts` — all CLI commands + monitor
- `cli/src/lib/api.ts` — Task interface + API client
- `supabase/functions/skills-api/index.ts` — REST endpoints
- `supabase/functions/mcp-server/index.ts` — MCP tools
