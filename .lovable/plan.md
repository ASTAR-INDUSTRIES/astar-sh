

# Fix: MCP Server OAuth Discovery for Claude Desktop

## Problem

The MCP server's OAuth discovery endpoints work (return 200) but Claude Desktop never proceeds to the OAuth flow (no `/register` or `/authorize` calls). The analytics show it discovers metadata, retries POST /mcp, gets 401 again, and gives up.

**Root causes identified from request logs and MCP spec:**

1. **Wrong `resource` identifier** — Protected resource metadata returns `resource: "https://.../mcp-server"` but should be `"https://.../mcp-server/mcp"` (the actual protected endpoint URL). Claude can't match the resource to the endpoint it's protecting.

2. **Missing `scopes_supported`** — The MCP spec says clients use `scopes_supported` from the protected resource metadata to know what scopes to request. Without it, Claude may not know how to proceed.

3. **Missing `/.well-known/openid-configuration`** — Claude Desktop tries this endpoint first (returns 404). While not strictly required, serving it as a fallback would improve compatibility.

## Plan

### Single file change: `supabase/functions/mcp-server/index.ts`

1. **Fix protected resource metadata** (`/.well-known/oauth-protected-resource`):
   - Set `resource` to `${baseUrl()}/mcp` (the actual MCP endpoint)
   - Add `scopes_supported: ["mcp:tools"]`
   - Add `bearer_methods_supported: ["header"]` (already present, keep it)

2. **Fix authorization server metadata** (`/.well-known/oauth-authorization-server`):
   - Add `scopes_supported: ["mcp:tools"]`

3. **Add `/.well-known/openid-configuration`** endpoint — return the same content as `oauth-authorization-server` (Claude tries this first)

4. **Update the 401 `WWW-Authenticate` header** on both GET and POST `/mcp`:
   - Include the `scope` parameter: `Bearer resource_metadata="...", scope="mcp:tools"`

5. **Redeploy** the edge function

### Technical detail
The MCP spec (2025-03-26) requires that:
- The `resource` field in protected resource metadata MUST match the URL being protected
- Clients use `scope` from the 401 challenge first, then fall back to `scopes_supported`
- Claude Desktop also tries OpenID Connect discovery as a fallback

