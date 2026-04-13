# Task Visibility & RLS

overtime: dev

Mikael (second user on the platform) can see Erik's private tasks via `list_tasks assigned_to=<email>`. Tasks need a visibility field enforced server-side. This is a security issue — private tasks with client names, financial info, and personal matters are leaking.

The visibility column already exists on the tasks table (added in v0.0.27) but enforcement is done in app logic, not at the DB level. The `include_all` flag bypasses everything.

Key files:
- supabase/functions/skills-api/index.ts — task list/detail endpoints
- supabase/functions/mcp-server/index.ts — MCP task tools
- cli/src/commands/todo.ts — CLI task commands
- cli/src/lib/api.ts — API client

## Requirements
- [ ] Task list API (`GET /tasks`) enforces visibility server-side: private tasks only visible to creator and assignee, team tasks visible to org members, public visible to all authenticated users. Test by creating tasks with different visibility levels and verifying the API returns only what the caller should see.
- [ ] Task detail API (`GET /tasks/:id`) enforces the same visibility rules — requesting a private task you don't own returns 403. Test with a second user email.
- [ ] MCP `list_tasks` tool respects visibility — `include_all` is rejected unless the caller has an admin claim in their JWT (which no one has yet, so it should always be rejected). Test that `include_all: true` returns an error.
- [ ] MCP `get_task`, `update_task`, `complete_task`, `comment_task` all check visibility before allowing access. Test each one with a task the caller doesn't own.
- [ ] `astar todo` defaults new tasks to `team` visibility. Add `--private` and `--public` flags. Test that `astar todo "test" --private` creates a task with visibility=private.
- [ ] `astar todo team` only shows team and public tasks, never private tasks of other users. Test the filter.

## Notes
The visibility column already exists with values: private, team, public. Don't add a new column — use the existing one.

Don't change the DB schema or add RLS policies at the Supabase level — enforce in the API endpoints. The API already has the user's email from `validateMsToken()`.

For testing: create helper functions that simulate API calls with different user emails. The test should create tasks as user A, then query as user B and verify user B cannot see user A's private tasks.

The existing `assigned_to` field is an email. Use email comparison (lowercase normalized) for ownership checks.
