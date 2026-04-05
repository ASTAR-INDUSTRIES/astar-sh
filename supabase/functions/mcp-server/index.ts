import { Hono } from "jsr:@hono/hono@^4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const app = new Hono().basePath("/mcp-server");

// ── Config ──────────────────────────────────────────────────────────────
const TENANT_ID = "d6af3688-b659-4f90-b701-35246b209b9d";
const MS_AUTHORIZE = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const MS_TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const SANITY_PROJECT_ID = "fkqm34od";
const SANITY_DATASET = "production";
const SANITY_API = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01`;

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

const TOOL_SCOPES: Record<string, string> = {
  post_tweet: "tweet.post", list_tweets: "tweet.read", delete_tweet: "tweet.delete", react_to_tweet: "tweet.write",
  query_content: "content.read", get_stats: "content.read",
  create_skill: "skill.create", update_skill: "skill.write", delete_skill: "skill.delete", list_skills: "skill.read", get_skill: "skill.read", upload_skill_file: "skill.write", delete_skill_file: "skill.delete", get_skill_history: "skill.read",
  create_news: "news.create", update_news: "news.write", delete_news: "news.delete", list_news: "news.read",
  submit_feedback: "feedback.write", list_feedback: "feedback.read", update_feedback: "feedback.write",
  create_milestone: "milestone.create", list_milestones: "milestone.read",
  ask_agent: "inbox.write", list_inbox: "inbox.read", read_inbox: "inbox.read", respond_inbox: "inbox.respond",
  submit_inquiry: "inbox.write", list_own_inquiries: "inbox.read", list_pending_inquiries: "inbox.read", respond_inquiry: "inbox.respond",
  create_task: "task.create", update_task: "task.write", complete_task: "task.write", list_tasks: "task.read", get_task: "task.read", comment_task: "task.write", link_task: "task.write", triage_tasks: "task.read", accept_task: "task.write", dismiss_task: "task.write", get_velocity: "task.read", suggest_next_task: "task.read",
  query_audit: "audit.read",
  list_agents: "agent.read", get_agent: "agent.read", register_agent: "agent.create",
};

function sanityToken(): string {
  return env("SANITY_API_TOKEN");
}

// ── Hashing helper ─────────────────────────────────────────────────────
async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Auth helper ────────────────────────────────────────────────────────
async function validateToken(req: Request): Promise<{ email: string; userId: string } | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const tokenHash = await sha256Hex(token);
  const sb = adminClient();
  const { data } = await sb.from("mcp_sessions")
    .select("user_email, user_id")
    .eq("access_token", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return { email: data.user_email, userId: data.user_id };
}

// ── Sanity Mutate Helper ──────────────────────────────────────────────
async function sanityMutate(mutations: any[]) {
  const res = await fetch(`${SANITY_API}/data/mutate/${SANITY_DATASET}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sanityToken()}`,
    },
    body: JSON.stringify({ mutations }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function sanityQuery(query: string, params?: Record<string, any>) {
  const url = new URL(`${SANITY_API}/data/query/${SANITY_DATASET}`);
  url.searchParams.set("query", query);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(`$${k}`, JSON.stringify(v));
    }
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  return json.result;
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

  const { data: users } = await sb.auth.admin.listUsers();
  let userId = users?.users?.find((u: any) => u.email === email)?.id;
  if (!userId) {
    const { data: nu } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: payload.name || "" } });
    userId = nu?.user?.id;
  }

  const authCode = crypto.randomUUID();
  const authCodeHash = await sha256Hex(authCode);
  await sb.from("mcp_sessions").update({ auth_code: authCodeHash, user_email: email, user_id: userId }).eq("id", session.id);

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
  const codeHash = await sha256Hex(code);
  const { data: session } = await sb.from("mcp_sessions").select("*").eq("auth_code", codeHash).maybeSingle();
  if (!session) return c.json({ error: "invalid_grant" }, 400);

  if (session.code_challenge && codeVerifier) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const computed = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (computed !== session.code_challenge) {
      return c.json({ error: "invalid_grant", error_description: "PKCE failed" }, 400);
    }
  }

  const accessToken = crypto.randomUUID();
  const accessTokenHash = await sha256Hex(accessToken);
  await sb.from("mcp_sessions").update({
    access_token: accessTokenHash,
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
  // ── Skills Tools ─────────────────────────────────────────────────────
  {
    name: "create_skill",
    description: "Create a new knowledge skill document",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Skill title" },
        slug: { type: "string", description: "URL-friendly slug (auto-generated from title if omitted)" },
        description: { type: "string", description: "Short description" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        content: { type: "string", description: "Main skill content in Markdown" },
        published: { type: "boolean", description: "Publish immediately (default false)" },
        references: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string" },
              folder: { type: "string" },
              content: { type: "string" },
            },
            required: ["filename", "content"],
          },
          description: "Reference files to attach",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_skill",
    description: "Update an existing knowledge skill by slug or ID",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Skill slug (use this or id)" },
        id: { type: "string", description: "Skill document ID (use this or slug)" },
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        content: { type: "string", description: "Updated Markdown content" },
        published: { type: "boolean" },
      },
    },
  },
  {
    name: "delete_skill",
    description: "Delete a knowledge skill by slug or ID",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        id: { type: "string" },
      },
    },
  },
  {
    name: "list_skills",
    description: "List/search knowledge skills",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text (matches title, description, tags)" },
        published_only: { type: "boolean", description: "Only published (default false)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_skill",
    description: "Get a single knowledge skill with all content and references",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        id: { type: "string" },
      },
    },
  },
  {
    name: "upload_skill_file",
    description: "Add a reference file to a skill",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Skill slug (use this or skill_id)" },
        skill_id: { type: "string", description: "Skill document ID" },
        filename: { type: "string", description: "File name e.g. overview.md" },
        folder: { type: "string", description: "Folder name e.g. references" },
        content: { type: "string", description: "File content (Markdown)" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "delete_skill_file",
    description: "Remove a reference file from a skill by filename",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        skill_id: { type: "string" },
        filename: { type: "string", description: "Filename to remove" },
      },
      required: ["filename"],
    },
  },
  {
    name: "get_skill_history",
    description: "Get revision history for a skill (audit trail)",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        id: { type: "string" },
      },
    },
  },
  // ── News Tools ──────────────────────────────────────────────────────
  {
    name: "create_news",
    description: "Create an intelligence briefing on astar.sh — cross-referenced from multiple sources with perspective analysis",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Factual, descriptive headline (max 60 chars, no clickbait)" },
        slug: { type: "string", description: "URL slug (auto-generated from title if omitted)" },
        excerpt: { type: "string", description: "1-2 sentence factual summary" },
        content: { type: "string", description: "Full article body in Markdown" },
        category: { type: "string", description: "Category: infrastructure, models, engineering, economics, policy, security" },
        cover_image: { type: "string", description: "URL to cover image" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Source name (e.g. Reuters, Fortune, Shifter)" },
              region: { type: "string", description: "Region: US, EU, NO, UK, Intl" },
              url: { type: "string", description: "Article URL" },
              perspective: { type: "string", description: "How this source frames the story" },
            },
            required: ["name", "url"],
          },
          description: "Cross-referenced sources with their perspectives",
        },
        consensus: { type: "array", items: { type: "string" }, description: "Points where all sources agree" },
        divergence: { type: "array", items: { type: "string" }, description: "Points where sources disagree or frame differently" },
        takeaway: { type: "string", description: "Astar-specific actionable insight for the team" },
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Company or org name (e.g. Anthropic, OpenAI)" },
              domain: { type: "string", description: "Website domain for logo (e.g. anthropic.com)" },
            },
            required: ["name", "domain"],
          },
          description: "Primary companies/orgs — used for logo display",
        },
        continues: { type: "string", description: "Slug of previous article this is a follow-up to" },
        author_name: { type: "string", description: "Author display name (defaults to your name)" },
        published: { type: "boolean", description: "Publish immediately (default true)" },
      },
      required: ["title", "content", "sources"],
    },
  },
  {
    name: "update_news",
    description: "Update an existing news post by slug or ID",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        id: { type: "string" },
        title: { type: "string" },
        excerpt: { type: "string" },
        content: { type: "string" },
        category: { type: "string" },
        cover_image: { type: "string" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" }, region: { type: "string" },
              url: { type: "string" }, perspective: { type: "string" },
            },
            required: ["name", "url"],
          },
        },
        consensus: { type: "array", items: { type: "string" } },
        divergence: { type: "array", items: { type: "string" } },
        takeaway: { type: "string" },
        author_name: { type: "string" },
        published: { type: "boolean" },
      },
    },
  },
  {
    name: "delete_news",
    description: "Delete a news post by slug or ID",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        id: { type: "string" },
      },
    },
  },
  {
    name: "list_news",
    description: "List news posts from astar.sh",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category" },
        published_only: { type: "boolean", description: "Only published (default true)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  // ── Reaction Tools ─────────────────────────────────────────────────
  {
    name: "react_to_tweet",
    description: "Add an emoji reaction to a tweet/thought on the timeline",
    inputSchema: {
      type: "object",
      properties: {
        tweet_id: { type: "string", description: "UUID of the tweet to react to" },
        emoji: { type: "string", description: "Emoji character (e.g. 🔥 👏 🧠 💡 🎯)" },
      },
      required: ["tweet_id", "emoji"],
    },
  },
  // ── Feedback Tools ──────────────────────────────────────────────────
  {
    name: "submit_feedback",
    description: "Submit feedback about astar.sh — bugs, feature requests, pain points, or praise",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "What's the feedback?" },
        type: { type: "string", enum: ["bug", "feature", "pain", "praise"], description: "Type of feedback" },
        linked_skill: { type: "string", description: "Slug of related skill (if any)" },
        linked_news: { type: "string", description: "Slug of related news post (if any)" },
      },
      required: ["content"],
    },
  },
  {
    name: "list_feedback",
    description: "List feedback submitted to astar.sh",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["new", "accepted", "rejected", "done"], description: "Filter by status" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "update_feedback",
    description: "Update a feedback item's status (close, accept, reject)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Feedback UUID" },
        status: { type: "string", enum: ["accepted", "rejected", "done"], description: "New status" },
        resolution: { type: "string", description: "Resolution note (what was done)" },
      },
      required: ["id", "status"],
    },
  },
  // ── Milestone Tools ─────────────────────────────────────────────────
  {
    name: "create_milestone",
    description: "Log a shipped milestone on the Astar calendar",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What was shipped?" },
        category: { type: "string", enum: ["general", "contract", "technical", "product", "team"], description: "Category (default: general)" },
        date: { type: "string", description: "Date (YYYY-MM-DD, default: today)" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_milestones",
    description: "List shipped milestones from the Astar calendar",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "Filter by month (YYYY-MM)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  // ── Agent Inbox Tools ───────────────────────────────────────────────
  {
    name: "ask_agent",
    description: "Send a message to any agent's inbox — log hours, ask questions, request reviews",
    inputSchema: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Agent slug (e.g. cfa, clo, newsbot)" },
        content: { type: "string", description: "Your message to the agent" },
        type: { type: "string", enum: ["action", "question", "review"], description: "Message type (auto-inferred if omitted)" },
      },
      required: ["agent_slug", "content"],
    },
  },
  {
    name: "list_inbox",
    description: "Check your messages to a specific agent and their responses",
    inputSchema: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Agent slug" },
        status: { type: "string", enum: ["pending", "processing", "completed", "failed"], description: "Filter by status" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["agent_slug"],
    },
  },
  {
    name: "read_inbox",
    description: "Agent: read unclaimed messages from your inbox queue",
    inputSchema: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Agent slug to read inbox for" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["agent_slug"],
    },
  },
  {
    name: "respond_inbox",
    description: "Agent: respond to an inbox message",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message UUID" },
        response: { type: "string", description: "The response to the sender" },
        status: { type: "string", enum: ["completed", "failed"], description: "Outcome" },
      },
      required: ["id", "response", "status"],
    },
  },
  // ── Legacy CFA aliases ────────────────────────────────────────────
  {
    name: "submit_inquiry",
    description: "[Alias] Submit a financial inquiry to the CFA — use ask_agent instead",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "What do you need?" },
        type: { type: "string", enum: ["log_hours", "question", "expense"], description: "Type of inquiry" },
      },
      required: ["content"],
    },
  },
  {
    name: "list_own_inquiries",
    description: "[Alias] Check your CFA inquiries — use list_inbox instead",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "list_pending_inquiries",
    description: "[Alias] CFA: read queue — use read_inbox instead",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "respond_inquiry",
    description: "[Alias] CFA: respond — use respond_inbox instead",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        response: { type: "string" },
        status: { type: "string", enum: ["completed", "failed"] },
      },
      required: ["id", "response", "status"],
    },
  },
  // ── Task Tools ──────────────────────────────────────────────────────
  {
    name: "create_task",
    description: "Create a task for yourself or a colleague",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Details" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Priority (default: medium)" },
        assigned_to: { type: "string", description: "Email of assignee (default: yourself)" },
        due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        parent_task_number: { type: "number", description: "Parent task number (creates subtask)" },
        estimated_hours: { type: "number", description: "Estimated hours" },
        recurring: { type: "string", enum: ["weekly", "monthly", "quarterly"], description: "Recurring interval" },
        links: { type: "array", items: { type: "object", properties: { type: { type: "string" }, ref: { type: "string" } }, required: ["type", "ref"] }, description: "Links to skills, news, URLs" },
        visibility: { type: "string", enum: ["private", "team", "public"], description: "Task visibility (default: private)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update a task's status, priority, assignee, or details",
    inputSchema: {
      type: "object",
      properties: {
        task_number: { type: "number", description: "Task number (e.g. 1, 2, 3)" },
        status: { type: "string", enum: ["open", "in_progress", "completed", "blocked", "cancelled"] },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        assigned_to: { type: "string", description: "Email of new assignee" },
        due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
        description: { type: "string" },
        visibility: { type: "string", enum: ["private", "team", "public"], description: "Task visibility" },
        reason: { type: "string", description: "Why this change is being made (for audit trail)" },
      },
      required: ["task_number"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed — confirm with the user before calling this",
    inputSchema: {
      type: "object",
      properties: {
        task_number: { type: "number", description: "Task number" },
        reason: { type: "string", description: "Why this task is being completed (for audit trail)" },
      },
      required: ["task_number"],
    },
  },
  {
    name: "list_tasks",
    description: "List tasks with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        assigned_to: { type: "string", description: "Email filter, or 'all' for everyone" },
        status: { type: "string", enum: ["open", "in_progress", "completed", "blocked", "cancelled"] },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        search: { type: "string", description: "Search title/description" },
        limit: { type: "number", description: "Max results (default 20)" },
        include_all: { type: "boolean", description: "Include all tasks regardless of visibility (admin only)" },
      },
    },
  },
  {
    name: "get_task",
    description: "Get full task details and activity log",
    inputSchema: {
      type: "object",
      properties: {
        task_number: { type: "number", description: "Task number" },
      },
      required: ["task_number"],
    },
  },
  {
    name: "comment_task",
    description: "Add a comment or note to a task",
    inputSchema: {
      type: "object",
      properties: {
        task_number: { type: "number", description: "Task number" },
        comment: { type: "string", description: "Comment text" },
        reason: { type: "string", description: "Context for this comment (for audit trail)" },
      },
      required: ["task_number", "comment"],
    },
  },
  {
    name: "link_task",
    description: "Link a task to a skill, news post, feedback, URL, or another task",
    inputSchema: {
      type: "object",
      properties: {
        task_number: { type: "number", description: "Task number" },
        link_type: { type: "string", enum: ["skill", "news", "feedback", "url", "milestone", "task"], description: "Link type" },
        link_ref: { type: "string", description: "Slug, URL, or ID to link to" },
      },
      required: ["task_number", "link_type", "link_ref"],
    },
  },
  {
    name: "triage_tasks",
    description: "List agent-created tasks that need triage (accept or dismiss)",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "accept_task",
    description: "Accept an agent-created task into the main task list",
    inputSchema: {
      type: "object",
      properties: {
        task_number: { type: "number" },
        reason: { type: "string", description: "Why this task is being accepted (for audit trail)" },
      },
      required: ["task_number"],
    },
  },
  {
    name: "dismiss_task",
    description: "Dismiss an agent-created task",
    inputSchema: {
      type: "object",
      properties: {
        task_number: { type: "number" },
        reason: { type: "string", description: "Why dismissed" },
      },
      required: ["task_number"],
    },
  },
  {
    name: "get_velocity",
    description: "Get task completion velocity stats — how productive is the team",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["week", "month"], description: "Time period (default: week)" },
        assigned_to: { type: "string", description: "Filter by assignee email" },
      },
    },
  },
  {
    name: "suggest_next_task",
    description: "Get the top priority task to work on next, with reasoning",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "query_audit",
    description: "Query the audit trail — who did what, when, how, and why. Use to trace actions, investigate changes, or understand event chains.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: { type: "string", description: "Filter: task, skill, news, feedback, inquiry, milestone" },
        entity_id: { type: "string", description: "Filter by entity ID (task number, slug, etc.)" },
        actor_email: { type: "string", description: "Filter by actor email" },
        actor_agent_id: { type: "string", description: "Filter by agent ID (e.g. 'cfa')" },
        channel: { type: "string", enum: ["cli", "mcp", "api", "dashboard", "system"], description: "Filter by channel" },
        action: { type: "string", description: "Filter by action (created, completed, etc.)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  // ── Agent Tools ──────────────────────────────────────────────────────
  {
    name: "list_agents",
    description: "List all registered agents with status and last seen",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "paused", "retired"] },
      },
    },
  },
  {
    name: "get_agent",
    description: "Get detailed info about a specific agent",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Agent slug (e.g. cfa, clo)" } },
      required: ["slug"],
    },
  },
  {
    name: "register_agent",
    description: "Register a new agent in the system",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Unique slug (e.g. cfa, clo, marketing)" },
        name: { type: "string", description: "Display name" },
        owner: { type: "string", description: "Owner email" },
        email: { type: "string", description: "Agent's Microsoft email" },
        skill_slug: { type: "string", description: "Skill that defines behavior" },
        scopes: { type: "array", items: { type: "string" }, description: "Allowed tool scopes" },
        machine: { type: "string", description: "Machine the agent runs on" },
      },
      required: ["slug", "name"],
    },
  },
];

// ── News Helper: resolve slug to ID ──────────────────────────────────
async function resolveNewsId(args: { slug?: string; id?: string }): Promise<string | null> {
  if (args.id) return args.id;
  if (!args.slug) return null;
  const result = await sanityQuery(
    `*[_type == "newsPost" && slug.current == $slug][0]{ _id }`,
    { slug: args.slug }
  );
  return result?._id || null;
}

// ── Skill Helper: resolve slug to ID ──────────────────────────────────
async function resolveSkillId(args: { slug?: string; id?: string; skill_id?: string }): Promise<string | null> {
  if (args.id) return args.id;
  if (args.skill_id) return args.skill_id;
  if (!args.slug) return null;
  const result = await sanityQuery(
    `*[_type == "knowledgeSkill" && slug.current == $slug][0]{ _id }`,
    { slug: args.slug }
  );
  return result?._id || null;
}

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── MCP Tool Handlers ──────────────────────────────────────────────────
async function handleTool(name: string, args: any, user: { email: string; userId: string }): Promise<any[]> {
  const sb = adminClient();

  const { data: callerAgent } = await sb.from("agents").select("slug, scopes, status").eq("email", user.email).maybeSingle();
  if (callerAgent) {
    const required = TOOL_SCOPES[name];
    if (required && !callerAgent.scopes?.includes(required)) {
      await sb.from("audit_events").insert({
        actor_email: user.email, actor_type: "agent", actor_agent_id: callerAgent.slug,
        entity_type: "tool", entity_id: name, action: "scope_denied",
        channel: "mcp", state_after: { required_scope: required, agent_scopes: callerAgent.scopes },
      });
      return [{ type: "text", text: `Denied: agent '${callerAgent.slug}' lacks scope '${required}' for tool '${name}'` }];
    }
  }

  const actorType = callerAgent ? "agent" : "human";
  const actorAgentId = callerAgent?.slug || null;

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
      const result = await sanityQuery(query);
      return [{ type: "text", text: JSON.stringify(result, null, 2) }];
    }
    case "get_stats": {
      const { count } = await sb.from("tweets").select("*", { count: "exact", head: true });
      const result = await sanityQuery(`{"news":count(*[_type=="newsPost"]),"publishedNews":count(*[_type=="newsPost"&&published==true]),"research":count(*[_type=="researchArticle"]),"skills":count(*[_type=="knowledgeSkill"]),"publishedSkills":count(*[_type=="knowledgeSkill"&&published==true])}`);
      return [{ type: "text", text: JSON.stringify({ tweets: count || 0, ...(result || {}) }, null, 2) }];
    }

    // ── Skills CRUD ──────────────────────────────────────────────────
    case "create_skill": {
      const slug = args.slug || toSlug(args.title);
      const docId = `knowledgeSkill-${slug}`;
      const refs = (args.references || []).map((r: any) => ({
        _type: "referenceFile",
        _key: crypto.randomUUID().slice(0, 8),
        filename: r.filename,
        folder: r.folder || "",
        content: r.content,
      }));
      const doc: any = {
        _id: docId,
        _type: "knowledgeSkill",
        title: args.title,
        slug: { _type: "slug", current: slug },
        description: args.description || "",
        tags: args.tags || [],
        markdownContent: args.content,
        published: args.published || false,
        author: user.email,
        references: refs,
      };
      await sanityMutate([{ createOrReplace: doc }]);
      return [{ type: "text", text: `✓ Skill "${args.title}" created (slug: ${slug}).` }];
    }

    case "update_skill": {
      const docId = await resolveSkillId(args);
      if (!docId) return [{ type: "text", text: "Error: Skill not found. Provide slug or id." }];
      const patch: any = {};
      if (args.title !== undefined) patch.title = args.title;
      if (args.description !== undefined) patch.description = args.description;
      if (args.tags !== undefined) patch.tags = args.tags;
      if (args.content !== undefined) patch.markdownContent = args.content;
      if (args.published !== undefined) patch.published = args.published;
      if (Object.keys(patch).length === 0) return [{ type: "text", text: "No fields to update." }];
      await sanityMutate([{ patch: { id: docId, set: patch } }]);
      return [{ type: "text", text: `✓ Skill updated.` }];
    }

    case "delete_skill": {
      const docId = await resolveSkillId(args);
      if (!docId) return [{ type: "text", text: "Error: Skill not found." }];
      await sanityMutate([{ delete: { id: docId } }]);
      return [{ type: "text", text: `✓ Skill deleted.` }];
    }

    case "list_skills": {
      const pubFilter = args.published_only ? " && published == true" : "";
      const searchFilter = args.query
        ? ` && (title match $q || description match $q || $q in tags)`
        : "";
      const n = Math.min(args.limit || 20, 50);
      const q = `*[_type == "knowledgeSkill"${pubFilter}${searchFilter}] | order(_updatedAt desc)[0...${n}]{ _id, title, "slug": slug.current, description, tags, published, author, _updatedAt }`;
      const result = await sanityQuery(q, args.query ? { q: `${args.query}*` } : undefined);
      if (!result?.length) return [{ type: "text", text: "No skills found." }];
      return [{ type: "text", text: JSON.stringify(result, null, 2) }];
    }

    case "get_skill": {
      const docId = await resolveSkillId(args);
      if (!docId) return [{ type: "text", text: "Error: Skill not found." }];
      const result = await sanityQuery(
        `*[_type == "knowledgeSkill" && _id == $id][0]`,
        { id: docId }
      );
      if (!result) return [{ type: "text", text: "Skill not found." }];
      return [{ type: "text", text: JSON.stringify(result, null, 2) }];
    }

    case "upload_skill_file": {
      const docId = await resolveSkillId(args);
      if (!docId) return [{ type: "text", text: "Error: Skill not found." }];
      const fileItem = {
        _type: "referenceFile",
        _key: crypto.randomUUID().slice(0, 8),
        filename: args.filename,
        folder: args.folder || "",
        content: args.content,
      };
      await sanityMutate([{
        patch: {
          id: docId,
          setIfMissing: { references: [] },
          insert: { after: "references[-1]", items: [fileItem] },
        },
      }]);
      return [{ type: "text", text: `✓ File "${args.filename}" added.` }];
    }

    case "delete_skill_file": {
      const docId = await resolveSkillId(args);
      if (!docId) return [{ type: "text", text: "Error: Skill not found." }];
      // Get current references to find the key
      const skill = await sanityQuery(
        `*[_type == "knowledgeSkill" && _id == $id][0]{ references }`,
        { id: docId }
      );
      const ref = skill?.references?.find((r: any) => r.filename === args.filename);
      if (!ref) return [{ type: "text", text: `File "${args.filename}" not found.` }];
      await sanityMutate([{
        patch: {
          id: docId,
          unset: [`references[_key=="${ref._key}"]`],
        },
      }]);
      return [{ type: "text", text: `✓ File "${args.filename}" removed.` }];
    }

    case "get_skill_history": {
      const docId = await resolveSkillId(args);
      if (!docId) return [{ type: "text", text: "Error: Skill not found." }];
      try {
        const res = await fetch(
          `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/history/${SANITY_DATASET}/transactions/${docId}?excludeContent=true`,
          { headers: { Authorization: `Bearer ${sanityToken()}` } }
        );
        const text = await res.text();
        // NDJSON response
        const transactions = text.trim().split("\n").filter(Boolean).map((line: string) => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean).slice(0, 20);
        if (!transactions.length) return [{ type: "text", text: "No history found." }];
        const summary = transactions.map((t: any) =>
          `${t.timestamp} — ${t.author} — ${t.mutations?.map((m: any) => Object.keys(m)[0]).join(", ") || "change"}`
        ).join("\n");
        return [{ type: "text", text: summary }];
      } catch (e: any) {
        return [{ type: "text", text: `Error fetching history: ${e.message}` }];
      }
    }

    // ── News CRUD ──────────────────────────────────────────────────
    case "create_news": {
      if (args.title?.length > 80) return [{ type: "text", text: `Error: Title too long (${args.title.length} chars, max 80). Shorten it.` }];
      if (!args.sources?.length || args.sources.length < 2) return [{ type: "text", text: "Error: Minimum 2 sources required." }];
      if (!args.consensus?.length) return [{ type: "text", text: "Error: consensus[] required — what do sources agree on?" }];
      if (!args.entities?.length) return [{ type: "text", text: "Error: entities[] required — include company name + domain for logos." }];

      const slug = args.slug || toSlug(args.title);
      const docId = `newsPost-${slug}`;
      const sources = (args.sources || []).map((s: any) => ({
        _type: "newsSource",
        _key: crypto.randomUUID().slice(0, 8),
        name: s.name,
        region: s.region || "Intl",
        url: s.url,
        perspective: s.perspective || "",
      }));
      const doc: any = {
        _id: docId,
        _type: "newsPost",
        title: args.title,
        slug: { _type: "slug", current: slug },
        excerpt: args.excerpt || "",
        content: args.content,
        category: args.category || "general",
        coverImage: args.cover_image || "",
        sources,
        consensus: args.consensus || [],
        divergence: args.divergence || [],
        takeaway: args.takeaway || "",
        entities: (args.entities || []).map((e: any) => ({ _type: "newsEntity", _key: crypto.randomUUID().slice(0, 8), name: e.name, domain: e.domain })),
        continues: args.continues || null,
        authorName: args.author_name || user.email.split("@")[0],
        publishedAt: new Date().toISOString(),
        published: args.published ?? true,
      };
      await sanityMutate([{ createOrReplace: doc }]);
      const entityNames = (args.entities || []).map((e: any) => e.name).join(", ");
      return [{ type: "text", text: `✓ News "${args.title}" published (slug: ${slug}, ${sources.length} sources${entityNames ? `, entities: ${entityNames}` : ""}).` }];
    }

    case "update_news": {
      const docId = await resolveNewsId(args);
      if (!docId) return [{ type: "text", text: "Error: News post not found. Provide slug or id." }];
      const patch: any = {};
      if (args.title !== undefined) patch.title = args.title;
      if (args.excerpt !== undefined) patch.excerpt = args.excerpt;
      if (args.content !== undefined) patch.content = args.content;
      if (args.category !== undefined) patch.category = args.category;
      if (args.cover_image !== undefined) patch.coverImage = args.cover_image;
      if (args.author_name !== undefined) patch.authorName = args.author_name;
      if (args.published !== undefined) patch.published = args.published;
      if (args.consensus !== undefined) patch.consensus = args.consensus;
      if (args.divergence !== undefined) patch.divergence = args.divergence;
      if (args.takeaway !== undefined) patch.takeaway = args.takeaway;
      if (args.sources !== undefined) {
        patch.sources = args.sources.map((s: any) => ({
          _type: "newsSource",
          _key: crypto.randomUUID().slice(0, 8),
          name: s.name, region: s.region || "Intl",
          url: s.url, perspective: s.perspective || "",
        }));
      }
      if (args.entities !== undefined) {
        patch.entities = args.entities.map((e: any) => ({ _type: "newsEntity", _key: crypto.randomUUID().slice(0, 8), name: e.name, domain: e.domain }));
      }
      if (args.continues !== undefined) patch.continues = args.continues;
      if (Object.keys(patch).length === 0) return [{ type: "text", text: "No fields to update." }];
      await sanityMutate([{ patch: { id: docId, set: patch } }]);
      return [{ type: "text", text: `✓ News post updated.` }];
    }

    case "delete_news": {
      const docId = await resolveNewsId(args);
      if (!docId) return [{ type: "text", text: "Error: News post not found." }];
      await sanityMutate([{ delete: { id: docId } }]);
      return [{ type: "text", text: `✓ News post deleted.` }];
    }

    case "list_news": {
      const pubFilter = (args.published_only !== false) ? " && published == true" : "";
      const catFilter = args.category ? ` && category == $cat` : "";
      const n = Math.min(args.limit || 20, 50);
      const q = `*[_type == "newsPost"${pubFilter}${catFilter}] | order(publishedAt desc)[0...${n}]{ _id, title, "slug": slug.current, excerpt, category, coverImage, links, authorName, publishedAt, published, _updatedAt }`;
      const result = await sanityQuery(q, args.category ? { cat: args.category } : undefined);
      if (!result?.length) return [{ type: "text", text: "No news posts found." }];
      return [{ type: "text", text: JSON.stringify(result, null, 2) }];
    }

    // ── Reactions ──────────────────────────────────────────────────
    case "react_to_tweet": {
      const { error } = await sb.from("tweet_reactions").insert({
        tweet_id: args.tweet_id,
        emoji: args.emoji,
      });
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: `✓ Reacted with ${args.emoji}` }];
    }

    // ── Feedback ──────────────────────────────────────────────────
    case "submit_feedback": {
      const sb = adminClient();
      const { error } = await sb.from("feedback").insert({
        content: args.content,
        type: args.type || "feature",
        source: "human",
        author_email: user.email,
        author_name: user.email.split("@")[0],
        linked_skill: args.linked_skill || null,
        linked_news: args.linked_news || null,
        context: {},
      });
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: `✓ Feedback submitted.` }];
    }

    case "list_feedback": {
      const sb = adminClient();
      let query = sb.from("feedback").select("*").order("created_at", { ascending: false }).limit(args.limit || 20);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No feedback found." }];
      return [{ type: "text", text: JSON.stringify(data, null, 2) }];
    }

    case "update_feedback": {
      const sb = adminClient();
      const patch: any = { status: args.status };
      if (args.resolution) patch.resolution = args.resolution;
      const { error } = await sb.from("feedback").update(patch).eq("id", args.id);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: `✓ Feedback updated to "${args.status}".` }];
    }

    // ── Milestones ──────────────────────────────────────────────────
    case "create_milestone": {
      const sb = adminClient();
      const { error } = await sb.from("milestones").insert({
        title: args.title,
        date: args.date || new Date().toISOString().split("T")[0],
        category: args.category || "general",
        created_by: user.email.split("@")[0],
      });
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: `✓ Shipped: "${args.title}"` }];
    }

    case "list_milestones": {
      const sb = adminClient();
      let query = sb.from("milestones").select("*").order("date", { ascending: false }).limit(args.limit || 20);
      if (args.month) {
        query = query.gte("date", `${args.month}-01`).lte("date", `${args.month}-31`);
      }
      const { data, error } = await query;
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No milestones found." }];
      const out = data.map((m: any) => `${m.date} — [${m.category}] ${m.title} (${m.created_by || "unknown"})`).join("\n");
      return [{ type: "text", text: out }];
    }

    // ── Agent Inbox ────────────────────────────────────────────────
    case "ask_agent": {
      const sb = adminClient();
      const slug = args.agent_slug;
      const { data: agent } = await sb.from("agents").select("slug, status").eq("slug", slug).single();
      if (!agent) return [{ type: "text", text: `Error: Agent '${slug}' not found.` }];
      if (agent.status !== "active") return [{ type: "text", text: `Error: Agent '${slug}' is ${agent.status}.` }];
      const lower = args.content.toLowerCase().trim();
      const type = args.type || (lower.includes("?") || /^(what|how|why|when|who|where|is |are |can |do |does )/.test(lower) ? "question" : /^review|review this|check this/.test(lower) ? "review" : "action");
      const { data, error } = await sb.from("agent_inbox").insert({
        agent_slug: slug, type, content: args.content, author_email: user.email, author_name: user.email.split("@")[0],
      }).select("id").single();
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      const label = type === "action" ? `Sent to ${slug}. Will be processed shortly.` : `Message sent to ${slug} (${data.id.slice(0, 8)}). Awaiting response.`;
      return [{ type: "text", text: `✓ ${label}` }];
    }

    case "list_inbox": {
      const sb = adminClient();
      let query = sb.from("agent_inbox").select("*").eq("agent_slug", args.agent_slug).eq("author_email", user.email).order("created_at", { ascending: false }).limit(args.limit || 10);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: `No messages to ${args.agent_slug}.` }];
      const out = data.map((i: any) => {
        const resp = i.response ? `\n  → ${i.response}` : "";
        return `[${i.status}] ${i.type}: ${i.content}${resp}`;
      }).join("\n\n");
      return [{ type: "text", text: out }];
    }

    case "read_inbox": {
      const sb = adminClient();
      await sb.from("agent_inbox").update({ status: "pending", locked_by: null, locked_at: null }).eq("agent_slug", args.agent_slug).eq("status", "processing").lt("locked_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
      const { data, error } = await sb.from("agent_inbox").select("*").eq("agent_slug", args.agent_slug).eq("status", "pending").is("locked_by", null).order("created_at", { ascending: true }).limit(args.limit || 10);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: `No pending messages for ${args.agent_slug}.` }];
      return [{ type: "text", text: JSON.stringify(data, null, 2) }];
    }

    case "respond_inbox": {
      const sb = adminClient();
      const { error } = await sb.from("agent_inbox").update({
        status: args.status, response: args.response, processed_by: user.email, processed_at: new Date().toISOString(), locked_by: null, locked_at: null,
      }).eq("id", args.id);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: `✓ Message ${args.id.slice(0, 8)} marked as ${args.status}.` }];
    }

    // ── Legacy CFA aliases (redirect to agent_inbox) ────────────────
    case "submit_inquiry": {
      const sb = adminClient();
      const typeMap: Record<string, string> = { log_hours: "action", expense: "action", question: "question" };
      const type = typeMap[args.type] || "question";
      const { data, error } = await sb.from("agent_inbox").insert({
        agent_slug: "cfa", type, content: args.content, author_email: user.email, author_name: user.email.split("@")[0],
      }).select("id").single();
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      const label = type === "action" ? "Sent to CFA. Will be logged shortly." : `Inquiry submitted (${data.id.slice(0, 8)}). CFA will respond.`;
      return [{ type: "text", text: `✓ ${label}` }];
    }

    case "list_own_inquiries": {
      const sb = adminClient();
      let query = sb.from("agent_inbox").select("*").eq("agent_slug", "cfa").eq("author_email", user.email).order("created_at", { ascending: false }).limit(args.limit || 10);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No inquiries found." }];
      const out = data.map((i: any) => {
        const resp = i.response ? `\n  → ${i.response}` : "";
        return `[${i.status}] ${i.type}: ${i.content}${resp}`;
      }).join("\n\n");
      return [{ type: "text", text: out }];
    }

    case "list_pending_inquiries": {
      const sb = adminClient();
      await sb.from("agent_inbox").update({ status: "pending", locked_by: null, locked_at: null }).eq("agent_slug", "cfa").eq("status", "processing").lt("locked_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
      const { data, error } = await sb.from("agent_inbox").select("*").eq("agent_slug", "cfa").eq("status", "pending").is("locked_by", null).order("created_at", { ascending: true }).limit(args.limit || 10);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No pending inquiries." }];
      return [{ type: "text", text: JSON.stringify(data, null, 2) }];
    }

    case "respond_inquiry": {
      const sb = adminClient();
      const { error } = await sb.from("agent_inbox").update({
        status: args.status, response: args.response, processed_by: user.email, processed_at: new Date().toISOString(), locked_by: null, locked_at: null,
      }).eq("id", args.id);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: `✓ Inquiry ${args.id.slice(0, 8)} marked as ${args.status}.` }];
    }

    // ── Tasks ────────────────────────────────────────────────────────
    case "create_task": {
      const sb = adminClient();
      let parentId = null;
      if (args.parent_task_number) {
        const { data: p } = await sb.from("tasks").select("id").eq("task_number", args.parent_task_number).single();
        if (p) parentId = p.id;
      }
      const { data, error } = await sb.from("tasks").insert({
        title: args.title,
        description: args.description || null,
        priority: args.priority || "medium",
        created_by: user.email,
        assigned_to: args.assigned_to || user.email,
        due_date: args.due_date || null,
        tags: args.tags || [],
        parent_task_id: parentId,
        estimated_hours: args.estimated_hours ?? null,
        recurring: args.recurring ? { interval: args.recurring } : null,
        visibility: args.visibility || "private",
      }).select("task_number, id").single();
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (args.links?.length) {
        for (const link of args.links) {
          await sb.from("task_links").insert({ task_id: data.id, link_type: link.type, link_ref: link.ref });
        }
      }
      await sb.from("audit_events").insert({ actor_email: user.email, actor_type: actorType, actor_agent_id: actorAgentId, entity_type: "task", entity_id: String(data.task_number), action: "created", channel: "mcp", state_after: { title: args.title }, context: { task_uuid: data.id } });
      const parts = [args.assigned_to ? ` → ${args.assigned_to}` : "", parentId ? ` (subtask of #${args.parent_task_number})` : ""];
      return [{ type: "text", text: `✓ Task #${data.task_number} created: "${args.title}"${parts.join("")}` }];
    }

    case "update_task": {
      const sb = adminClient();
      const { data: task, error: fetchErr } = await sb.from("tasks").select("id, task_number, status, title, description, priority, assigned_to, due_date, tags, estimated_hours").eq("task_number", args.task_number).single();
      if (fetchErr || !task) return [{ type: "text", text: "Error: Task not found." }];
      const patch: any = { updated_at: new Date().toISOString() };
      const changes: any = {};
      const stateBefore: Record<string, any> = {};
      for (const f of ["status", "priority", "assigned_to", "due_date", "description", "visibility"]) {
        if ((args as any)[f] !== undefined) { patch[f] = (args as any)[f]; changes[f] = (args as any)[f]; stateBefore[f] = (task as any)[f]; }
      }
      if (args.status === "completed") { patch.completed_by = user.email; patch.completed_at = new Date().toISOString(); }
      const { error } = await sb.from("tasks").update(patch).eq("id", task.id);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      await sb.from("audit_events").insert({ actor_email: user.email, actor_type: actorType, actor_agent_id: actorAgentId, entity_type: "task", entity_id: String(args.task_number), action: args.status === "completed" ? "completed" : "updated", channel: "mcp", state_before: stateBefore, state_after: changes, context: { task_uuid: task.id, reason: args.reason || null } });
      return [{ type: "text", text: `✓ Task #${args.task_number} updated.` }];
    }

    case "complete_task": {
      const sb = adminClient();
      const { data: task, error: fetchErr } = await sb.from("tasks").select("id, title, status").eq("task_number", args.task_number).single();
      if (fetchErr || !task) return [{ type: "text", text: "Error: Task not found." }];
      if (task.status === "completed") return [{ type: "text", text: `Task #${args.task_number} is already completed.` }];
      const { error } = await sb.from("tasks").update({ status: "completed", completed_by: user.email, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", task.id);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      await sb.from("audit_events").insert({ actor_email: user.email, actor_type: actorType, actor_agent_id: actorAgentId, entity_type: "task", entity_id: String(args.task_number), action: "completed", channel: "mcp", state_before: { status: task.status }, context: { task_uuid: task.id, reason: args.reason || null } });
      return [{ type: "text", text: `✓ Task #${args.task_number} completed: "${task.title}"` }];
    }

    case "list_tasks": {
      const sb = adminClient();
      let query = sb.from("tasks").select("task_number, title, status, priority, assigned_to, due_date, created_at").is("archived_at", null).not("status", "eq", "cancelled").order("created_at", { ascending: false }).limit(args.limit || 20);
      if (args.assigned_to && args.assigned_to !== "all") query = query.eq("assigned_to", args.assigned_to);
      else if (!args.assigned_to) query = query.eq("assigned_to", user.email);
      if (args.status) query = query.eq("status", args.status);
      if (args.priority) query = query.eq("priority", args.priority);
      if (args.search) query = query.or(`title.ilike.%${args.search}%,description.ilike.%${args.search}%`);
      if (!args.include_all) {
        query = query.or(`visibility.eq.public,visibility.eq.team,created_by.eq.${user.email},assigned_to.eq.${user.email}`);
      }
      const { data, error } = await query;
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No tasks found." }];
      const out = data.map((t: any) => `#${t.task_number} [${t.status}] ${t.priority} — ${t.title} (${t.assigned_to?.split("@")[0] || "unassigned"}${t.due_date ? `, due ${t.due_date}` : ""})`).join("\n");
      return [{ type: "text", text: out }];
    }

    case "get_task": {
      const sb = adminClient();
      const { data: task, error: fetchErr } = await sb.from("tasks").select("*").eq("task_number", args.task_number).single();
      if (fetchErr || !task) return [{ type: "text", text: "Error: Task not found." }];
      const { data: activity } = await sb.from("audit_events").select("*").eq("entity_type", "task").eq("entity_id", String(task.task_number)).order("timestamp", { ascending: false }).limit(10);
      const { data: subtasks } = await sb.from("tasks").select("task_number, title, status").eq("parent_task_id", task.id).order("task_number");
      const { data: links } = await sb.from("task_links").select("*").eq("task_id", task.id);
      const actLog = (activity || []).map((a: any) => `  ${a.created_at.slice(0, 16)} ${a.actor.split("@")[0]} ${a.action}`).join("\n");
      const subLog = (subtasks || []).map((s: any) => `  ${s.status === "completed" ? "✓" : " "} #${s.task_number} ${s.title}`).join("\n");
      const linkLog = (links || []).map((l: any) => `  ${l.link_type}: ${l.link_ref}`).join("\n");
      let out = `#${task.task_number} — ${task.title}\nStatus: ${task.status} | Priority: ${task.priority}\nAssigned: ${task.assigned_to || "unassigned"} | Created by: ${task.created_by}\nDue: ${task.due_date || "none"} | Tags: ${task.tags?.join(", ") || "none"}`;
      if (task.estimated_hours) out += ` | Est: ${task.estimated_hours}h`;
      if (task.recurring) out += ` | Recurring: ${task.recurring.interval}`;
      if (task.description) out += `\n\n${task.description}`;
      if (subLog) out += `\n\nSubtasks:\n${subLog}`;
      if (linkLog) out += `\n\nLinks:\n${linkLog}`;
      out += `\n\nActivity:\n${actLog || "  (none)"}`;
      return [{ type: "text", text: out }];
    }

    case "comment_task": {
      const sb = adminClient();
      const { data: task, error: fetchErr } = await sb.from("tasks").select("id").eq("task_number", args.task_number).single();
      if (fetchErr || !task) return [{ type: "text", text: "Error: Task not found." }];
      await sb.from("audit_events").insert({ actor_email: user.email, actor_type: actorType, actor_agent_id: actorAgentId, entity_type: "task", entity_id: String(args.task_number), action: "commented", channel: "mcp", state_after: { comment: args.comment }, context: { task_uuid: task.id, reason: args.reason || null } });
      return [{ type: "text", text: `✓ Comment added to task #${args.task_number}.` }];
    }

    case "link_task": {
      const sb = adminClient();
      const { data: task } = await sb.from("tasks").select("id").eq("task_number", args.task_number).single();
      if (!task) return [{ type: "text", text: "Error: Task not found." }];
      await sb.from("task_links").insert({ task_id: task.id, link_type: args.link_type, link_ref: args.link_ref });
      await sb.from("audit_events").insert({ actor_email: user.email, actor_type: actorType, actor_agent_id: actorAgentId, entity_type: "task", entity_id: String(args.task_number), action: "linked", channel: "mcp", state_after: { link_type: args.link_type, link_ref: args.link_ref }, context: { task_uuid: task.id } });
      return [{ type: "text", text: `✓ Linked ${args.link_type} "${args.link_ref}" to task #${args.task_number}.` }];
    }

    case "triage_tasks": {
      const sb = adminClient();
      const { data, error } = await sb.from("tasks").select("task_number, title, source, source_agent, confidence, created_at").eq("requires_triage", true).is("archived_at", null).order("created_at", { ascending: false }).limit(args.limit || 20);
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No tasks need triage." }];
      const out = data.map((t: any) => `#${t.task_number} [${t.source}${t.confidence ? ` ${(t.confidence * 100).toFixed(0)}%` : ""}] ${t.title}`).join("\n");
      return [{ type: "text", text: `${data.length} task(s) need triage:\n${out}` }];
    }

    case "accept_task": {
      const sb = adminClient();
      const { data: task } = await sb.from("tasks").select("id").eq("task_number", args.task_number).single();
      if (!task) return [{ type: "text", text: "Error: Task not found." }];
      await sb.from("tasks").update({ requires_triage: false, updated_at: new Date().toISOString() }).eq("id", task.id);
      await sb.from("audit_events").insert({ actor_email: user.email, actor_type: actorType, actor_agent_id: actorAgentId, entity_type: "task", entity_id: String(args.task_number), action: "triage_accepted", channel: "mcp", context: { task_uuid: task.id, reason: args.reason || null } });
      return [{ type: "text", text: `✓ Task #${args.task_number} accepted into main list.` }];
    }

    case "dismiss_task": {
      const sb = adminClient();
      const { data: task } = await sb.from("tasks").select("id").eq("task_number", args.task_number).single();
      if (!task) return [{ type: "text", text: "Error: Task not found." }];
      await sb.from("tasks").update({ status: "cancelled", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", task.id);
      await sb.from("audit_events").insert({ actor_email: user.email, actor_type: actorType, actor_agent_id: actorAgentId, entity_type: "task", entity_id: String(args.task_number), action: "triage_dismissed", channel: "mcp", context: { task_uuid: task.id, reason: args.reason || null } });
      return [{ type: "text", text: `✓ Task #${args.task_number} dismissed.` }];
    }

    case "get_velocity": {
      const sb = adminClient();
      const days = args.period === "month" ? 30 : 7;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const today = new Date().toISOString().split("T")[0];

      const { count: completed } = await sb.from("tasks").select("*", { count: "exact", head: true }).gte("completed_at", since).eq("status", "completed");
      const { count: created } = await sb.from("tasks").select("*", { count: "exact", head: true }).gte("created_at", since);
      const { count: backlog } = await sb.from("tasks").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress", "blocked"]).is("archived_at", null);
      const { count: overdue } = await sb.from("tasks").select("*", { count: "exact", head: true }).lt("due_date", today).not("status", "in", '("completed","cancelled")').is("archived_at", null);

      return [{ type: "text", text: `Velocity (${args.period || "week"}):\n  Completed: ${completed || 0}\n  Created: ${created || 0}\n  Backlog: ${backlog || 0} open (${overdue || 0} overdue)` }];
    }

    case "suggest_next_task": {
      const sb = adminClient();
      const { data: tasks } = await sb.from("tasks").select("*").eq("assigned_to", user.email).in("status", ["open", "in_progress"]).is("archived_at", null).or("requires_triage.is.null,requires_triage.eq.false").is("parent_task_id", null);

      if (!tasks?.length) return [{ type: "text", text: "No open tasks assigned to you." }];

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const scored = tasks.map((t: any) => {
        let score = 0;
        const reasons: string[] = [];
        if (t.due_date && t.due_date < todayStr) { score += 100; reasons.push("overdue"); }
        else if (t.due_date === todayStr) { score += 50; reasons.push("due today"); }
        if (t.priority === "critical") { score += 40; reasons.push("critical"); }
        else if (t.priority === "high") { score += 20; reasons.push("high priority"); }
        const age = Math.floor((today.getTime() - new Date(t.created_at).getTime()) / 86400000);
        score += Math.min(age, 30);
        return { task: t, score, reasons };
      }).sort((a: any, b: any) => b.score - a.score).slice(0, 3);

      const out = scored.map((s: any, i: number) => `${i + 1}. #${s.task.task_number} ${s.task.title}\n   ${s.reasons.join(", ")} (score: ${s.score})`).join("\n\n");
      return [{ type: "text", text: `Suggested tasks:\n\n${out}` }];
    }

    case "query_audit": {
      const sb = adminClient();
      let query = sb.from("audit_events").select("*").order("timestamp", { ascending: false }).limit(args.limit || 20);
      if (args.entity_type) query = query.eq("entity_type", args.entity_type);
      if (args.entity_id) query = query.eq("entity_id", args.entity_id);
      if (args.actor_email) query = query.eq("actor_email", args.actor_email);
      if (args.actor_agent_id) query = query.eq("actor_agent_id", args.actor_agent_id);
      if (args.channel) query = query.eq("channel", args.channel);
      if (args.action) query = query.eq("action", args.action);
      const { data, error } = await query;
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No audit events found." }];
      const out = data.map((e: any) => `${e.timestamp.slice(0, 16)} [${e.channel || "?"}] ${e.actor_email?.split("@")[0] || e.actor_type} → ${e.entity_type}${e.entity_id ? " #" + e.entity_id : ""} ${e.action}`).join("\n");
      return [{ type: "text", text: out }];
    }

    case "list_agents": {
      const sb = adminClient();
      let query = sb.from("agents").select("*").order("created_at", { ascending: false });
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      if (!data?.length) return [{ type: "text", text: "No agents registered." }];
      const out = data.map((a: any) => {
        const seen = a.last_seen ? `last seen ${new Date(a.last_seen).toLocaleTimeString()}` : "never seen";
        return `[${a.status}] ${a.slug} — ${a.name} (${seen})`;
      }).join("\n");
      return [{ type: "text", text: out }];
    }

    case "get_agent": {
      const sb = adminClient();
      const { data: agent } = await sb.from("agents").select("*").eq("slug", args.slug).single();
      if (!agent) return [{ type: "text", text: "Agent not found." }];
      const { data: activity } = await sb.from("audit_events").select("*").eq("actor_agent_id", args.slug).order("timestamp", { ascending: false }).limit(10);
      const actLog = (activity || []).map((e: any) => `  ${e.timestamp.slice(0, 16)} ${e.action} ${e.entity_type}${e.entity_id ? " #" + e.entity_id : ""}`).join("\n");
      return [{ type: "text", text: `${agent.name} (${agent.slug})\nStatus: ${agent.status} | Owner: ${agent.owner}\nEmail: ${agent.email || "none"} | Skill: ${agent.skill_slug || "none"}\nScopes: ${agent.scopes?.join(", ") || "none"}\nMachine: ${agent.machine || "unknown"}\nLast seen: ${agent.last_seen || "never"}\n\nRecent activity:\n${actLog || "  (none)"}` }];
    }

    case "register_agent": {
      const sb = adminClient();
      const { error } = await sb.from("agents").insert({
        slug: args.slug,
        name: args.name,
        owner: args.owner || user.email,
        email: args.email || null,
        skill_slug: args.skill_slug || null,
        scopes: args.scopes || [],
        machine: args.machine || null,
      });
      if (error) return [{ type: "text", text: `Error: ${error.message}` }];
      return [{ type: "text", text: `✓ Agent "${args.name}" registered (slug: ${args.slug})` }];
    }

    default:
      return [{ type: "text", text: `Unknown tool: ${name}` }];
  }
}

// ── MCP JSON-RPC Handler ───────────────────────────────────────────────
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
  return new Response("", {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
});

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
