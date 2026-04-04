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

async function logAudit(opts: {
  actor_email?: string;
  actor_name?: string;
  actor_type?: string;
  actor_agent_id?: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  state_before?: any;
  state_after?: any;
  channel?: string;
  raw_input?: any;
  context?: any;
}) {
  try {
    const sb = getSupabase();
    await sb.from("audit_events").insert(opts);
  } catch {}
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
    .from("audit_events")
    .select("entity_id")
    .eq("entity_type", "skill")
    .eq("action", "downloaded")
    .not("entity_id", "is", null);

  const dlCounts: Record<string, number> = {};
  if (events) {
    for (const ev of events) {
      if (ev.entity_id) dlCounts[ev.entity_id] = (dlCounts[ev.entity_id] || 0) + 1;
    }
  }

  const enriched = (skills || []).map((s: any) => ({
    ...s,
    downloadCount: dlCounts[s.slug] || 0,
  }));

  await logAudit({ entity_type: "skill", action: "listed", channel: "api", state_after: { count: skills?.length ?? 0, query: query || undefined } });
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

  await logAudit({ entity_type: "skill", entity_id: slug, action: "downloaded", channel: "api", state_after: { title: skill.title } });
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

  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "skill", entity_id: skillSlug, action: "pushed", channel: "api", state_after: { title } });

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
      entities[] { name, domain },
      continues,
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
      entities[] { name, domain },
      continues,
      "continuesTitle": *[_type == "newsPost" && slug.current == ^.continues][0].title,
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

  if (title.length > 80) {
    return c.json({ error: `Title too long (${title.length} chars, max 80). Shorten it.` }, 400, corsHeaders);
  }

  if (!body.sources?.length || body.sources.length < 2) {
    return c.json({ error: "Minimum 2 sources required for quality." }, 400, corsHeaders);
  }

  if (!body.consensus?.length) {
    return c.json({ error: "consensus[] required — what do sources agree on?" }, 400, corsHeaders);
  }

  if (!body.entities?.length) {
    return c.json({ error: "entities[] required — include company name + domain for logos." }, 400, corsHeaders);
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
    entities: (body.entities || []).map((e: any) => ({ _type: "newsEntity", _key: crypto.randomUUID().slice(0, 8), name: e.name, domain: e.domain })),
    continues: body.continues || null,
    consensus: body.consensus || [],
    divergence: body.divergence || [],
    takeaway: body.takeaway || "",
    authorName: body.author_name || user.name,
    publishedAt: new Date().toISOString(),
    published: body.published ?? true,
  };

  await sanityMutate([{ createOrReplace: doc }]);

  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "news", entity_id: slug, action: "published", channel: "api", state_after: { title } });

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

  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "feedback", action: "submitted", channel: "api", state_after: { type: body.type || "feature", content: body.content } });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── PATCH /feedback/:id — update feedback status ────────────────────
app.patch("/feedback/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const body = await c.req.json();
  const sb = getSupabase();

  const patch: any = {};
  if (body.status) patch.status = body.status;
  if (body.resolution !== undefined) patch.resolution = body.resolution;

  if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update" }, 400, corsHeaders);

  const { error } = await sb.from("feedback").update(patch).eq("id", id);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "feedback", entity_id: id, action: "status_changed", channel: "api", state_after: patch });

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

  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "milestone", action: "created", channel: "api", state_after: { title: body.title } });

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

  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "inquiry", entity_id: data.id, action: "submitted", channel: "api", state_after: { type } });

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

    await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "inquiry", entity_id: id, action: "processed", channel: "api", state_after: { status: body.status, response: body.response } });

    return c.json({ ok: true }, 200, corsHeaders);
  }

  return c.json({ error: "status must be processing, completed, or failed" }, 400, corsHeaders);
});

// ── Task audit helper ────────────────────────────────────────────────
async function logTaskAudit(taskId: string, taskNumber: string | number, actor: string, actorType: string, action: string, opts: { state_before?: any; state_after?: any; channel?: string } = {}) {
  await logAudit({
    actor_email: actor,
    actor_type: actorType,
    entity_type: "task",
    entity_id: String(taskNumber),
    action,
    state_before: opts.state_before,
    state_after: opts.state_after,
    channel: opts.channel || "api",
    context: { task_uuid: taskId },
  });
}

// ── POST /tasks — create task ───────────────────────────────────────
app.post("/tasks", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400, corsHeaders);

  const sb = getSupabase();

  let parentId = null;
  if (body.parent_task_number) {
    const { data: parent } = await sb.from("tasks").select("id").eq("task_number", body.parent_task_number).single();
    if (parent) parentId = parent.id;
  }

  const isAgent = body.source === "agent";
  const { data, error } = await sb.from("tasks").insert({
    title: body.title,
    description: body.description || null,
    priority: body.priority || "medium",
    created_by: user.email,
    assigned_to: body.assigned_to || user.email,
    due_date: body.due_date || null,
    source: body.source || "human",
    tags: body.tags || [],
    parent_task_id: parentId,
    confidence: body.confidence ?? null,
    requires_triage: body.requires_triage ?? (isAgent ? true : false),
    recurring: body.recurring || null,
    estimated_hours: body.estimated_hours ?? null,
  }).select("task_number, id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  if (body.links?.length) {
    for (const link of body.links) {
      await sb.from("task_links").insert({ task_id: data.id, link_type: link.type, link_ref: link.ref });
    }
  }

  await logTaskAudit(data.id, data.task_number, user.email, isAgent ? "agent" : "human", "created", { state_after: { title: body.title, priority: body.priority || "medium", assigned_to: body.assigned_to || user.email } });

  return c.json({ ok: true, task_number: data.task_number }, 200, corsHeaders);
});

// ── GET /tasks — list tasks with filters ────────────────────────────
app.get("/tasks", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const status = c.req.query("status");
  const priority = c.req.query("priority");
  const assignedTo = c.req.query("assigned_to");
  const due = c.req.query("due");
  const search = c.req.query("search");
  const triage = c.req.query("triage");
  const parent = c.req.query("parent");

  const sb = getSupabase();
  let query = sb.from("tasks").select("*").is("archived_at", null).order("created_at", { ascending: false }).limit(50);

  if (triage === "true") {
    query = query.eq("requires_triage", true);
  } else {
    query = query.or("requires_triage.is.null,requires_triage.eq.false");
  }

  if (parent) {
    const { data: parentTask } = await sb.from("tasks").select("id").eq("task_number", parseInt(parent)).single();
    if (parentTask) query = query.eq("parent_task_id", parentTask.id);
  } else {
    query = query.is("parent_task_id", null);
  }

  if (assignedTo && assignedTo !== "all") {
    query = query.eq("assigned_to", assignedTo);
  } else if (!assignedTo && !triage && !parent) {
    query = query.eq("assigned_to", user.email);
  }

  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.not("status", "in", '("cancelled")');
  }

  if (priority) query = query.eq("priority", priority);

  if (due) {
    const today = new Date().toISOString().split("T")[0];
    if (due === "today") query = query.eq("due_date", today);
    else if (due === "overdue") query = query.lt("due_date", today).neq("status", "completed").neq("status", "cancelled");
    else if (due === "week") {
      const week = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      query = query.gte("due_date", today).lte("due_date", week);
    }
  }

  if (search) {
    query = query.textSearch("search_vector", search, { type: "websearch" });
  }

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ tasks: data || [] }, 200, corsHeaders);
});

// ── GET /tasks/velocity — completion metrics ────────────────────────
app.get("/tasks/velocity", async (c) => {
  const period = c.req.query("period") || "week";
  const assignedTo = c.req.query("assigned_to");
  const sb = getSupabase();

  const days = period === "month" ? 30 : 7;
  const periodStart = new Date(Date.now() - days * 86400000).toISOString();
  const today = new Date().toISOString().split("T")[0];

  let completedQ = sb.from("tasks").select("*", { count: "exact", head: true }).gte("completed_at", periodStart).eq("status", "completed");
  let createdQ = sb.from("tasks").select("*", { count: "exact", head: true }).gte("created_at", periodStart);
  let backlogQ = sb.from("tasks").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress", "blocked"]).is("archived_at", null);
  let overdueQ = sb.from("tasks").select("*", { count: "exact", head: true }).lt("due_date", today).not("status", "in", '("completed","cancelled")').is("archived_at", null);

  if (assignedTo) {
    completedQ = completedQ.eq("assigned_to", assignedTo);
    createdQ = createdQ.eq("assigned_to", assignedTo);
    backlogQ = backlogQ.eq("assigned_to", assignedTo);
    overdueQ = overdueQ.eq("assigned_to", assignedTo);
  }

  const [completed, created, backlog, overdue] = await Promise.all([
    completedQ, createdQ, backlogQ, overdueQ,
  ]);

  const { data: closedTasks } = await sb.from("tasks").select("created_at, completed_at").gte("completed_at", periodStart).eq("status", "completed");
  let avgDays = 0;
  if (closedTasks?.length) {
    const total = closedTasks.reduce((sum, t) => sum + (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()), 0);
    avgDays = Math.round((total / closedTasks.length / 86400000) * 10) / 10;
  }

  return c.json({
    period,
    completed: completed.count || 0,
    created: created.count || 0,
    avg_days_to_close: avgDays,
    backlog: backlog.count || 0,
    overdue: overdue.count || 0,
  }, 200, corsHeaders);
});

// ── GET /tasks/suggest — priority suggestion ────────────────────────
app.get("/tasks/suggest", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const sb = getSupabase();
  const { data: tasks } = await sb.from("tasks").select("*")
    .eq("assigned_to", user.email)
    .in("status", ["open", "in_progress"])
    .is("archived_at", null)
    .or("requires_triage.is.null,requires_triage.eq.false")
    .is("parent_task_id", null);

  if (!tasks?.length) return c.json({ suggestions: [] }, 200, corsHeaders);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const weekStr = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const scored = tasks.map((t: any) => {
    let score = 0;
    const reasons: string[] = [];

    if (t.due_date && t.due_date < todayStr) { score += 100; reasons.push("overdue"); }
    else if (t.due_date === todayStr) { score += 50; reasons.push("due today"); }
    else if (t.due_date && t.due_date <= weekStr) { score += 20; reasons.push("due this week"); }

    if (t.priority === "critical") { score += 40; reasons.push("critical priority"); }
    else if (t.priority === "high") { score += 20; reasons.push("high priority"); }

    const ageDays = Math.floor((today.getTime() - new Date(t.created_at).getTime()) / 86400000);
    score += Math.min(ageDays, 30);
    if (ageDays > 7) reasons.push(`open ${ageDays} days`);

    return { task: t, score, reasons };
  });

  scored.sort((a: any, b: any) => b.score - a.score);

  return c.json({ suggestions: scored.slice(0, 3) }, 200, corsHeaders);
});

// ── POST /tasks/archive — archive old tasks ─────────────────────────
app.post("/tasks/archive", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const sb = getSupabase();
  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: d1 } = await sb.from("tasks").update({ archived_at: now }).eq("status", "completed").lt("completed_at", thirtyDaysAgo).is("archived_at", null).select("id");
  const { data: d2 } = await sb.from("tasks").update({ archived_at: now }).eq("status", "cancelled").lt("updated_at", sevenDaysAgo).is("archived_at", null).select("id");
  const c1 = d1?.length || 0;
  const c2 = d2?.length || 0;

  return c.json({ ok: true, archived: (c1 || 0) + (c2 || 0) }, 200, corsHeaders);
});

// ── GET /tasks/:number — single task ────────────────────────────────
app.get("/tasks/:number", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const num = parseInt(c.req.param("number"));
  const sb = getSupabase();

  const { data: task, error } = await sb.from("tasks").select("*").eq("task_number", num).single();
  if (error || !task) return c.json({ error: "Task not found" }, 404, corsHeaders);

  const { data: activity } = await sb.from("audit_events").select("*").eq("entity_type", "task").eq("entity_id", String(task.task_number)).order("timestamp", { ascending: false }).limit(20);
  const { data: subtasks } = await sb.from("tasks").select("*").eq("parent_task_id", task.id).order("task_number", { ascending: true });
  const { data: links } = await sb.from("task_links").select("*").eq("task_id", task.id).order("created_at", { ascending: true });

  return c.json({ task, activity: activity || [], subtasks: subtasks || [], links: links || [] }, 200, corsHeaders);
});

// ── PATCH /tasks/:number — update task ──────────────────────────────
app.patch("/tasks/:number", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const num = parseInt(c.req.param("number"));
  const sb = getSupabase();

  const { data: task, error: fetchErr } = await sb.from("tasks").select("*").eq("task_number", num).single();
  if (fetchErr || !task) return c.json({ error: "Task not found" }, 404, corsHeaders);

  if (user.email !== task.created_by && user.email !== task.assigned_to) {
    return c.json({ error: "Only the creator or assignee can modify this task" }, 403, corsHeaders);
  }

  const body = await c.req.json();
  const patch: any = { updated_at: new Date().toISOString() };
  const changes: Record<string, any> = {};

  for (const field of ["status", "priority", "assigned_to", "due_date", "description", "tags"]) {
    if (body[field] !== undefined) {
      changes[field] = { from: task[field], to: body[field] };
      patch[field] = body[field];
    }
  }

  if (body.status === "completed") {
    if (!body.force) {
      const { data: openSubs } = await sb.from("tasks").select("id").eq("parent_task_id", task.id).neq("status", "completed").neq("status", "cancelled");
      if (openSubs?.length) {
        return c.json({ error: `${openSubs.length} subtask(s) still open. Complete them first or pass force=true.` }, 400, corsHeaders);
      }
    }
    patch.completed_by = user.email;
    patch.completed_at = new Date().toISOString();
  }

  if (Object.keys(changes).length === 0) return c.json({ error: "No fields to update" }, 400, corsHeaders);

  const { error } = await sb.from("tasks").update(patch).eq("id", task.id);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  const action = body.status === "completed" ? "completed" : body.assigned_to ? "assigned" : "updated";
  await logTaskAudit(task.id, num, user.email, "human", action, { state_before: Object.fromEntries(Object.entries(changes).map(([k, v]: any) => [k, v.from])), state_after: Object.fromEntries(Object.entries(changes).map(([k, v]: any) => [k, v.to])) });

  if (body.status === "completed") {
    const { data: taskLinks } = await sb.from("task_links").select("*").eq("task_id", task.id);
    for (const link of (taskLinks || [])) {
      try {
        if (link.link_type === "feedback") {
          await sb.from("feedback").update({ status: "done" }).eq("id", link.link_ref);
        }
        if (link.link_type === "milestone") {
          await sb.from("milestones").insert({ title: task.title, date: new Date().toISOString().split("T")[0], category: "product", created_by: user.name });
        }
      } catch (e: any) {
        await logTaskAudit(task.id, num, "system", "system", "link_effect_failed", { state_after: { link_type: link.link_type, error: e.message } });
      }
    }

    if (task.recurring) {
      try {
        const interval = task.recurring.interval;
        const dueDate = task.due_date ? new Date(task.due_date) : new Date();
        if (interval === "weekly") dueDate.setDate(dueDate.getDate() + 7);
        else if (interval === "monthly") dueDate.setMonth(dueDate.getMonth() + 1);
        else if (interval === "quarterly") dueDate.setMonth(dueDate.getMonth() + 3);
        const { data: nextTask } = await sb.from("tasks").insert({
          title: task.title, description: task.description, priority: task.priority,
          created_by: task.created_by, assigned_to: task.assigned_to,
          due_date: dueDate.toISOString().split("T")[0],
          source: "system", tags: task.tags, recurring: task.recurring,
          parent_task_id: task.parent_task_id || task.id,
        }).select("task_number, id").single();
        if (nextTask) {
          await logTaskAudit(nextTask.id, nextTask.task_number, "system", "system", "recurring_created", { state_after: { from_task: task.task_number }, channel: "system" });
        }
      } catch {}
    }
  }

  return c.json({ ok: true, task_number: num }, 200, corsHeaders);
});

// ── POST /tasks/:number/links — add link ────────────────────────────
app.post("/tasks/:number/links", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const num = parseInt(c.req.param("number"));
  const sb = getSupabase();
  const { data: task } = await sb.from("tasks").select("id").eq("task_number", num).single();
  if (!task) return c.json({ error: "Task not found" }, 404, corsHeaders);

  const body = await c.req.json();
  if (!body.link_type || !body.link_ref) return c.json({ error: "link_type and link_ref required" }, 400, corsHeaders);

  await sb.from("task_links").insert({ task_id: task.id, link_type: body.link_type, link_ref: body.link_ref });
  await logTaskAudit(task.id, num, user.email, "human", "linked", { state_after: { link_type: body.link_type, link_ref: body.link_ref } });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── PATCH /tasks/:number/triage — accept or dismiss ─────────────────
app.patch("/tasks/:number/triage", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const num = parseInt(c.req.param("number"));
  const body = await c.req.json();
  const sb = getSupabase();
  const { data: task } = await sb.from("tasks").select("id").eq("task_number", num).single();
  if (!task) return c.json({ error: "Task not found" }, 404, corsHeaders);

  if (body.action === "accept") {
    await sb.from("tasks").update({ requires_triage: false, updated_at: new Date().toISOString() }).eq("id", task.id);
    await logTaskAudit(task.id, num, user.email, "human", "triage_accepted", {});
  } else if (body.action === "dismiss") {
    await sb.from("tasks").update({ status: "cancelled", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", task.id);
    await logTaskAudit(task.id, num, user.email, "human", "triage_dismissed", { state_after: { reason: body.reason || "" } });
  } else {
    return c.json({ error: "action must be accept or dismiss" }, 400, corsHeaders);
  }

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── DELETE /tasks/:number — cancel task ─────────────────────────────
app.delete("/tasks/:number", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const num = parseInt(c.req.param("number"));
  const sb = getSupabase();

  const { data: task, error: fetchErr } = await sb.from("tasks").select("id, created_by").eq("task_number", num).single();
  if (fetchErr || !task) return c.json({ error: "Task not found" }, 404, corsHeaders);

  if (user.email !== task.created_by) {
    return c.json({ error: "Only the creator can cancel this task" }, 403, corsHeaders);
  }

  await sb.from("tasks").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", task.id);
  await logTaskAudit(task.id, num, user.email, "human", "cancelled", { state_before: { status: "open" }, state_after: { status: "cancelled" } });

  return c.json({ ok: true }, 200, corsHeaders);
});


// ── GET /audit — query audit events ─────────────────────────────────
app.get("/audit", async (c) => {
  const entityType = c.req.query("entity_type");
  const entityId = c.req.query("entity_id");
  const actor = c.req.query("actor");
  const actorAgentId = c.req.query("actor_agent_id");
  const channel = c.req.query("channel");
  const action = c.req.query("action");
  const since = c.req.query("since");
  const limit = parseInt(c.req.query("limit") || "30");

  const sb = getSupabase();
  let query = sb.from("audit_events").select("*").order("timestamp", { ascending: false }).limit(Math.min(limit, 100));

  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (actor) query = query.eq("actor_email", actor);
  if (actorAgentId) query = query.eq("actor_agent_id", actorAgentId);
  if (channel) query = query.eq("channel", channel);
  if (action) query = query.eq("action", action);
  if (since) query = query.gte("timestamp", since);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ events: data || [] }, 200, corsHeaders);
});

// ── POST /ping — track installs and updates (no auth) ───────────────
app.post("/ping", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await logAudit({
    actor_type: "system",
    entity_type: "cli",
    action: body.action || "install",
    channel: "system",
    state_after: { version: body.version, os: body.os },
  });
  return c.json({ ok: true }, 200, corsHeaders);
});

// ── GET /status — personal dashboard data ───────────────────────────
app.get("/status", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const sb = getSupabase();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString();

  const [eventsRes, tasksRes, openTasksRes, newsRes, feedbackRes, leaderboardRes] = await Promise.all([
    sb.from("audit_events").select("timestamp, entity_type, action, actor_email").eq("actor_email", user.email).gte("timestamp", weekStartStr),
    sb.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", user.email).eq("status", "completed").gte("completed_at", weekStartStr),
    sb.from("tasks").select("task_number, title, priority, due_date, status").eq("assigned_to", user.email).in("status", ["open", "in_progress"]).is("archived_at", null).order("created_at", { ascending: false }).limit(5),
    sb.from("audit_events").select("*", { count: "exact", head: true }).eq("actor_email", user.email).eq("entity_type", "news").eq("action", "published").gte("timestamp", weekStartStr),
    sb.from("audit_events").select("*", { count: "exact", head: true }).eq("actor_email", user.email).eq("entity_type", "feedback").gte("timestamp", weekStartStr),
    sb.from("audit_events").select("actor_email, actor_name").gte("timestamp", weekStartStr),
  ]);

  const events = eventsRes.data || [];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days: any[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const dayEvents = events.filter((e: any) => e.timestamp.startsWith(dateStr));
    const breakdown: Record<string, number> = {};
    for (const e of dayEvents) { breakdown[e.entity_type] = (breakdown[e.entity_type] || 0) + 1; }
    days.push({ date: dateStr, day: dayNames[i], actions: dayEvents.length, breakdown });
  }

  // Streak
  let streak = 0;
  const today = now.toISOString().split("T")[0];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const { count } = await sb.from("audit_events").select("*", { count: "exact", head: true }).eq("actor_email", user.email).gte("timestamp", dateStr + "T00:00:00").lt("timestamp", dateStr + "T23:59:59");
    if ((count || 0) > 0) streak++;
    else if (i > 0) break;
  }

  // Leaderboard
  const lbMap: Record<string, { name: string; count: number }> = {};
  for (const e of (leaderboardRes.data || [])) {
    const key = e.actor_email || "system";
    if (!lbMap[key]) lbMap[key] = { name: e.actor_name || key.split("@")[0], count: 0 };
    lbMap[key].count++;
  }
  const leaderboard = Object.values(lbMap).sort((a, b) => b.count - a.count).slice(0, 5);

  // Top task
  const topTask = (openTasksRes.data || [])[0] || null;

  return c.json({
    user: { email: user.email, name: user.name },
    week: {
      number: Math.ceil((now.getDate() + mondayOffset) / 7),
      days,
      tasks_completed: tasksRes.count || 0,
      tasks_open: (openTasksRes.data || []).length,
      news_published: newsRes.count || 0,
      feedback_submitted: feedbackRes.count || 0,
    },
    streak,
    top_task: topTask,
    open_tasks: openTasksRes.data || [],
    leaderboard,
  }, 200, corsHeaders);
});

// ── POST /agents — register agent ────────────────────────────────────
app.post("/agents", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.slug || !body.name) return c.json({ error: "slug and name required" }, 400, corsHeaders);

  const sb = getSupabase();
  const { error } = await sb.from("agents").insert({
    slug: body.slug,
    name: body.name,
    email: body.email || null,
    role: body.role || null,
    owner: body.owner || user.email,
    skill_slug: body.skill_slug || null,
    scopes: body.scopes || [],
    machine: body.machine || null,
    config: body.config || {},
  });

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "agent", entity_id: body.slug, action: "registered", channel: "api", state_after: { name: body.name, scopes: body.scopes } });

  return c.json({ ok: true, slug: body.slug }, 200, corsHeaders);
});

// ── GET /agents — list all agents ───────────────────────────────────
app.get("/agents", async (c) => {
  const sb = getSupabase();
  const { data, error } = await sb.from("agents").select("*").order("created_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ agents: data || [] }, 200, corsHeaders);
});

// ── GET /agents/:slug — single agent + activity ─────────────────────
app.get("/agents/:slug", async (c) => {
  const slug = c.req.param("slug");
  const sb = getSupabase();

  const { data: agent, error } = await sb.from("agents").select("*").eq("slug", slug).single();
  if (error || !agent) return c.json({ error: "Agent not found" }, 404, corsHeaders);

  const { data: activity } = await sb.from("audit_events").select("*").eq("actor_agent_id", slug).order("timestamp", { ascending: false }).limit(10);

  return c.json({ agent, activity: activity || [] }, 200, corsHeaders);
});

// ── PATCH /agents/:slug — update agent ──────────────────────────────
app.patch("/agents/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const slug = c.req.param("slug");
  const body = await c.req.json();
  const sb = getSupabase();

  const patch: any = {};
  for (const field of ["status", "scopes", "config", "machine", "skill_slug", "email", "role"]) {
    if (body[field] !== undefined) patch[field] = body[field];
  }

  if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update" }, 400, corsHeaders);

  const { error } = await sb.from("agents").update(patch).eq("slug", slug);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  const action = body.status ? "status_changed" : "updated";
  await logAudit({ actor_email: user.email, actor_name: user.name, entity_type: "agent", entity_id: slug, action, channel: "api", state_after: patch });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── POST /agents/:slug/heartbeat — agent liveness ───────────────────
app.post("/agents/:slug/heartbeat", async (c) => {
  const slug = c.req.param("slug");
  const sb = getSupabase();

  const { data: agent, error: fetchErr } = await sb.from("agents").select("status, scopes, last_seen").eq("slug", slug).single();
  if (fetchErr || !agent) return c.json({ error: "Agent not found" }, 404, corsHeaders);

  const now = new Date().toISOString();
  await sb.from("agents").update({ last_seen: now }).eq("slug", slug);

  const lastSeen = agent.last_seen ? new Date(agent.last_seen) : null;
  const gap = lastSeen ? (Date.now() - lastSeen.getTime()) / 1000 : Infinity;
  if (gap > 300) {
    await logAudit({ actor_agent_id: slug, actor_type: "agent", entity_type: "agent", entity_id: slug, action: "heartbeat", channel: "system" });
  }

  return c.json({ status: agent.status, scopes: agent.scopes }, 200, corsHeaders);
});

// ── Health ─────────────────────────────────────────────────────────────
app.get("/", (c) => c.json({ status: "ok", service: "skills-api" }, 200, corsHeaders));

Deno.serve(app.fetch);
