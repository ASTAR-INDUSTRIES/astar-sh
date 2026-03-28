import { Hono } from "jsr:@hono/hono@^4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const app = new Hono().basePath("/mcp-server");

// ── Config ──────────────────────────────────────────────────────────────
const TENANT_ID = "d6af3688-b659-4f90-b701-35246b209b9d";
const MS_AUTHORIZE = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const MS_TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const SANITY_PROJECT_ID = "fkqm34od";
const SANITY_DATASET = "production";

function env(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`${key} not configured`);
  return v;
}

function baseUrl(): string {
  return `${env("SUPABASE_URL")}/functions/v1/mcp-server`;
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Auth helper ────────────────────────────────────────────────────────
async function validateToken(req: Request): Promise<{ email: string; userId: string } | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const sb = adminClient();
  const { data } = await sb.from("mcp_sessions")
    .select("user_email, user_id")
    .eq("access_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return { email: data.user_email, userId: data.user_id };
}

// ── CORS ───────────────────────────────────────────────────────────────
app.options("*", (c) =>
  new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    },
  })
);

// ── OAuth: Protected Resource Metadata (RFC 9728) ──────────────────────
app.get("/.well-known/oauth-protected-resource", (c) => {
  const b = baseUrl();
  return c.json({
    resource: `${b}/mcp`,
    authorization_servers: [b],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:tools"],
  });
});

// ── OAuth: Authorization Server Metadata ───────────────────────────────
function authServerMetadata() {
  const b = baseUrl();
  return {
    issuer: b,
    authorization_endpoint: `${b}/authorize`,
    token_endpoint: `${b}/token`,
    registration_endpoint: `${b}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:tools"],
  };
}

app.get("/.well-known/oauth-authorization-server", (c) => c.json(authServerMetadata()));

// ── OAuth: OpenID Connect Discovery (fallback for Claude Desktop) ──────
app.get("/.well-known/openid-configuration", (c) => c.json(authServerMetadata()));

// ── OAuth: Dynamic Client Registration ─────────────────────────────────
app.post("/register", async (c) => {
  const body = await c.req.json();
  return c.json({
    client_id: crypto.randomUUID(),
    client_name: body.client_name || "MCP Client",
    redirect_uris: body.redirect_uris || [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, 201);
});

// ── OAuth: Authorize → Microsoft ───────────────────────────────────────
app.get("/authorize", async (c) => {
  const clientRedirectUri = c.req.query("redirect_uri");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method") || "S256";
  const clientState = c.req.query("state") || "";

  if (!clientRedirectUri) return c.json({ error: "redirect_uri required" }, 400);

  const state = btoa(JSON.stringify({
    client_redirect_uri: clientRedirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    client_state: clientState,
    nonce: crypto.randomUUID(),
  }));

  const sb = adminClient();
  await sb.from("mcp_sessions").insert({
    state,
    client_redirect_uri: clientRedirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  });

  const params = new URLSearchParams({
    client_id: env("AZURE_CLIENT_ID"),
    response_type: "code",
    redirect_uri: `${baseUrl()}/callback`,
    scope: "openid email profile",
    response_mode: "query",
    state,
    domain_hint: "astarconsulting.no",
  });

  return c.redirect(`${MS_AUTHORIZE}?${params.toString()}`);
});

// ── OAuth: Microsoft Callback ──────────────────────────────────────────
app.get("/callback", async (c) => {
  const msCode = c.req.query("code");
  const state = c.req.query("state");
  const msError = c.req.query("error");

  if (msError || !msCode || !state) {
    return c.json({ error: msError || "Missing code/state" }, 400);
  }

  const sb = adminClient();
  const { data: session } = await sb.from("mcp_sessions").select("*").eq("state", state).maybeSingle();
  if (!session) return c.json({ error: "Invalid state" }, 400);

  // Exchange with Microsoft
  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("AZURE_CLIENT_ID"),
      client_secret: env("AZURE_CLIENT_SECRET"),
      code: msCode,
      redirect_uri: `${baseUrl()}/callback`,
      grant_type: "authorization_code",
      scope: "openid email profile",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("MS token exchange failed:", tokenData);
    return c.json({ error: "Token exchange failed" }, 500);
  }

  const payload = JSON.parse(atob(tokenData.id_token.split(".")[1]));
  const email = payload.email || payload.preferred_username;

  if (!email?.endsWith("@astarconsulting.no")) {
    const url = new URL(session.client_redirect_uri);
    url.searchParams.set("error", "access_denied");
    return c.redirect(url.toString());
  }

  // Find/create user
  const { data: users } = await sb.auth.admin.listUsers();
  let userId = users?.users?.find((u: any) => u.email === email)?.id;
  if (!userId) {
    const { data: nu } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: payload.name || "" } });
    userId = nu?.user?.id;
  }

  const authCode = crypto.randomUUID();
  await sb.from("mcp_sessions").update({ auth_code: authCode, user_email: email, user_id: userId }).eq("id", session.id);

  // Redirect to Claude Desktop
  const url = new URL(session.client_redirect_uri);
  url.searchParams.set("code", authCode);
  try {
    const parsed = JSON.parse(atob(state));
    if (parsed.client_state) url.searchParams.set("state", parsed.client_state);
  } catch { /* ignore */ }

  return c.redirect(url.toString());
});

// ── OAuth: Token Exchange ──────────────────────────────────────────────
app.post("/token", async (c) => {
  const body = await c.req.parseBody();
  const code = body.code as string;
  const codeVerifier = body.code_verifier as string;

  if (body.grant_type !== "authorization_code" || !code) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  const sb = adminClient();
  const { data: session } = await sb.from("mcp_sessions").select("*").eq("auth_code", code).maybeSingle();
  if (!session) return c.json({ error: "invalid_grant" }, 400);

  // PKCE verification
  if (session.code_challenge && codeVerifier) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const computed = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (computed !== session.code_challenge) {
      return c.json({ error: "invalid_grant", error_description: "PKCE failed" }, 400);
    }
  }

  const accessToken = crypto.randomUUID();
  await sb.from("mcp_sessions").update({
    access_token: accessToken,
    auth_code: null,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", session.id);

  return c.json({ access_token: accessToken, token_type: "bearer", expires_in: 30 * 24 * 60 * 60 });
});

// ── MCP Tools Definition ───────────────────────────────────────────────
const TOOLS = [
  {
    name: "post_tweet",
    description: "Post a new thought/tweet to the astar.sh timeline",
    inputSchema: {
      type: "object",
      properties: { content: { type: "string", description: "The content (max 500 chars)" } },
      required: ["content"],
    },
  },
  {
    name: "list_tweets",
    description: "List recent thoughts/tweets from the timeline",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max results (default 10, max 50)" } },
    },
  },
  {
    name: "delete_tweet",
    description: "Delete a tweet by ID",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Tweet UUID" } },
      required: ["id"],
    },
  },
  {
    name: "query_content",
    description: "Query news, research, or skills from Sanity CMS",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["newsPost", "researchArticle", "skill"], description: "Content type" },
        published_only: { type: "boolean", description: "Only published (default true)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["type"],
    },
  },
  {
    name: "get_stats",
    description: "Get content statistics",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── MCP Tool Handlers ──────────────────────────────────────────────────
async function handleTool(name: string, args: any, user: { email: string; userId: string }): Promise<any[]> {
  const sb = adminClient();

  switch (name) {
    case "post_tweet": {
      const { error } = await sb.from("tweets").insert({
        content: (args.content || "").slice(0, 500),
        author_name: user.email.split("@")[0],
        author_email: user.email,
      });
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: "✓ Thought posted." }];
    }
    case "list_tweets": {
      const { data, error } = await sb.from("tweets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Math.min(args.limit || 10, 50));
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No tweets yet." }];
      const out = data.map((t: any) => `[${t.id}] ${t.created_at} — ${t.author_name || "anon"}: ${t.content}`).join("\n\n");
      return [{ type: "text", text: out }];
    }
    case "delete_tweet": {
      const { error } = await sb.from("tweets").delete().eq("id", args.id);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: "✓ Deleted." }];
    }
    case "query_content": {
      const filter = (args.published_only !== false && args.type !== "skill") ? " && published == true" : "";
      const n = Math.min(args.limit || 10, 50);
      const query = `*[_type == "${args.type}"${filter}] | order(_createdAt desc)[0...${n}]`;
      const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const json = await res.json();
      return [{ type: "text", text: JSON.stringify(json.result, null, 2) }];
    }
    case "get_stats": {
      const { count } = await sb.from("tweets").select("*", { count: "exact", head: true });
      const sq = encodeURIComponent(`{"news":count(*[_type=="newsPost"]),"publishedNews":count(*[_type=="newsPost"&&published==true]),"research":count(*[_type=="researchArticle"]),"skills":count(*[_type=="skill"])}`);
      const res = await fetch(`https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${sq}`);
      const sd = await res.json();
      return [{ type: "text", text: JSON.stringify({ tweets: count || 0, ...(sd.result || {}) }, null, 2) }];
    }
    default:
      return [{ type: "text", text: `Unknown tool: ${name}` }];
  }
}

// ── MCP JSON-RPC Handler ───────────────────────────────────────────────
// GET /mcp — SSE endpoint (required by Streamable HTTP transport)
app.get("/mcp", async (c) => {
  const user = await validateToken(c.req.raw);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${baseUrl()}/.well-known/oauth-protected-resource", scope="mcp:tools"`,
        "Content-Type": "application/json",
      },
    });
  }
  // Return 200 with SSE headers but no events (server-initiated notifications not used)
  return new Response("", {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
});

// DELETE /mcp — session termination
app.delete("/mcp", (c) => new Response(null, { status: 204 }));

app.post("/mcp", async (c) => {
  const user = await validateToken(c.req.raw);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${baseUrl()}/.well-known/oauth-protected-resource", scope="mcp:tools"`,
        "Content-Type": "application/json",
      },
    });
  }

  const body = await c.req.json();
  const { jsonrpc, id, method, params } = body;

  let result: any;

  switch (method) {
    case "initialize":
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "astar-mcp", version: "1.0.0" },
      };
      break;

    case "notifications/initialized":
      return new Response(null, { status: 202 });

    case "tools/list":
      result = { tools: TOOLS };
      break;

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const content = await handleTool(toolName, toolArgs, user);
      result = { content, isError: content[0]?.text?.startsWith("Error") };
      break;
    }

    case "ping":
      result = {};
      break;

    default:
      return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }

  return c.json({ jsonrpc: "2.0", id, result });
});

// ── Health check ───────────────────────────────────────────────────────
app.get("/", (c) => c.json({ status: "ok", name: "astar-mcp", version: "1.0.0" }));

Deno.serve(app.fetch);
