# Subtask Counting

overtime: dev

Subtasks that are completed don't count in "done today" tallies and are hidden in monitor views. Example: completed #65 and #67 today (subtasks under #62) but they don't show in done-today count or the monitor listing.

Key files:
- cli/src/commands/todo.ts — monitor view, mine/team/list table rendering
- supabase/functions/skills-api/index.ts — task listing endpoint

## Requirements
- [ ] Task listing API includes subtasks in the response when `include_subtasks=true` — verify this already works by checking the endpoint. If subtasks are filtered out server-side for certain queries, fix it. Test by creating a parent task with 2 subtasks, completing one, and verifying the API returns the completed subtask.
- [ ] `astar todo --monitor` counts completed subtasks in the "done today" tally. Currently only top-level tasks count. Test by completing a subtask and verifying the count increments.
- [ ] `astar todo mine` and `astar todo list` show subtasks alongside regular tasks (indented under parent with └ prefix, same as the existing tree display). Completed subtasks should be visible, not hidden. Test by listing tasks after completing a subtask and verifying it appears.
- [ ] The dashboard "Tasks: X open" count on `astar` (no args) includes open subtasks, not just top-level tasks. Test by creating subtasks and verifying the count reflects them.

## Notes
The subtask tree display already exists (added in v0.0.37) — the issue is that completed subtasks are being filtered out or not counted. The fix is likely in the query filters, not the rendering.

Check both the server-side query (does it filter `status=open` and exclude completed subtasks?) and the client-side rendering (does it skip completed subtasks when building the table?).

For "done today": the API likely needs a date filter on `completed_at` for subtasks. Check if `completed_at` is set on subtasks when they're completed.

Keep changes minimal — this is a counting/filtering bug, not a redesign.
