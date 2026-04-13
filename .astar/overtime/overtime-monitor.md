# Overtime Monitor

overtime: dev

Need a live dashboard for monitoring multiple overtime sessions. Currently I run `astar overtime status` + `git log` + `tail` log files to piece together what's happening. The monitor replaces all of that with a single live view.

Key files:
- cli/src/commands/overtime.ts — add monitor command, reuse existing showStatus/readPidFile/API patterns
- cli/src/lib/ui.ts — ANSI helpers (c.bold, c.dim, etc.)

Reference: the existing `astar todo --monitor` and `astar etf --monitor` commands use the same ANSI full-screen redraw pattern — clear screen, render, sleep, repeat. Use the same approach.

## Requirements
- [ ] Add `astar overtime monitor` command that renders a full-screen live dashboard, refreshing every 5 seconds. Shows all active sessions with: slug, task number, subtask progress bar (✓ done, ▸ in_progress, ○ open), state (running/done/stopped), uptime, and cost (from log file JSON if available). Test by running the command and verifying it renders without errors and updates on refresh.
- [ ] Add a one-line log tail per session — the last meaningful line from `.astar/overtime/logs/<slug>.log`. Skip raw JSON lines, show only the human-readable agent output. Test by creating a mock log file and verifying the tail extraction works.
- [ ] Add `astar overtime stop <slug>` to stop a single session without killing others. Currently `stop` kills everything. Test by starting two dummy entries in pids.json, stopping one, and verifying the other remains.
- [ ] Add `[q]` keybinding to quit the monitor without stopping sessions. Use raw stdin mode (same pattern as etf monitor). Test that ctrl+c and q both exit cleanly and restore terminal state.
- [ ] Add `[s]` keybinding that prompts for a session slug and stops that session (calls the same logic as `astar overtime stop <slug>`). Test that after pressing s and entering a slug, the session is stopped and the display updates.
- [ ] Add footer with aggregate stats: total sessions, total cost (summed from log JSON), total cycles, total rejections (count reopened subtasks from task activity). Test the aggregation logic with mock data.

## Notes
Use the ANSI full-screen pattern from `astar todo --monitor` or `astar etf --monitor`:
- `\x1b[2J\x1b[H` clear + home
- `\x1b[?25l` hide cursor on start
- `\x1b[?25h` show cursor on exit
- `setInterval` for refresh
- Raw stdin mode for keybindings

For cost extraction: parse the last JSON line in each log file that has `total_cost_usd`. The telemetry tables may not be deployed yet, so fall back to log file parsing.

For the progress bar: fetch subtasks via `api.getTask(taskNumber)` each refresh cycle.

Keep it simple for v1 — no blessed/ink dependencies. Plain ANSI + process.stdout.write.

Don't implement the `[c]` comment or `[l]` logs keybindings yet — just `[q]` quit and `[s]` stop for v1.
