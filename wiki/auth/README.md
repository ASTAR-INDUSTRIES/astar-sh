# Auth

Microsoft Entra ID (Azure AD) authentication via MSAL device code flow.

## How it works

1. User runs `astar login`
2. CLI creates MSAL `PublicClientApplication` with device code flow
3. User visits `microsoft.com/devicelogin`, enters code
4. CLI receives tokens, validates email is `@astarconsulting.no`
5. Tokens persisted to disk

## Token storage

| File | Purpose |
|------|---------|
| `~/.astar/auth.json` | Access token, expiry, account info |
| `~/.astar/msal-cache.json` | MSAL serialized cache for silent refresh |

## Token refresh

`getToken()` checks expiry → attempts `silentRefresh()` via MSAL cache → falls back to re-login prompt.

## Per-agent auth

Each agent gets its own isolated auth at `~/.astar/agents/<slug>/`:
- `auth.json` — agent's Microsoft token
- `msal-cache.json` — agent's MSAL cache

Agents authenticate via `loginForAgent(slug)` using their own `@astarconsulting.no` email.

## Config

| Key | Value |
|-----|-------|
| Tenant | `d6af3688-b659-4f90-b701-35246b209b9d` |
| Client ID | `384f7660-f5e6-4f72-aa24-3be21cad67ed` |
| Scopes | `openid`, `profile`, `email` |
| Domain restriction | `@astarconsulting.no` only |

## Key files

- `cli/src/lib/auth.ts` — all auth logic
- `cli/src/commands/agent.ts` — `loginForAgent()` for per-agent auth
