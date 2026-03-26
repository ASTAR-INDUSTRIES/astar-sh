

# Fix: Microsoft Entra ID Authentication

## Problem
Lovable Cloud's authentication system only natively supports **Google** and **Apple** as OAuth providers. The `config.toml` Azure configuration isn't being picked up because Azure/Microsoft isn't a managed provider — hence the "Unsupported provider" error.

## Solution: Custom OAuth via Edge Function

Since we need Microsoft Entra ID specifically, we'll implement the OAuth flow ourselves using an edge function that handles the Microsoft token exchange, then creates/signs in users via Supabase Auth's admin API.

### Architecture

```text
Browser → Edge Function (initiate) → Microsoft Login
Microsoft → Edge Function (callback) → Validate domain
                                      → Create/sign-in user via Supabase Admin API
                                      → Redirect browser with session
```

### Steps

1. **Create edge function `microsoft-auth`**
   - `/initiate` endpoint: Builds Microsoft OAuth URL with correct client_id, tenant, redirect_uri, scopes, and state parameter; redirects user to Microsoft
   - `/callback` endpoint: Receives auth code from Microsoft, exchanges it for tokens, validates the email is `@astarconsulting.no`, then uses Supabase Admin API to sign in or create the user, and redirects back to the app with a session

2. **Update Login page**
   - Instead of calling `supabase.auth.signInWithOAuth({ provider: 'azure' })`, redirect to the edge function's `/initiate` endpoint

3. **Update AuthContext**
   - Remove the Azure OAuth call
   - Keep session management via `onAuthStateChange` (the edge function will establish the session server-side)

4. **Remove unused config**
   - Clean up the `[auth.external.azure]` block from `config.toml` since it's not functional

### Security
- Domain validation (`@astarconsulting.no`) enforced server-side in the edge function
- PKCE or state parameter to prevent CSRF
- Client secret stays in edge function secrets (already stored)

