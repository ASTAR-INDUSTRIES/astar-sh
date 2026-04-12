# Overtime Telemetry — Research Findings

## What `claude --output-format json` exposes

Running `claude -p '...' --output-format json` emits a single JSON object to stdout at session end. All telemetry needed for cycle records is available directly.

### Complete JSON schema (observed from `claude 2.1.104`)

```json
{
  "type": "result",
  "subtype": "success",          // "success" | "error"
  "is_error": false,
  "duration_ms": 5288,           // wall clock time (ms)
  "duration_api_ms": 3144,       // API-only time (ms)
  "num_turns": 2,                // number of conversation turns used
  "result": "...",               // final text output
  "stop_reason": "end_turn",     // "end_turn" | "max_turns" | "stop_sequence" | "tool_use"
  "session_id": "b1a16fae-...",
  "total_cost_usd": 0.04541865,  // actual cost — no estimation needed
  "usage": {
    "input_tokens": 3,
    "cache_creation_input_tokens": 9053,
    "cache_read_input_tokens": 33103,
    "output_tokens": 102,
    "server_tool_use": {
      "web_search_requests": 0,
      "web_fetch_requests": 0
    },
    "service_tier": "standard",
    "iterations": [              // one entry per API call within the session
      {
        "input_tokens": 1,
        "output_tokens": 6,
        "cache_read_input_tokens": 21019,
        "cache_creation_input_tokens": 118,
        "type": "message"
      }
    ],
    "speed": "standard"
  },
  "modelUsage": {
    "claude-sonnet-4-6": {       // key = model ID actually used
      "inputTokens": 3,
      "outputTokens": 102,
      "cacheReadInputTokens": 33103,
      "cacheCreationInputTokens": 9053,
      "webSearchRequests": 0,
      "costUSD": 0.04541865,
      "contextWindow": 200000,
      "maxOutputTokens": 32000
    }
  },
  "permission_denials": [],
  "terminal_reason": "completed", // "completed" | "error" | ...
  "fast_mode_state": "off",
  "uuid": "8d59f685-..."
}
```

### `stream-json --verbose` adds per-event data

Running with `--output-format stream-json --verbose` emits one JSON object per line:

- `{"type":"system","subtype":"init", "model":"...", "session_id":"...", "tools":[...], "mcp_servers":[...], "claude_code_version":"..."}` — emitted at start
- `{"type":"assistant","message":{...}}` — each API response, includes `tool_use` entries showing which tools were called and with what inputs
- `{"type":"user","message":{...}, "tool_use_result":{stdout, stderr, interrupted}, "timestamp":"..."}` — tool results
- `{"type":"rate_limit_event", ...}` — rate limit status
- `{"type":"result", ...}` — same final object as `--output-format json`

The `stream-json` format enables counting exact tool calls per cycle by counting `tool_use` messages.

## What each field maps to (for `overtime_cycles` table)

| Table column | Source |
|---|---|
| `duration_ms` | `duration_ms` |
| `tokens_in` | `usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens` |
| `tokens_out` | `usage.output_tokens` |
| `cost_usd` | `total_cost_usd` |
| `model` | First key of `modelUsage` |
| `turns_used` | `num_turns` |
| `exit_code` | Shell `$?` after claude invocation |
| `stop_reason` | `stop_reason` (e.g. `end_turn`, `max_turns`) |
| `tool_calls_count` | `usage.iterations.length` (each iteration = one API call; tool calls tracked separately via stream-json if needed) |

## Integration strategy

The current agent bash loop in `makeAgentScript()`:
```bash
claude -p '...' \
  --allowedTools "..." \
  --max-turns 30 \
  --dangerously-skip-permissions 2>&1
EXIT_CODE=$?
```

Change to capture JSON output:
```bash
CYCLE_JSON=$(claude -p '...' \
  --output-format json \
  --allowedTools "..." \
  --max-turns 30 \
  --dangerously-skip-permissions 2>&1)
EXIT_CODE=$?
# Ship CYCLE_JSON to astar.sh API
```

Since `--output-format json` writes a single line to stdout, we can capture it cleanly with `$()`. The log file can receive both the JSON and status messages by tee'ing.

## What's NOT exposed by `--output-format json`

- **Per-tool-call counts** — `iterations` gives per-API-call token breakdown, but not which specific tools were called. For this, use `stream-json --verbose` and count `tool_use` events.
- **Turn timestamps** — no per-turn timing, only total `duration_ms`.
- **Rejection events** — must be inferred from task status changes in astar.sh (subtask going from `completed` → `open` = rejection).

## Cost: no estimation needed

`total_cost_usd` is exact and directly usable. No need to estimate from token counts.

## The `--max-budget-usd` flag

`claude --print --max-budget-usd 5.00` adds a hard spend cap per invocation. Useful to add to overtime agent invocations to prevent runaway costs.
