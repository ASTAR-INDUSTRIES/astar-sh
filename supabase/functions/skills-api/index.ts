import { Hono } from "jsr:@hono/hono@^4";
import { createClient } from "jsr:@supabase/supabase-js@2";

const app = new Hono().basePath("/skills-api");

const SANITY_PROJECT_ID = "fkqm34od";
const SANITY_DATASET = "production";
const SANITY_API = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

app.options("*", (c) => new Response(null, { headers: corsHeaders }));

// ── Supabase client for logging ───────────────────────────────────────
function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function logEvent(eventType: string, opts?: { skillSlug?: string; skillTitle?: string; userEmail?: string; userName?: string; metadata?: Record<string, any> }) {
  try {
    const sb = getSupabase();
    await sb.from("cli_events").insert({
      event_type: eventType,
      skill_slug: opts?.skillSlug,
      skill_title: opts?.skillTitle,
      user_email: opts?.userEmail,
      user_name: opts?.userName,
      metadata: opts?.metadata ?? {},
    });
  } catch {
    // non-blocking
  }
}

// ── Sanity mutate helper ─────────────────────────────────────────────
async function sanityMutate(mutations: any[]) {
  const token = Deno.env.get("SANITY_API_TOKEN");
  if (!token) throw new Error("SANITY_API_TOKEN not configured");
  const res = await fetch(`${SANITY_API}/data/mutate/${SANITY_DATASET}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mutations }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

// ── Auth: validate Microsoft JWT ─────────────────────────────────────
const TENANT_ID = "d6af3688-b659-4f90-b701-35246b209b9d";
const JWKS_URL = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;

let jwksCache: any = null;
let jwksCacheTime = 0;

async function getJwks() {
  if (jwksCache && Date.now() - jwksCacheTime < 3600_000) return jwksCache;
  const res = await fetch(JWKS_URL);
  jwksCache = await res.json();
  jwksCacheTime = Date.now();
  return jwksCache;
}

async function validateMsToken(req: Request): Promise<{ email: string; name: string } | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  try {
    const [headerB64, payloadB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64));

    const email = payload.email || payload.preferred_username || payload.upn;
    if (!email?.endsWith("@astarconsulting.no")) return null;

    if (payload.exp && payload.exp * 1000 < Date.now()) return null;

    return { email, name: payload.name || email.split("@")[0] };
  } catch {
    return null;
  }
}

// ── Sanity query helper ───────────────────────────────────────────────
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

// ── GET /skills — list all published skills ───────────────────────────
app.get("/skills", async (c) => {
  const query = c.req.query("query");

  let filter = `_type == "knowledgeSkill" && published == true`;
  const params: Record<string, any> = {};

  if (query) {
    filter += ` && (title match $q || description match $q || $q in tags)`;
    params.q = `${query}*`;
  }

  const skills = await sanityQuery(
    `*[${filter}] | order(title asc) {
      _id,
      _updatedAt,
      title,
      "slug": slug.current,
      description,
      tags,
      author,
      project,
      "skillMd": markdownContent,
      "referenceFiles": references[] {
        filename,
        folder,
        content
      }
    }`,
    Object.keys(params).length ? params : undefined
  );

  const sb = getSupabase();
  const { data: events } = await sb
    .from("cli_events")
    .select("skill_slug")
    .eq("event_type", "skill.download")
    .not("skill_slug", "is", null);

  const dlCounts: Record<string, number> = {};
  if (events) {
    for (const ev of events) {
      if (ev.skill_slug) dlCounts[ev.skill_slug] = (dlCounts[ev.skill_slug] || 0) + 1;
    }
  }

  const enriched = (skills || []).map((s: any) => ({
    ...s,
    downloadCount: dlCounts[s.slug] || 0,
  }));

  await logEvent("skill.list", { metadata: { count: skills?.length ?? 0, query: query || undefined } });
  return c.json({ skills: enriched }, 200, corsHeaders);
});

// ── GET /skills/:slug — single skill by slug ─────────────────────────
app.get("/skills/:slug", async (c) => {
  const slug = c.req.param("slug");

  const skill = await sanityQuery(
    `*[_type == "knowledgeSkill" && slug.current == $slug && published == true][0] {
      _id,
      _updatedAt,
      title,
      "slug": slug.current,
      description,
      tags,
      author,
      project,
      "skillMd": markdownContent,
      "referenceFiles": references[] {
        filename,
        folder,
        content
      }
    }`,
    { slug }
  );

  if (!skill) {
    return c.json({ error: "Skill not found" }, 404, corsHeaders);
  }

  await logEvent("skill.download", { skillSlug: slug, skillTitle: skill.title });
  return c.json({ skill }, 200, corsHeaders);
});

// ── POST /skills — create or update a skill ─────────────────────────
app.post("/skills", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401, corsHeaders);
  }

  const body = await c.req.json();
  const { title, slug, description, tags, content, references, published } = body;

  if (!title || !content) {
    return c.json({ error: "title and content are required" }, 400, corsHeaders);
  }

  const skillSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const docId = `knowledgeSkill-${skillSlug}`;

  const refs = (references || []).map((r: any) => ({
    _type: "referenceFile",
    _key: crypto.randomUUID().slice(0, 8),
    filename: r.filename,
    folder: r.folder || "",
    content: r.content,
  }));

  const doc: any = {
    _id: docId,
    _type: "knowledgeSkill",
    title,
    slug: { _type: "slug", current: skillSlug },
    description: description || "",
    tags: tags || [],
    markdownContent: content,
    published: published ?? false,
    author: user.email,
    references: refs,
  };

  await sanityMutate([{ createOrReplace: doc }]);

  await logEvent("skill.push", {
    skillSlug,
    skillTitle: title,
    userEmail: user.email,
    userName: user.name,
  });

  return c.json({ ok: true, slug: skillSlug }, 200, corsHeaders);
});

// ── GET /news — list published news ──────────────────────────────────
app.get("/news", async (c) => {
  const category = c.req.query("category");

  let filter = `_type == "newsPost" && published == true`;
  const params: Record<string, any> = {};

  if (category) {
    filter += ` && category == $cat`;
    params.cat = category;
  }

  const news = await sanityQuery(
    `*[${filter}] | order(publishedAt desc)[0...20] {
      _id,
      _updatedAt,
      title,
      "slug": slug.current,
      excerpt,
      category,
      coverImage,
      sources[] { name, region, url },
      authorName,
      publishedAt
    }`,
    Object.keys(params).length ? params : undefined
  );

  return c.json({ news: news || [] }, 200, corsHeaders);
});

// ── GET /news/:slug — single news article ───────────────────────────
app.get("/news/:slug", async (c) => {
  const slug = c.req.param("slug");

  const article = await sanityQuery(
    `*[_type == "newsPost" && slug.current == $slug && published == true][0] {
      _id,
      _updatedAt,
      title,
      "slug": slug.current,
      excerpt,
      content,
      category,
      coverImage,
      sources[] { name, region, url, perspective },
      consensus,
      divergence,
      takeaway,
      authorName,
      publishedAt
    }`,
    { slug }
  );

  if (!article) {
    return c.json({ error: "Article not found" }, 404, corsHeaders);
  }

  return c.json({ article }, 200, corsHeaders);
});

// ── POST /news — create a news post ─────────────────────────────────
app.post("/news", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401, corsHeaders);
  }

  const body = await c.req.json();
  const { title, content } = body;

  if (!title || !content) {
    return c.json({ error: "title and content are required" }, 400, corsHeaders);
  }

  const slug = body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const docId = `newsPost-${slug}`;

  const sources = (body.sources || []).map((s: any) => ({
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
    title,
    slug: { _type: "slug", current: slug },
    excerpt: body.excerpt || "",
    content,
    category: body.category || "general",
    coverImage: body.cover_image || "",
    sources,
    consensus: body.consensus || [],
    divergence: body.divergence || [],
    takeaway: body.takeaway || "",
    authorName: body.author_name || user.name,
    publishedAt: new Date().toISOString(),
    published: body.published ?? true,
  };

  await sanityMutate([{ createOrReplace: doc }]);

  await logEvent("news.publish", {
    skillSlug: slug,
    skillTitle: title,
    userEmail: user.email,
    userName: user.name,
  });

  return c.json({ ok: true, slug }, 200, corsHeaders);
});

// ── GET /feedback — list feedback ────────────────────────────────────
app.get("/feedback", async (c) => {
  const status = c.req.query("status");
  const sb = getSupabase();
  let query = sb.from("feedback").select("*").order("created_at", { ascending: false }).limit(50);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ feedback: data || [] }, 200, corsHeaders);
});

// ── POST /feedback — submit feedback ────────────────────────────────
app.post("/feedback", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.content) return c.json({ error: "content is required" }, 400, corsHeaders);

  const sb = getSupabase();
  const { error } = await sb.from("feedback").insert({
    content: body.content,
    type: body.type || "feature",
    source: body.source || "human",
    author_email: user.email,
    author_name: user.name,
    linked_skill: body.linked_skill || null,
    linked_news: body.linked_news || null,
    context: body.context || {},
  });

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logEvent("feedback.submit", {
    userEmail: user.email,
    userName: user.name,
    metadata: { type: body.type || "feature" },
  });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── GET /milestones — list milestones ────────────────────────────────
app.get("/milestones", async (c) => {
  const month = c.req.query("month");
  const sb = getSupabase();
  let query = sb.from("milestones").select("*").order("date", { ascending: false }).limit(50);
  if (month) {
    query = query.gte("date", `${month}-01`).lte("date", `${month}-31`);
  }
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ milestones: data || [] }, 200, corsHeaders);
});

// ── POST /milestones — create milestone ─────────────────────────────
app.post("/milestones", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400, corsHeaders);

  const sb = getSupabase();
  const { error } = await sb.from("milestones").insert({
    title: body.title,
    date: body.date || new Date().toISOString().split("T")[0],
    category: body.category || "general",
    created_by: user.name,
  });

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logEvent("milestone.create", {
    userEmail: user.email,
    userName: user.name,
    metadata: { title: body.title },
  });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── POST /inquiries — employee submits financial inquiry ─────────────
app.post("/inquiries", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.content) return c.json({ error: "content is required" }, 400, corsHeaders);

  const type = body.type || "question";
  if (!["log_hours", "question", "expense"].includes(type)) {
    return c.json({ error: "type must be log_hours, question, or expense" }, 400, corsHeaders);
  }

  const sb = getSupabase();
  const { data, error } = await sb.from("financial_inquiries").insert({
    type,
    content: body.content,
    author_email: user.email,
    author_name: user.name,
    delivery_channel: body.delivery_channel || "cli",
  }).select("id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logEvent("inquiry.submit", {
    userEmail: user.email,
    userName: user.name,
    metadata: { type, inquiry_id: data.id },
  });

  return c.json({ ok: true, id: data.id }, 200, corsHeaders);
});

// ── GET /inquiries — employee sees own inquiries ────────────────────
app.get("/inquiries", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const status = c.req.query("status");
  const sb = getSupabase();
  let query = sb.from("financial_inquiries")
    .select("*")
    .eq("author_email", user.email)
    .order("created_at", { ascending: false })
    .limit(20);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ inquiries: data || [] }, 200, corsHeaders);
});

// ── GET /inquiries/health — observability ───────────────────────────
app.get("/inquiries/health", async (c) => {
  const sb = getSupabase();
  const { data: pending } = await sb.from("financial_inquiries")
    .select("created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  const { data: lastDone } = await sb.from("financial_inquiries")
    .select("processed_at")
    .eq("status", "completed")
    .order("processed_at", { ascending: false })
    .limit(1);

  const { count } = await sb.from("financial_inquiries")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const oldestAge = pending?.[0]?.created_at
    ? Math.floor((Date.now() - new Date(pending[0].created_at).getTime()) / 1000)
    : 0;

  return c.json({
    pending_count: count || 0,
    oldest_pending_age_seconds: oldestAge,
    last_completed_at: lastDone?.[0]?.processed_at || null,
  }, 200, corsHeaders);
});

// ── GET /inquiries/pending — CFA reads unclaimed queue ──────────────
app.get("/inquiries/pending", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const sb = getSupabase();

  // Reclaim stale locks (> 5 min)
  await sb.from("financial_inquiries")
    .update({ status: "pending", locked_by: null, locked_at: null })
    .eq("status", "processing")
    .lt("locked_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

  const { data, error } = await sb.from("financial_inquiries")
    .select("*")
    .eq("status", "pending")
    .is("locked_by", null)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ inquiries: data || [] }, 200, corsHeaders);
});

// ── GET /inquiries/:id — poll single inquiry ────────────────────────
app.get("/inquiries/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const sb = getSupabase();
  const { data, error } = await sb.from("financial_inquiries")
    .select("*")
    .eq("id", id)
    .eq("author_email", user.email)
    .single();

  if (error || !data) return c.json({ error: "Not found" }, 404, corsHeaders);
  return c.json({ inquiry: data }, 200, corsHeaders);
});

// ── PATCH /inquiries/:id — CFA claims or responds ──────────────────
app.patch("/inquiries/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const body = await c.req.json();
  const sb = getSupabase();

  if (body.status === "processing") {
    const { error } = await sb.from("financial_inquiries")
      .update({ status: "processing", locked_by: user.email, locked_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["pending"]);
    if (error) return c.json({ error: error.message }, 500, corsHeaders);
    return c.json({ ok: true }, 200, corsHeaders);
  }

  if (body.status === "completed" || body.status === "failed") {
    const { error } = await sb.from("financial_inquiries")
      .update({
        status: body.status,
        response: body.response || null,
        processed_by: user.email,
        processed_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null,
      })
      .eq("id", id);
    if (error) return c.json({ error: error.message }, 500, corsHeaders);

    await logEvent("inquiry.processed", {
      userEmail: user.email,
      userName: user.name,
      metadata: { inquiry_id: id, status: body.status },
    });

    return c.json({ ok: true }, 200, corsHeaders);
  }

  return c.json({ error: "status must be processing, completed, or failed" }, 400, corsHeaders);
});

// ── Health ─────────────────────────────────────────────────────────────
app.get("/", (c) => c.json({ status: "ok", service: "skills-api" }, 200, corsHeaders));

Deno.serve(app.fetch);
