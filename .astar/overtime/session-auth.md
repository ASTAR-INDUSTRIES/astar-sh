# Session Auth — Reduce Login Frequency

overtime: dev

The CLI forces re-login too often. MSAL ID tokens expire after ~1 hour. The silent refresh works sometimes but often fails, forcing a full device code flow multiple times per day. Should be once a week at most.

Key files:
- cli/src/lib/auth.ts — getToken(), silentRefresh(), login()
- cli/src/lib/config.ts — AuthCache type, save/load

## Requirements
- [ ] Diagnose why silent refresh fails — add a debug log (only when ASTAR_DEBUG=1 env var is set) to silentRefresh() that logs: whether MSAL cache exists, number of accounts found, which account matched, whether acquireTokenSilent succeeded or threw, and the error message if it threw. Test by setting ASTAR_DEBUG=1 and running `astar whoami` with an expired token.
- [ ] If silent refresh fails but the MSAL cache file exists and has a valid refresh token, try acquireTokenSilent with `forceRefresh: true` before falling back to interactive login. MSAL caches refresh tokens that last 90 days — we should be using them. Test by letting a token expire, then verifying `astar whoami` refreshes silently without prompting.
- [ ] Store the ID token expiry separately from the MSAL access token expiry. Currently `getIdTokenExpiry()` parses the JWT exp claim — make sure this is used as the cache expiry, not the MSAL `expiresOn` (which is for the Graph access token, not the ID token). Test by logging both expiry times and verifying they differ.
- [ ] Add a 5-minute buffer to token expiry checks — refresh when the token has less than 5 minutes left, not when it's already expired. This prevents the "expired mid-request" race. Test by mocking a token that expires in 3 minutes and verifying it triggers refresh.

## Notes
The auth flow is: MSAL device code → get ID token (not access token) → store in ~/.astar/auth.json → use as Bearer token for API calls → on expiry, try MSAL silent refresh → if that fails, interactive re-auth.

The fix in v0.0.73 switched from access tokens to ID tokens, which was correct. But ID tokens have ~1hr lifetime from Azure AD. The key to long sessions is the MSAL refresh token (90 days) stored in ~/.astar/msal-cache.json — `acquireTokenSilent` should use it automatically, but something is failing.

Don't change the token validation on the server side — focus on the CLI refresh logic.

For testing: mock the MSAL client responses. Test scenarios: fresh token, expired token with valid refresh, expired token with no refresh, expired token with failed refresh.
