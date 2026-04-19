# Desktop App

A native macOS app for working with astar tasks. Built with Tauri v2 + Rust on the backend, React + Zustand on the frontend, talking directly to the `skills-api` Supabase edge function.

**Status:** v1 — read tasks, expand for full activity, comment, close as done or won't-do. Search by title or task number. Done-today appears below the open list.

## Why this exists

Feedback `#ec021c23` asked for a Rust + Tauri macOS app. v0 wrapped `astar todo --monitor` in a PTY (a dead end for any UI beyond what the CLI rendered). v1 tears that out and renders the task UI directly in DOM, talking to the API the CLI uses. The user mocked the design in claude.ai/design (`Wireframes.html` v2, "Refined TUI + inline cards"); this is the implementation.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  macOS window — translucent warm glass               │
│  (FullScreenUI vibrancy + transparent webview)       │
│  ┌────────────────────────────────────────────────┐  │
│  │  React UI (Vite + Zustand)                     │  │
│  │  ┌─ Topbar (logo · stats · clock)              │  │
│  │  ├─ Search bar (/)                             │  │
│  │  ├─ TaskList                                   │  │
│  │  │   ├─ open rows (sorted: pri → due → #)      │  │
│  │  │   ├─ TaskCard (when expanded)               │  │
│  │  │   │   ├─ Feed (audit events)                │  │
│  │  │   │   ├─ Composer (comment / closing)       │  │
│  │  │   │   └─ Actions (close · won't · cancel)   │  │
│  │  │   ├─ "done · today · N" divider             │  │
│  │  │   └─ done rows (strikethrough, dim)         │  │
│  │  └─ Footbar (keybind hints)                    │  │
│  └─────────────────┬──────────────────────────────┘  │
│                    │                                  │
│      tauri-plugin-http (bypasses CORS)                │
│                    │                                  │
└────────────────────┼─────────────────────────────────┘
                     ▼
   skills-api  (Supabase edge function)
   GET    /tasks?status=open
   GET    /tasks?status=completed | cancelled
   GET    /tasks/:n
   PATCH  /tasks/:n         (close: status="completed"|"cancelled")
   POST   /tasks/:n/comments  ← v1 added this
```

Auth: a single Tauri command (`read_auth` in `app/src-tauri/src/commands.rs`) reads `~/.astar/auth.json` (the same file the CLI writes after `astar login`) and returns the bearer ID-token + expiry to React. No MSAL refresh in the desktop app; on expiry the user is prompted to run `astar login` and the app re-reads the file on window focus.

## Files

| Path | Role |
|---|---|
| `app/src-tauri/Cargo.toml` | Rust deps: `tauri 2` (`macos-private-api`), `tauri-plugin-http`, `dirs`, `window-vibrancy` (macOS) |
| `app/src-tauri/tauri.conf.json` | `transparent: true`, `titleBarStyle: "Overlay"`, `hiddenTitle: true`, `macOSPrivateApi: true` |
| `app/src-tauri/capabilities/default.json` | Allows `core:default`, window dragging, and HTTP to `https://owerciqeeelwrqseajqq.supabase.co/*` |
| `app/src-tauri/src/lib.rs` | Builder, plugin registration, vibrancy setup |
| `app/src-tauri/src/commands.rs` | `read_auth` — parses `~/.astar/auth.json`, returns `{token, expires_at, account_email, account_name}` |
| `app/src/api.ts` | `fetch` from `@tauri-apps/plugin-http` with bearer auth; `listOpen`, `listClosed`, `getTask`, `patchTask`, `addComment`, `createTask` |
| `app/src/store.ts` | Zustand store: auth, tasks, doneToday, detail, selection, mode, search, closeOutcome. Owns `poll`, `expand`, `beginClose`, `confirmClose`, `postComment` |
| `app/src/keybinds.ts` | Global keydown router; mode-gated (`list`/`card`/`composer`/`closing`); skips when text input is focused |
| `app/src/components/*` | `App`, `Topbar`, `SearchBar`, `TaskList`, `TaskRow`, `TaskCard`, `Feed`, `Composer`, `Footbar`, `ExpiredBanner` |

## Sort order

Open tasks: priority (`critical` → `high` → `medium` → `low`) → due date ascending (no due last) → task number ascending. Implemented in `app/src/store.ts` (`comparePriDueNum`).

Done-today: completion time descending (most recently closed first).

## Search

Inline bar between topbar and list. Matches task title (case-insensitive substring) and task number (substring). `/` from the list focuses the input; `Escape` clears + blurs. Filter applies to both open and done sections.

## Glass + paper styling

- Window: macOS `NSVisualEffectMaterial::FullScreenUI` vibrancy (visible see-through to desktop), `set_background_color(None)` on the webview so the vibrancy isn't masked.
- Paper layer: full-bleed `rgba(250, 246, 233, 0.62)` warm tint over the vibrancy. No inner border, no margin.
- Inner card: `rgba(255, 253, 243, 0.72)` paper-card with dashed dark border. Closing mode: coral border + warm pink background.
- Drag region: invisible 32px strip at the top with `data-tauri-drag-region`.
- Brand: `--ink: #12172B` (text), `--accent: #c13c2a` (active states + closing border). Plus Jakarta Sans for UI, JetBrains Mono for the dense list and audit feed.

## Comment endpoint (POST /tasks/:n/comments)

Added in `supabase/functions/skills-api/index.ts` after the `links` handler. Pattern mirrors `POST /tasks/:n/links`: validate token, `canAccessTask`, `canModifyTask`, then `logTaskAudit(..., "human", "commented", { state_after: { comment }, channel: "app" })`. Comment field name (`comment`) matches the existing MCP shape so the unified feed renderer reads from a single key. Returns 201 on success, 400 if comment is empty or > 4000 chars.

## CORS / Tauri http plugin

WKWebView strict-checks CORS preflight on PATCH/POST/DELETE. Two complementary fixes:

1. `tauri-plugin-http` routes fetches through Rust's `reqwest` so they don't touch the webview CORS layer at all. Capability `http:default` allows the supabase host. This is the durable fix.
2. `skills-api` corsHeaders now include `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS` so any future browser client (web app, etc.) can also use the API without preflight failures.

## Dev workflow

```bash
cd app
pnpm install
pnpm tauri dev       # Vite on :1420, Tauri opens the window
pnpm tauri build     # produces app/src-tauri/target/release/bundle/macos/astar.app
```

Prereq: `astar login` must succeed once in your terminal — the desktop app reads the resulting `~/.astar/auth.json`.

## Decisions

- **No MSAL refresh in JS.** Re-implementing token refresh in the webview adds days of risk for a v0. Banner + `astar login` prompt is fine.
- **Polling, not websockets.** 10s tick mirrors `astar todo --monitor`. No Supabase realtime subscription yet.
- **Close-with-comment is two requests.** `PATCH /tasks/:n {status}` then `POST /tasks/:n/comments {comment}`. The PATCH is the source of truth for the close; the comment is best-effort. If the comment fails, the close still goes through and a soft amber banner surfaces the comment failure for 6s.
- **Mode-gated keybinds.** Single global handler reads `mode` from the store (`list`/`card`/`composer`/`closing`/`palette`). No `e.target.tagName` checks scattered through components.
- **Optimistic close.** On `x`/`w` confirm, the row drops from the open list immediately; the next poll picks up the closed entry into `doneToday`.

## Gotchas

- The `done` section depends on `completed_at >= start of today (local time)`. The server returns up to 50 closed tasks ordered by `created_at desc` — a task created weeks ago but closed today still appears as long as it's in the most-recent-50 by creation. For high-volume users this could miss old long-running tasks closed today; not a real concern at current usage.
- Vibrancy material `FullScreenUI` looks white-ish on bright wallpapers. `Sidebar` is more opaque, `UnderWindowBackground` is more transparent. Easy to swap in `app/src-tauri/src/lib.rs`.
- The webview's default white background masks the vibrancy. `window.set_background_color(None)` in the Rust setup fixes it; without it the glass looks opaque.
- Tauri 2 split window permissions out of `core:default`. `core:window:allow-start-dragging` is required for `data-tauri-drag-region` to work.
