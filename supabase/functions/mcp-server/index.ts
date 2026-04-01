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
  await sb.from("mcp_sessions").update({ auth_code: authCode, user_email: email, user_id: userId }).eq("id", session.id);

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
        title: { type: "string", description: "Factual, descriptive headline (no clickbait)" },
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
        authorName: args.author_name || user.email.split("@")[0],
        publishedAt: new Date().toISOString(),
        published: args.published ?? true,
      };
      await sanityMutate([{ createOrReplace: doc }]);
      return [{ type: "text", text: `✓ News "${args.title}" published (slug: ${slug}, ${sources.length} sources).` }];
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
