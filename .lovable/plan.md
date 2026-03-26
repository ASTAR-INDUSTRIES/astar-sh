

# Microsoft Entra ID SSO for ASTAR Platform

## Overview
Set up Microsoft Entra ID authentication restricted to `astarconsulting.no` domains, with a login page and protected admin area for content management.

## Azure App Registration Setup
The redirect URI you need to add in your Azure App Registration:
```
https://owerciqeeelwrqseajqq.supabase.co/auth/v1/callback
```

**Please add this as a Redirect URI (Web) in your Azure App Registration before we proceed.**

## Implementation Steps

### 1. Store Azure Secrets
- Store the **Client Secret** (`~h88Q~3Neb6Us3a8fCGhVYSAeezMQa1rr50QabBI`) as a backend secret named `AZURE_CLIENT_SECRET`
- The Client ID and Tenant ID will be configured in the auth settings

### 2. Configure Azure Auth Provider
- Update `supabase/config.toml` to enable the Azure external provider with:
  - Client ID: `384f7660-f5e6-4f72-aa24-3be21cad67ed`
  - Tenant ID (URL): `https://login.microsoftonline.com/d6af3688-b659-4f90-b701-35246b209b9d/v2.0`
  - Redirect URI pointing to the Supabase auth callback

### 3. Create Login Page (`/login`)
- Simple login page matching the dark terminal aesthetic
- "Sign in with Microsoft" button
- Uses `supabase.auth.signInWithOAuth({ provider: 'azure' })` with `astarconsulting.no` domain hint
- Redirects to `/admin` on success

### 4. Create Auth Context
- `AuthProvider` component wrapping the app
- Tracks session state via `onAuthStateChange`
- Validates email domain is `@astarconsulting.no` post-login (rejects others)
- Provides `user`, `signIn`, `signOut` to child components

### 5. Create Admin Dashboard (`/admin`)
- Protected route (redirects to `/login` if unauthenticated)
- Create/edit/delete posts and research articles
- Forms for title, content, category, tags, publish status
- CRUD operations against the `posts` and `research_articles` tables

### 6. Update Database RLS
- Add RLS policies for INSERT/UPDATE/DELETE on `posts` and `research_articles` requiring authenticated users with `@astarconsulting.no` email domain

### 7. Update Navigation
- Add "Sign In" link in the nav bar (when logged out)
- Show user avatar/name + "Admin" link (when logged in)

## Technical Details

### Files to create:
- `src/contexts/AuthContext.tsx` — auth state management
- `src/pages/Login.tsx` — login page
- `src/pages/Admin.tsx` — admin dashboard
- `src/components/ProtectedRoute.tsx` — route guard

### Files to modify:
- `supabase/config.toml` — Azure provider config
- `src/App.tsx` — add routes
- `src/components/Layout.tsx` — add auth-aware nav items

### New migration:
- RLS policies for authenticated write access restricted to `astarconsulting.no` domain emails

