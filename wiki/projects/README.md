# Projects

First-class workstream primitive. Tasks, events, agents, and milestones can attach to a project via `project_id`. All listings support `--project <slug>` filtering.

## Data model

`projects` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| slug | text | Unique, URL-safe identifier |
| name | text | Display name |
| description | text | Optional |
| visibility | text | `private`, `team`, `public` |
| owner | text | Email of creator |
| members | jsonb | Array of staff emails |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## Access control

- **public** — any `@astarconsulting.no` staff
- **team** — owner + members array (members normalized to lowercase)
- **private** — owner only

Project access gates cascade to attached entities. A task in a private project is only visible to the project owner, unless the user is the task's creator or assignee (task-level ownership overrides project gate).

## Surfaces

**CLI** (`cli/src/commands/projects.ts`):
- `astar projects [name]` — list or create
- `astar projects list` — list accessible projects
- `astar projects info <slug>` — project details with attached tasks, events, agents, milestones
- `astar projects update <slug>` — update name, description, visibility, members
- `astar projects delete <slug>` — delete project, unlinks all attached work

**REST** (`supabase/functions/skills-api/index.ts`):
- `GET /projects` — list (auth required)
- `POST /projects` — create
- `GET /projects/:slug` — details + attached work
- `PATCH /projects/:slug` — update (owner only)
- `DELETE /projects/:slug` — delete (owner only, unlinks all attached entities)

**MCP** (4 tools):
- `create_project`, `list_projects`, `get_project`, `update_project`

## Cross-cutting filter

`--project <slug>` works on: `astar todo`, `astar events`, `astar shipped list`, `astar agent list`. Filters results to entities attached to that project.
