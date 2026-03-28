import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const app = new Hono();

// ── Config ──────────────────────────────────────────────────────────────
const TENANT_ID = "d6af3688-b659-4f90-b701-35246b209b9d";
const MS_AUTHORIZE = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const MS_TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const SANITY_PROJECT_ID = "fkqm34od";
const SANITY_DATASET = "production";

function getEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`${key} is not configured`);
  return v;
}

function getBaseUrl(): string {
  return `${getEnv("SUPABASE_URL")}/functions/v1/mcp-server`;
}

function supabaseAdmin() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Helper: validate bearer token ──────────────────────────────────────
async function validateToken(req: Request): Promise<{ email: string; userId: string } | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("mcp_sessions")
    .select("user_email, user_id")
    .eq("access_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return { email: data.user_email, userId: data.user_id };
}

// ── OAuth: Protected Resource Metadata (RFC 9728) ──────────────────────
app.get("/.well-known/oauth-protected-resource", (c) => {
  const base = getBaseUrl();
  return c.json({
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
  });
});

// ── OAuth: Authorization Server Metadata ───────────────────────────────
app.get("/.well-known/oauth-authorization-server", (c) => {
  const base = getBaseUrl();
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// ── OAuth: Dynamic Client Registration (MCP requires this) ────────────
app.post("/register", async (c) => {
  const body = await c.req.json();
  // MCP clients register dynamically; we just echo back with a generated client_id
  const clientId = crypto.randomUUID();
  return c.json({
    client_id: clientId,
    client_name: body.client_name || "MCP Client",
    redirect_uris: body.redirect_uris || [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, 201);
});

// ── OAuth: Authorize (redirects to Microsoft) ──────────────────────────
app.get("/authorize", async (c) => {
  const clientRedirectUri = c.req.query("redirect_uri");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method") || "S256";
  const clientState = c.req.query("state") || "";

  if (!clientRedirectUri) {
    return c.json({ error: "redirect_uri is required" }, 400);
  }

  // Generate our own state that wraps the client's info
  const internalState = btoa(JSON.stringify({
    client_redirect_uri: clientRedirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    client_state: clientState,
    nonce: crypto.randomUUID(),
  }));

  // Store in DB
  const sb = supabaseAdmin();
  await sb.from("mcp_sessions").insert({
    state: internalState,
    client_redirect_uri: clientRedirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  });

  const CLIENT_ID = getEnv("AZURE_CLIENT_ID");
  const FUNCTION_BASE = getBaseUrl();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: `${FUNCTION_BASE}/callback`,
    scope: "openid email profile",
    response_mode: "query",
    state: internalState,
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
    return c.json({ error: msError || "Missing code or state" }, 400);
  }

  // Look up our session
  const sb = supabaseAdmin();
  const { data: session } = await sb.from("mcp_sessions")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (!session) {
    return c.json({ error: "Invalid state" }, 400);
  }

  // Exchange Microsoft code for tokens
  const CLIENT_ID = getEnv("AZURE_CLIENT_ID");
  const CLIENT_SECRET = getEnv("AZURE_CLIENT_SECRET");
  const FUNCTION_BASE = getBaseUrl();

  const tokenResponse = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: msCode,
      redirect_uri: `${FUNCTION_BASE}/callback`,
      grant_type: "authorization_code",
      scope: "openid email profile",
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    console.error("MS token exchange failed:", tokenData);
    return c.json({ error: "Token exchange failed" }, 500);
  }

  // Decode ID token
  const payload = JSON.parse(atob(tokenData.id_token.split(".")[1]));
  const email = payload.email || payload.preferred_username;
  const name = payload.name || "";

  if (!email?.endsWith("@astarconsulting.no")) {
    const redirectUrl = new URL(session.client_redirect_uri);
    redirectUrl.searchParams.set("error", "access_denied");
    redirectUrl.searchParams.set("error_description", "Only @astarconsulting.no accounts allowed");
    return c.redirect(redirectUrl.toString());
  }

  // Generate our own auth code for the MCP client
  const authCode = crypto.randomUUID();

  // Find or create user ID (reuse existing logic)
  const { data: existingUsers } = await sb.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u: any) => u.email === email);
  let userId = existingUser?.id;

  if (!userId) {
    const { data: newUser } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    userId = newUser?.user?.id;
  }

  // Update session with auth code and user info
  await sb.from("mcp_sessions")
    .update({
      auth_code: authCode,
      user_email: email,
      user_id: userId,
    })
    .eq("id", session.id);

  // Redirect back to Claude Desktop's callback with the auth code
  const redirectUrl = new URL(session.client_redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  if (session.state) {
    // Parse and return the original client state
    try {
      const parsed = JSON.parse(atob(session.state));
      if (parsed.client_state) {
        redirectUrl.searchParams.set("state", parsed.client_state);
      }
    } catch { /* ignore */ }
  }

  return c.redirect(redirectUrl.toString());
});

// ── OAuth: Token Endpoint ──────────────────────────────────────────────
app.post("/token", async (c) => {
  const body = await c.req.parseBody();
  const grantType = body.grant_type as string;
  const code = body.code as string;
  const codeVerifier = body.code_verifier as string;

  if (grantType !== "authorization_code" || !code) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  const sb = supabaseAdmin();
  const { data: session } = await sb.from("mcp_sessions")
    .select("*")
    .eq("auth_code", code)
    .maybeSingle();

  if (!session) {
    return c.json({ error: "invalid_grant", error_description: "Invalid auth code" }, 400);
  }

  // Verify PKCE if code_challenge was provided
  if (session.code_challenge && codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const computed = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (computed !== session.code_challenge) {
      return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }
  }

  // Generate access token
  const accessToken = crypto.randomUUID();

  await sb.from("mcp_sessions")
    .update({
      access_token: accessToken,
      auth_code: null, // Invalidate the auth code
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", session.id);

  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 30 * 24 * 60 * 60,
  });
});

// ── MCP Server Setup ───────────────────────────────────────────────────
const mcpServer = new McpServer({
  name: "astar-mcp",
  version: "1.0.0",
});

// Tool: Post a tweet
mcpServer.tool({
  name: "post_tweet",
  description: "Post a new thought/tweet to the astar.sh timeline",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "The thought/tweet content (max 500 chars)" },
    },
    required: ["content"],
  },
  handler: async ({ content }, extra) => {
    const user = (extra as any)?._user;
    if (!user) return { content: [{ type: "text", text: "Error: Not authenticated" }] };

    const sb = supabaseAdmin();
    const { error } = await sb.from("tweets").insert({
      content: content.slice(0, 500),
      author_name: user.email.split("@")[0],
      author_email: user.email,
    });

    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: "✓ Thought posted to the timeline." }] };
  },
});

// Tool: List tweets
mcpServer.tool({
  name: "list_tweets",
  description: "List recent thoughts/tweets from the astar.sh timeline",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Number of tweets to return (default 10, max 50)" },
    },
  },
  handler: async ({ limit }) => {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("tweets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit || 10, 50));

    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!data?.length) return { content: [{ type: "text", text: "No tweets yet." }] };

    const formatted = data.map((t: any) =>
      `[${t.created_at}] ${t.author_name || "anon"}: ${t.content}`
    ).join("\n\n");

    return { content: [{ type: "text", text: formatted }] };
  },
});

// Tool: Delete a tweet
mcpServer.tool({
  name: "delete_tweet",
  description: "Delete a tweet by its ID",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The UUID of the tweet to delete" },
    },
    required: ["id"],
  },
  handler: async ({ id }, extra) => {
    const user = (extra as any)?._user;
    if (!user) return { content: [{ type: "text", text: "Error: Not authenticated" }] };

    const sb = supabaseAdmin();
    const { error } = await sb.from("tweets").delete().eq("id", id);
    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: "✓ Tweet deleted." }] };
  },
});

// Tool: Query Sanity content
mcpServer.tool({
  name: "query_content",
  description: "Query news posts, research articles, or skills from the Sanity CMS. Use GROQ query syntax.",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["newsPost", "researchArticle", "skill"],
        description: "Content type to query",
      },
      published_only: { type: "boolean", description: "Only return published items (default true)" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: ["type"],
  },
  handler: async ({ type, published_only, limit }) => {
    const publishedFilter = (published_only !== false && type !== "skill")
      ? ' && published == true'
      : '';
    const n = Math.min(limit || 10, 50);
    const query = `*[_type == "${type}"${publishedFilter}] | order(_createdAt desc)[0...${n}]`;

    const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok) return { content: [{ type: "text", text: `Sanity error: ${JSON.stringify(json)}` }] };

    return { content: [{ type: "text", text: JSON.stringify(json.result, null, 2) }] };
  },
});

// Tool: Get stats
mcpServer.tool({
  name: "get_stats",
  description: "Get content statistics: tweet count and Sanity content counts",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const sb = supabaseAdmin();
    const { count: tweetCount } = await sb.from("tweets").select("*", { count: "exact", head: true });

    // Query Sanity for content counts
    const sanityQuery = encodeURIComponent(`{
      "news": count(*[_type == "newsPost"]),
      "publishedNews": count(*[_type == "newsPost" && published == true]),
      "research": count(*[_type == "researchArticle"]),
      "publishedResearch": count(*[_type == "researchArticle" && published == true]),
      "skills": count(*[_type == "skill"])
    }`);
    const sanityUrl = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${sanityQuery}`;
    const sanityRes = await fetch(sanityUrl);
    const sanityData = await sanityRes.json();

    const stats = {
      tweets: tweetCount || 0,
      ...((sanityRes.ok && sanityData.result) || {}),
    };

    return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
  },
});

// ── MCP Endpoint (with auth) ───────────────────────────────────────────
const transport = new StreamableHttpTransport();

app.all("/mcp", async (c) => {
  const user = await validateToken(c.req.raw);
  if (!user) {
    const base = getBaseUrl();
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
        "Content-Type": "application/json",
      },
    });
  }

  // Inject user context into the handler
  // Note: mcp-lite doesn't have built-in user context, so we pass via a workaround
  (mcpServer as any)._currentUser = user;

  // Patch tool handlers to receive user
  const originalHandleRequest = transport.handleRequest.bind(transport);
  return await originalHandleRequest(c.req.raw, mcpServer);
});

// ── CORS preflight ─────────────────────────────────────────────────────
app.options("*", (c) => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    },
  });
});

Deno.serve(app.fetch);
