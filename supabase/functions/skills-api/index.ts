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
  context?: any;
  project_id?: string | null;
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

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function verifyMsJwt(token: string): Promise<any | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(headerB64)));
  if (header.alg !== "RS256" || !header.kid) return null;

  const jwks = await getJwks();
  const jwk = jwks.keys?.find((key: any) => key.kid === header.kid);
  if (!jwk) return null;

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, ext: true, key_ops: ["verify"] },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    decodeBase64Url(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return null;

  return JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadB64)));
}

async function validateMsToken(req: Request): Promise<{ email: string; name: string } | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  try {
    const payload = await verifyMsJwt(token);
    if (!payload) return null;

    const email = payload.email || payload.preferred_username || payload.upn;
    if (!email?.endsWith("@astarconsulting.no")) return null;
    if (payload.tid && payload.tid !== TENANT_ID) return null;
    if (payload.iss && !String(payload.iss).includes(TENANT_ID)) return null;

    if (payload.exp && payload.exp * 1000 < Date.now()) return null;

    return { email: email.toLowerCase(), name: payload.name || email.split("@")[0] };
  } catch {
    return null;
  }
}

type AuthUser = { email: string; name: string };
type ProjectRecord = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  visibility: string;
  owner: string;
  members?: string[] | null;
  created_at: string;
  updated_at: string;
};

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isStaffEmail(email?: string | null): boolean {
  return !!email?.endsWith("@astarconsulting.no");
}

function normalizeProjectMembers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);
}

function parseProjectMembers(value: unknown): string[] {
  const members = normalizeProjectMembers(Array.isArray(value) ? value : value ? [value] : []);
  return [...new Set(members.filter((email) => isStaffEmail(email)))];
}

function projectSummary(project: any) {
  if (!project) return null;
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    visibility: project.visibility,
    owner: project.owner,
  };
}

function canAccessProject(project: any, user: AuthUser): boolean {
  if (!project) return false;
  if (project.visibility === "public") return isStaffEmail(user.email);
  if (project.visibility === "team") {
    return project.owner === user.email || normalizeProjectMembers(project.members).includes(user.email.toLowerCase());
  }
  return project.owner === user.email;
}

function canModifyProject(project: any, user: AuthUser): boolean {
  return !!project && project.owner === user.email;
}

function eventSummary(event: any) {
  if (!event) return null;
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    type: event.type,
    status: event.status,
    date: event.date,
    date_tentative: event.date_tentative,
    location: event.location,
    project_id: event.project_id || null,
    project: event.project || null,
  };
}

async function buildProjectMap(sb: ReturnType<typeof getSupabase>, projectIds: string[]): Promise<Map<string, ProjectRecord>> {
  if (!projectIds.length) return new Map();
  const { data: projects } = await sb.from("projects").select("*").in("id", projectIds);
  return new Map((projects || []).map((project: any) => [project.id, project]));
}

async function hydrateRecordsWithProjects(sb: ReturnType<typeof getSupabase>, records: any[]) {
  const rows = records.filter(Boolean);
  if (!rows.length) return new Map<string, ProjectRecord>();
  const projectIds = [...new Set(rows.map((record) => record.project_id).filter(Boolean))];
  const projectMap = await buildProjectMap(sb, projectIds);
  for (const record of rows) {
    record.project = record.project_id ? projectSummary(projectMap.get(record.project_id)) || null : null;
  }
  return projectMap;
}

async function resolveProjectRef(sb: ReturnType<typeof getSupabase>, ref: string) {
  if (!ref) return null;
  const query = sb.from("projects").select("*");
  const { data } = isUuid(ref)
    ? await query.eq("id", ref).maybeSingle()
    : await query.eq("slug", ref).maybeSingle();
  return data || null;
}

function canAccessEvent(event: any, user: AuthUser, project?: any | null): boolean {
  if (!event) return false;
  if (event.visibility === "private") return event.created_by === user.email;
  if (project) return canAccessProject(project, user);
  return event.visibility === "public" || event.visibility === "team" || event.created_by === user.email;
}

function canAccessTask(task: any, user: AuthUser, project?: any | null): boolean {
  if (!task) return false;
  const isOwner = task.created_by === user.email || task.assigned_to === user.email;
  if (task.visibility === "private") return isOwner;
  if (isOwner) return true;
  if (project) return canAccessProject(project, user);
  return task.visibility === "public" || task.visibility === "team";
}

function canAccessMilestone(milestone: any, user: AuthUser, project?: any | null): boolean {
  if (!milestone) return false;
  if (project) return canAccessProject(project, user);
  return isStaffEmail(user.email);
}

function canAccessAgent(agent: any, user: AuthUser, project?: any | null): boolean {
  if (!agent) return false;
  if (project) return canAccessProject(project, user);
  return isStaffEmail(user.email);
}

function canModifyTask(task: any, user: AuthUser): boolean {
  return !!task && (task.created_by === user.email || task.assigned_to === user.email);
}

async function listOwnedAgentSlugs(sb: ReturnType<typeof getSupabase>, ownerEmail: string): Promise<Set<string>> {
  const { data } = await sb.from("agents").select("slug").eq("owner", ownerEmail);
  return new Set((data || []).map((agent: any) => agent.slug).filter(Boolean));
}

function canReadAuditEvent(event: any, user: AuthUser, ownedAgentSlugs: Set<string>, project?: any | null): boolean {
  return event.actor_email === user.email
    || (!!event.actor_agent_id && ownedAgentSlugs.has(event.actor_agent_id))
    || (!!project && canAccessProject(project, user));
}

async function resolveEventRef(sb: ReturnType<typeof getSupabase>, ref: string) {
  if (!ref) return null;
  const query = sb.from("events").select("*");
  const { data } = isUuid(ref)
    ? await query.eq("id", ref).maybeSingle()
    : await query.eq("slug", ref).maybeSingle();
  if (data) await hydrateRecordsWithProjects(sb, [data]);
  return data || null;
}

function collectTaskNodes(tasks: any[]): any[] {
  const nodes: any[] = [];
  const stack = [...tasks];
  while (stack.length) {
    const task = stack.pop();
    if (!task) continue;
    nodes.push(task);
    if (task.subtasks?.length) stack.push(...task.subtasks);
  }
  return nodes;
}

async function hydrateTasksWithContext(sb: ReturnType<typeof getSupabase>, tasks: any[]) {
  const nodes = collectTaskNodes(tasks);
  if (!nodes.length) return;

  await hydrateRecordsWithProjects(sb, nodes);

  const eventIds = [...new Set(nodes.map((task) => task.event_id).filter(Boolean))];
  if (!eventIds.length) {
    for (const task of nodes) task.event = null;
    return;
  }

  const { data: events } = await sb.from("events").select("*").in("id", eventIds);
  await hydrateRecordsWithProjects(sb, events || []);
  const eventMap = new Map((events || []).map((event: any) => [event.id, eventSummary(event)]));

  for (const task of nodes) {
    task.event = task.event_id ? eventMap.get(task.event_id) || null : null;
  }
}

async function logEventAudit(eventId: string, eventSlug: string, actor: { email: string; name: string }, action: string, opts: { state_before?: any; state_after?: any; channel?: string; project_id?: string | null } = {}) {
  await logAudit({
    actor_email: actor.email,
    actor_name: actor.name,
    actor_type: "human",
    entity_type: "event",
    entity_id: eventSlug,
    action,
    state_before: opts.state_before,
    state_after: opts.state_after,
    channel: opts.channel || "api",
    context: { event_uuid: eventId },
    project_id: opts.project_id || null,
  });
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

  await logAudit({ actor_email: user.email, actor_name: user.name, actor_type: "human", entity_type: "skill", entity_id: skillSlug, action: "pushed", channel: "api", state_after: { title } });

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

// ── GET /projects — list projects ───────────────────────────────────
app.get("/projects", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const search = (c.req.query("search") || "").trim().toLowerCase();
  const sb = getSupabase();
  const { data, error } = await sb.from("projects").select("*").order("updated_at", { ascending: false }).limit(100);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  let projects = (data || []).filter((project: any) => canAccessProject(project, user));
  if (search) {
    projects = projects.filter((project: any) =>
      [project.slug, project.name, project.description].some((field) => String(field || "").toLowerCase().includes(search))
    );
  }

  return c.json({
    projects: projects.map((project: any) => ({
      ...project,
      project: projectSummary(project),
    })),
  }, 200, corsHeaders);
});

// ── POST /projects — create project ────────────────────────────────
app.post("/projects", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400, corsHeaders);

  const slug = body.slug ? slugify(body.slug) : slugify(body.name);
  if (!slug) return c.json({ error: "slug could not be derived from name" }, 400, corsHeaders);

  const owner = String(body.owner || user.email).trim().toLowerCase();
  if (!isStaffEmail(owner)) return c.json({ error: "owner must be an @astarconsulting.no email" }, 400, corsHeaders);

  const members = parseProjectMembers(body.members);
  const sb = getSupabase();
  const { data, error } = await sb.from("projects").insert({
    slug,
    name: body.name,
    description: body.description || null,
    visibility: body.visibility || "team",
    owner,
    members: members.filter((member) => member !== owner),
  }).select("*").single();
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "project",
    entity_id: data.slug,
    action: "created",
    channel: "api",
    project_id: data.id,
    state_after: {
      name: data.name,
      visibility: data.visibility,
      owner: data.owner,
      members: data.members,
    },
  });

  return c.json({ ok: true, slug: data.slug }, 200, corsHeaders);
});

// ── GET /projects/:slug — project detail + linked work ─────────────
app.get("/projects/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const ref = c.req.param("slug");
  const sb = getSupabase();
  const project = await resolveProjectRef(sb, ref);
  if (!project || !canAccessProject(project, user)) return c.json({ error: "Project not found" }, 404, corsHeaders);

  const [
    tasksResult,
    eventsResult,
    agentsResult,
    milestonesResult,
  ] = await Promise.all([
    sb.from("tasks")
      .select("*")
      .eq("project_id", project.id)
      .is("parent_task_id", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("events")
      .select("*")
      .eq("project_id", project.id)
      .order("date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("agents")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("milestones")
      .select("*")
      .eq("project_id", project.id)
      .order("date", { ascending: false })
      .limit(50),
  ]);

  if (tasksResult.error) return c.json({ error: tasksResult.error.message }, 500, corsHeaders);
  if (eventsResult.error) return c.json({ error: eventsResult.error.message }, 500, corsHeaders);
  if (agentsResult.error) return c.json({ error: agentsResult.error.message }, 500, corsHeaders);
  if (milestonesResult.error) return c.json({ error: milestonesResult.error.message }, 500, corsHeaders);

  const tasks = (tasksResult.data || []).filter((task: any) => canAccessTask(task, user, project));
  const events = (eventsResult.data || []).filter((event: any) => canAccessEvent(event, user, project));
  const agents = (agentsResult.data || []).filter((agent: any) => canAccessAgent(agent, user, project));
  const milestones = (milestonesResult.data || []).filter((milestone: any) => canAccessMilestone(milestone, user, project));

  await hydrateTasksWithContext(sb, tasks as any[]);
  await hydrateRecordsWithProjects(sb, events as any[]);
  await hydrateRecordsWithProjects(sb, agents as any[]);
  await hydrateRecordsWithProjects(sb, milestones as any[]);

  return c.json({
    project: {
      ...project,
      project: projectSummary(project),
    },
    tasks,
    events,
    agents,
    milestones,
  }, 200, corsHeaders);
});

// ── PATCH /projects/:slug — update project ─────────────────────────
app.patch("/projects/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const ref = c.req.param("slug");
  const body = await c.req.json();
  const sb = getSupabase();
  const project = await resolveProjectRef(sb, ref);
  if (!project || !canAccessProject(project, user)) return c.json({ error: "Project not found" }, 404, corsHeaders);
  if (!canModifyProject(project, user)) return c.json({ error: "Only the project owner can update this project" }, 403, corsHeaders);

  const patch: any = { updated_at: new Date().toISOString() };
  const before: Record<string, any> = {};
  const after: Record<string, any> = {};

  if (body.name !== undefined) {
    patch.name = body.name;
    before.name = project.name;
    after.name = body.name;
  }
  if (body.slug !== undefined) {
    const slug = slugify(body.slug);
    if (!slug) return c.json({ error: "slug could not be derived from input" }, 400, corsHeaders);
    patch.slug = slug;
    before.slug = project.slug;
    after.slug = slug;
  }
  if (body.description !== undefined) {
    patch.description = body.description || null;
    before.description = project.description || null;
    after.description = patch.description;
  }
  if (body.visibility !== undefined) {
    patch.visibility = body.visibility;
    before.visibility = project.visibility;
    after.visibility = body.visibility;
  }
  if (body.owner !== undefined) {
    const owner = String(body.owner || "").trim().toLowerCase();
    if (!isStaffEmail(owner)) return c.json({ error: "owner must be an @astarconsulting.no email" }, 400, corsHeaders);
    patch.owner = owner;
    before.owner = project.owner;
    after.owner = owner;
  }
  if (body.members !== undefined) {
    const members = parseProjectMembers(body.members);
    const nextOwner = patch.owner || project.owner;
    patch.members = members.filter((member) => member !== nextOwner);
    before.members = normalizeProjectMembers(project.members);
    after.members = patch.members;
  }

  if (!Object.keys(after).length) return c.json({ error: "No fields to update" }, 400, corsHeaders);

  const { error } = await sb.from("projects").update(patch).eq("id", project.id);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "project",
    entity_id: patch.slug || project.slug,
    action: "updated",
    channel: "api",
    project_id: project.id,
    state_before: before,
    state_after: after,
  });

  return c.json({ ok: true, slug: patch.slug || project.slug }, 200, corsHeaders);
});

// ── DELETE /projects/:slug — delete project ─────────────────────────
app.delete("/projects/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const ref = c.req.param("slug");
  const sb = getSupabase();
  const project = await resolveProjectRef(sb, ref);
  if (!project || !canAccessProject(project, user)) return c.json({ error: "Project not found" }, 404, corsHeaders);
  if (!canModifyProject(project, user)) return c.json({ error: "Only the project owner can delete this project" }, 403, corsHeaders);

  await sb.from("tasks").update({ project_id: null }).eq("project_id", project.id);
  await sb.from("events").update({ project_id: null }).eq("project_id", project.id);
  await sb.from("milestones").update({ project_id: null }).eq("project_id", project.id);
  await sb.from("agents").update({ project_id: null }).eq("project_id", project.id);

  const { error } = await sb.from("projects").delete().eq("id", project.id);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "project",
    entity_id: project.slug,
    action: "deleted",
    channel: "api",
    project_id: project.id,
    state_before: { slug: project.slug, name: project.name, visibility: project.visibility, owner: project.owner, members: project.members },
  });

  return c.json({ ok: true, deleted: project.slug }, 200, corsHeaders);
});

// ── GET /events — list events ───────────────────────────────────────
app.get("/events", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const status = c.req.query("status");
  const type = c.req.query("type");
  const month = c.req.query("month");
  const projectRef = c.req.query("project");
  const search = (c.req.query("search") || "").trim().toLowerCase();
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
  const fetchLimit = search ? 100 : limit;

  const sb = getSupabase();
  if (projectRef) {
    const project = await resolveProjectRef(sb, projectRef);
    if (!project) return c.json({ error: `Project "${projectRef}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
  }
  let query = sb.from("events")
    .select("*")
    .order("date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);
  if (month) query = query.gte("date", `${month}-01`).lte("date", `${month}-31`);
  if (projectRef) {
    const project = await resolveProjectRef(sb, projectRef);
    query = query.eq("project_id", project!.id);
  }

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  const events = data || [];
  await hydrateRecordsWithProjects(sb, events as any[]);
  let visibleEvents = events.filter((event: any) => canAccessEvent(event, user, event.project));
  if (search) {
    visibleEvents = visibleEvents.filter((event: any) =>
      [event.title, event.goal, event.location, event.slug].some((field) => String(field || "").toLowerCase().includes(search))
    );
  }

  return c.json({ events: visibleEvents.slice(0, limit) }, 200, corsHeaders);
});

// ── GET /events/:slug — single event ────────────────────────────────
app.get("/events/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const ref = c.req.param("slug");
  const sb = getSupabase();
  const event = await resolveEventRef(sb, ref);
  if (!event) return c.json({ error: "Event not found" }, 404, corsHeaders);
  if (!canAccessEvent(event, user, event.project)) return c.json({ error: "Forbidden" }, 403, corsHeaders);

  const { data: tasks, error } = await sb.from("tasks")
    .select("*")
    .eq("event_id", event.id)
    .is("parent_task_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  if (tasks?.length) {
    const parentIds = tasks.map((task: any) => task.id);
    const { data: subtasks } = await sb.from("tasks")
      .select("*")
      .in("parent_task_id", parentIds)
      .is("archived_at", null)
      .order("task_number", { ascending: true });
    if (subtasks?.length) {
      const byParent: Record<string, any[]> = {};
      for (const subtask of subtasks) (byParent[subtask.parent_task_id] ||= []).push(subtask);
      for (const task of tasks as any[]) task.subtasks = byParent[task.id] || [];
    }
    await hydrateTasksWithContext(sb, tasks as any[]);
    for (const task of tasks as any[]) {
      task.subtasks = (task.subtasks || []).filter((subtask: any) => canAccessTask(subtask, user, subtask.project || event.project));
    }
  }

  const visibleTasks = (tasks || []).filter((task: any) => canAccessTask(task, user, task.project || event.project));
  return c.json({ event, tasks: visibleTasks }, 200, corsHeaders);
});

// ── POST /events — create event ─────────────────────────────────────
app.post("/events", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400, corsHeaders);
  if (!body.goal) return c.json({ error: "goal is required" }, 400, corsHeaders);

  const sb = getSupabase();
  const slug = body.slug ? slugify(body.slug) : slugify(body.title);
  if (!slug) return c.json({ error: "slug could not be derived from title" }, 400, corsHeaders);

  let projectId = null;
  if (body.project) {
    const project = await resolveProjectRef(sb, body.project);
    if (!project) return c.json({ error: `Project "${body.project}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    projectId = project.id;
  }

  const { data, error } = await sb.from("events").insert({
    slug,
    title: body.title,
    type: body.type || "attending",
    status: body.status || "tentative",
    goal: body.goal,
    date: body.date || null,
    date_tentative: body.date_tentative ?? false,
    location: body.location || null,
    attendees: Array.isArray(body.attendees) ? body.attendees : [],
    visibility: body.visibility || "team",
    created_by: user.email,
    project_id: projectId,
  }).select("*").single();
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logEventAudit(data.id, data.slug, user, "created", {
    state_after: {
      title: data.title,
      type: data.type,
      status: data.status,
      date: data.date,
      location: data.location,
    },
    project_id: data.project_id,
  });

  return c.json({ ok: true, slug: data.slug }, 200, corsHeaders);
});

// ── PATCH /events/:slug — update event ──────────────────────────────
app.patch("/events/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const ref = c.req.param("slug");
  const body = await c.req.json();
  const sb = getSupabase();
  const event = await resolveEventRef(sb, ref);
  if (!event) return c.json({ error: "Event not found" }, 404, corsHeaders);
  if (event.created_by !== user.email) return c.json({ error: "Only the creator can update this event" }, 403, corsHeaders);

  const patch: any = { updated_at: new Date().toISOString() };
  const before: Record<string, any> = {};
  const after: Record<string, any> = {};

  for (const field of ["title", "type", "status", "goal", "date", "date_tentative", "location", "attendees", "visibility"]) {
    if (body[field] !== undefined) {
      patch[field] = body[field];
      before[field] = event[field];
      after[field] = body[field];
    }
  }
  if (body.project !== undefined) {
    if (!body.project) {
      patch.project_id = null;
      before.project_id = event.project_id || null;
      after.project_id = null;
    } else {
      const project = await resolveProjectRef(sb, body.project);
      if (!project) return c.json({ error: `Project "${body.project}" not found` }, 404, corsHeaders);
      if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
      patch.project_id = project.id;
      before.project_id = event.project_id || null;
      after.project_id = project.id;
    }
  }

  if (!Object.keys(after).length) return c.json({ error: "No fields to update" }, 400, corsHeaders);

  const { error } = await sb.from("events").update(patch).eq("id", event.id);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logEventAudit(event.id, event.slug, user, "updated", {
    state_before: before,
    state_after: after,
    project_id: patch.project_id ?? event.project_id ?? null,
  });

  return c.json({ ok: true, slug: event.slug }, 200, corsHeaders);
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

  await logAudit({ actor_email: user.email, actor_name: user.name, actor_type: "human", entity_type: "news", entity_id: slug, action: "published", channel: "api", state_after: { title, category: body.category } });

  return c.json({ ok: true, slug }, 200, corsHeaders);
});

// ── GET /feedback — list feedback ────────────────────────────────────
app.get("/feedback", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

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
  const { data: fbData, error } = await sb.from("feedback").insert({
    content: body.content,
    type: body.type || "feature",
    source: body.source || "human",
    author_email: user.email,
    author_name: user.name,
    linked_skill: body.linked_skill || null,
    linked_news: body.linked_news || null,
    context: body.context || {},
  }).select("id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({ actor_email: user.email, actor_name: user.name, actor_type: "human", entity_type: "feedback", entity_id: fbData?.id, action: "submitted", channel: "api", state_after: { type: body.type || "feature", content: body.content } });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── PATCH /feedback/:id — update feedback status ────────────────────
app.patch("/feedback/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const body = await c.req.json();
  const sb = getSupabase();

  const { data: existing } = await sb.from("feedback").select("status").eq("id", id).single();

  const patch: any = {};
  if (body.status) patch.status = body.status;
  if (body.resolution !== undefined) patch.resolution = body.resolution;

  if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update" }, 400, corsHeaders);

  const { error } = await sb.from("feedback").update(patch).eq("id", id);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({ actor_email: user.email, actor_name: user.name, actor_type: "human", entity_type: "feedback", entity_id: id, action: "status_changed", channel: "api", state_before: { status: existing?.status }, state_after: patch });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── GET /milestones — list milestones ────────────────────────────────
app.get("/milestones", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const month = c.req.query("month");
  const projectRef = c.req.query("project");
  const sb = getSupabase();
  let query = sb.from("milestones").select("*").order("date", { ascending: false }).limit(50);
  if (month) {
    query = query.gte("date", `${month}-01`).lte("date", `${month}-31`);
  }
  if (projectRef) {
    const project = await resolveProjectRef(sb, projectRef);
    if (!project) return c.json({ error: `Project "${projectRef}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    query = query.eq("project_id", project.id);
  }
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  const milestones = data || [];
  await hydrateRecordsWithProjects(sb, milestones as any[]);
  return c.json({
    milestones: milestones.filter((milestone: any) => canAccessMilestone(milestone, user, milestone.project)),
  }, 200, corsHeaders);
});

// ── POST /milestones — create milestone ─────────────────────────────
app.post("/milestones", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400, corsHeaders);

  const sb = getSupabase();
  let projectId = null;
  if (body.project) {
    const project = await resolveProjectRef(sb, body.project);
    if (!project) return c.json({ error: `Project "${body.project}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    projectId = project.id;
  }

  const { data: msData, error } = await sb.from("milestones").insert({
    title: body.title,
    date: body.date || new Date().toISOString().split("T")[0],
    category: body.category || "general",
    created_by: user.name,
    project_id: projectId,
  }).select("id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "milestone",
    entity_id: msData?.id,
    action: "created",
    channel: "api",
    project_id: projectId,
    state_after: { title: body.title, category: body.category || "general", date: body.date },
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

  await logAudit({ actor_email: user.email, actor_name: user.name, actor_type: "human", entity_type: "inquiry", entity_id: data.id, action: "submitted", channel: "api", state_after: { type } });

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

    await logAudit({ actor_email: user.email, actor_name: user.name, actor_type: "human", entity_type: "inquiry", entity_id: id, action: "processed", channel: "api", state_after: { status: body.status, response: body.response } });

    return c.json({ ok: true }, 200, corsHeaders);
  }

  return c.json({ error: "status must be processing, completed, or failed" }, 400, corsHeaders);
});

// ── Agent Inbox ─────────────────────────────────────────────────────

function inferMessageType(content: string): "action" | "question" | "review" {
  const lower = content.toLowerCase().trim();
  if (lower.includes("?") || /^(what|how|why|when|who|where|is |are |can |do |does )/.test(lower)) return "question";
  if (/^review|review this|check this/.test(lower)) return "review";
  return "action";
}

app.post("/ask/:agent_slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const slug = c.req.param("agent_slug");
  const sb = getSupabase();

  const { data: agent } = await sb.from("agents").select("*").eq("slug", slug).single();
  if (!agent) return c.json({ error: `Agent '${slug}' not found` }, 404, corsHeaders);
  await hydrateRecordsWithProjects(sb, [agent]);
  if (!canAccessAgent(agent, user, agent.project)) return c.json({ error: `Agent '${slug}' not found` }, 404, corsHeaders);
  if (agent.status !== "active") return c.json({ error: `Agent '${slug}' is ${agent.status}` }, 400, corsHeaders);

  const body = await c.req.json();
  if (!body.content) return c.json({ error: "content is required" }, 400, corsHeaders);

  const type = body.type || inferMessageType(body.content);
  if (!["action", "question", "review"].includes(type)) {
    return c.json({ error: "type must be action, question, or review" }, 400, corsHeaders);
  }

  const { data, error } = await sb.from("agent_inbox").insert({
    agent_slug: slug,
    type,
    content: body.content,
    author_email: user.email,
    author_name: user.name,
    delivery_channel: body.delivery_channel || "cli",
  }).select("id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "inbox",
    entity_id: data.id,
    action: "submitted",
    channel: "api",
    project_id: agent.project_id || null,
    state_after: { agent_slug: slug, type },
  });

  return c.json({ ok: true, id: data.id, type }, 200, corsHeaders);
});

app.get("/ask/:agent_slug/pending", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const slug = c.req.param("agent_slug");
  const sb = getSupabase();

  await sb.from("agent_inbox")
    .update({ status: "pending", locked_by: null, locked_at: null })
    .eq("agent_slug", slug)
    .eq("status", "processing")
    .lt("locked_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

  const { data, error } = await sb.from("agent_inbox")
    .select("*")
    .eq("agent_slug", slug)
    .eq("status", "pending")
    .is("locked_by", null)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ messages: data || [] }, 200, corsHeaders);
});

app.get("/ask/:agent_slug/health", async (c) => {
  const slug = c.req.param("agent_slug");
  const sb = getSupabase();

  const { data: pending } = await sb.from("agent_inbox")
    .select("created_at")
    .eq("agent_slug", slug)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  const { data: lastDone } = await sb.from("agent_inbox")
    .select("processed_at")
    .eq("agent_slug", slug)
    .eq("status", "completed")
    .order("processed_at", { ascending: false })
    .limit(1);

  const { count } = await sb.from("agent_inbox")
    .select("*", { count: "exact", head: true })
    .eq("agent_slug", slug)
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

app.get("/ask/:agent_slug/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const sb = getSupabase();
  const { data, error } = await sb.from("agent_inbox")
    .select("*")
    .eq("id", id)
    .eq("author_email", user.email)
    .single();

  if (error || !data) return c.json({ error: "Not found" }, 404, corsHeaders);
  return c.json({ message: data }, 200, corsHeaders);
});

app.get("/ask/:agent_slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const slug = c.req.param("agent_slug");
  const status = c.req.query("status");
  const sb = getSupabase();
  let query = sb.from("agent_inbox")
    .select("*")
    .eq("agent_slug", slug)
    .eq("author_email", user.email)
    .order("created_at", { ascending: false })
    .limit(20);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ messages: data || [] }, 200, corsHeaders);
});

app.patch("/ask/:agent_slug/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const body = await c.req.json();
  const sb = getSupabase();

  if (body.status === "processing") {
    const { error } = await sb.from("agent_inbox")
      .update({ status: "processing", locked_by: user.email, locked_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["pending"]);
    if (error) return c.json({ error: error.message }, 500, corsHeaders);
    return c.json({ ok: true }, 200, corsHeaders);
  }

  if (body.status === "completed" || body.status === "failed") {
    const { error } = await sb.from("agent_inbox")
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

    await logAudit({ actor_email: user.email, actor_name: user.name, actor_type: "human", entity_type: "inbox", entity_id: id, action: "processed", channel: "api", state_after: { status: body.status, response: body.response } });

    return c.json({ ok: true }, 200, corsHeaders);
  }

  return c.json({ error: "status must be processing, completed, or failed" }, 400, corsHeaders);
});

// ── Task audit helper ────────────────────────────────────────────────
async function logTaskAudit(taskId: string, taskNumber: string | number, actor: string, actorName: string | null, actorType: string, action: string, opts: { state_before?: any; state_after?: any; channel?: string; project_id?: string | null } = {}) {
  await logAudit({
    actor_email: actor,
    actor_name: actorName,
    actor_type: actorType,
    entity_type: "task",
    entity_id: String(taskNumber),
    action,
    state_before: opts.state_before,
    state_after: opts.state_after,
    channel: opts.channel || "api",
    context: { task_uuid: taskId },
    project_id: opts.project_id || null,
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
  let parentProjectId = null;
  if (body.parent_task_number) {
    const { data: parent } = await sb.from("tasks").select("*").eq("task_number", body.parent_task_number).single();
    if (parent) await hydrateRecordsWithProjects(sb, [parent]);
    if (parent && !canAccessTask(parent, user, parent.project)) {
      return c.json({ error: `Parent task #${body.parent_task_number} not found` }, 404, corsHeaders);
    }
    if (parent) {
      parentId = parent.id;
      parentProjectId = parent.project_id || null;
    }
  }

  let eventId = null;
  let eventProjectId = null;
  let eventSlug = null;
  if (body.event) {
    const event = await resolveEventRef(sb, body.event);
    if (!event) return c.json({ error: `Event "${body.event}" not found` }, 404, corsHeaders);
    if (!canAccessEvent(event, user, event.project)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    eventId = event.id;
    eventProjectId = event.project_id || null;
    eventSlug = event.slug;
  }

  let projectId = null;
  if (body.project) {
    const project = await resolveProjectRef(sb, body.project);
    if (!project) return c.json({ error: `Project "${body.project}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    projectId = project.id;
  }

  for (const scopedProjectId of [parentProjectId, eventProjectId]) {
    if (!scopedProjectId) continue;
    if (projectId && projectId !== scopedProjectId) {
      return c.json({ error: "Parent task, event, and project must belong to the same project" }, 400, corsHeaders);
    }
    projectId = scopedProjectId;
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
    event_id: eventId,
    visibility: body.visibility || "private",
    project_id: projectId,
  }).select("task_number, id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  if (body.links?.length) {
    for (const link of body.links) {
      await sb.from("task_links").insert({ task_id: data.id, link_type: link.type, link_ref: link.ref });
    }
  }

  await logTaskAudit(data.id, data.task_number, user.email, user.name, isAgent ? "agent" : "human", "created", {
    state_after: {
      title: body.title,
      priority: body.priority || "medium",
      assigned_to: body.assigned_to || user.email,
      project_id: projectId,
      event: eventSlug,
    },
    project_id: projectId,
  });

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
  const eventRef = c.req.query("event");
  const projectRef = c.req.query("project");
  const maxTasks = 50;
  const fetchLimit = 200;

  const sb = getSupabase();
  let filterProject: any = null;
  let filterEvent: any = null;
  let query = sb.from("tasks").select("*").is("archived_at", null).order("created_at", { ascending: false }).limit(fetchLimit);

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
    query = query.or(`assigned_to.eq.${user.email},created_by.eq.${user.email}`);
  }

  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.not("status", "in", '("cancelled")');
  }

  if (priority) query = query.eq("priority", priority);

  if (eventRef) {
    filterEvent = await resolveEventRef(sb, eventRef);
    if (!filterEvent) return c.json({ error: `Event "${eventRef}" not found` }, 404, corsHeaders);
    if (!canAccessEvent(filterEvent, user, filterEvent.project)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    query = query.eq("event_id", filterEvent.id);
  }

  if (projectRef) {
    filterProject = await resolveProjectRef(sb, projectRef);
    if (!filterProject) return c.json({ error: `Project "${projectRef}" not found` }, 404, corsHeaders);
    if (!canAccessProject(filterProject, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    query = query.eq("project_id", filterProject.id);
  }

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
  const tasks = data || [];

  const includeSubtasks = c.req.query("include_subtasks") === "true";
  if (includeSubtasks && tasks.length && !parent) {
    const parentIds = tasks.map((t: any) => t.id);
    const { data: subs } = await sb.from("tasks").select("*").in("parent_task_id", parentIds).is("archived_at", null).order("task_number", { ascending: true });
    if (subs?.length) {
      const subsByParent: Record<string, any[]> = {};
      for (const subtask of subs) (subsByParent[subtask.parent_task_id] ||= []).push(subtask);
      for (const task of tasks as any[]) task.subtasks = subsByParent[task.id] || [];
    }
  }

  if (tasks.length) {
    await hydrateTasksWithContext(sb, tasks as any[]);
    for (const task of tasks as any[]) {
      task.subtasks = (task.subtasks || []).filter((subtask: any) =>
        canAccessTask(subtask, user, subtask.project || filterProject || filterEvent?.project || null)
      );
    }
  }

  const visibleTasks = tasks
    .filter((task: any) => canAccessTask(task, user, task.project || filterProject || filterEvent?.project || null))
    .slice(0, maxTasks);

  return c.json({ tasks: visibleTasks }, 200, corsHeaders);
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
  await hydrateRecordsWithProjects(sb, [task]);
  if (!canAccessTask(task, user, task.project)) return c.json({ error: "Task not found" }, 404, corsHeaders);

  const { data: activity } = await sb.from("audit_events").select("*").eq("entity_type", "task").eq("entity_id", String(task.task_number)).order("timestamp", { ascending: false }).limit(20);
  const { data: subtasks } = await sb.from("tasks").select("*").eq("parent_task_id", task.id).order("task_number", { ascending: true });
  const { data: links } = await sb.from("task_links").select("*").eq("task_id", task.id).order("created_at", { ascending: true });
  const hydratedTask = { ...task, subtasks: subtasks || [] };
  await hydrateTasksWithContext(sb, [hydratedTask] as any[]);
  const visibleSubtasks = (hydratedTask.subtasks || []).filter((subtask: any) => canAccessTask(subtask, user, subtask.project || task.project));

  Object.assign(task, { event: hydratedTask.event });
  Object.assign(task, { project: hydratedTask.project });

  return c.json({ task, activity: activity || [], subtasks: visibleSubtasks, links: links || [] }, 200, corsHeaders);
});

// ── PATCH /tasks/:number — update task ──────────────────────────────
app.patch("/tasks/:number", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const num = parseInt(c.req.param("number"));
  const sb = getSupabase();

  const { data: task, error: fetchErr } = await sb.from("tasks").select("*").eq("task_number", num).single();
  if (fetchErr || !task) return c.json({ error: "Task not found" }, 404, corsHeaders);
  await hydrateRecordsWithProjects(sb, [task]);
  if (!canAccessTask(task, user, task.project)) return c.json({ error: "Task not found" }, 404, corsHeaders);

  if (!canModifyTask(task, user)) {
    return c.json({ error: "Only the creator or assignee can modify this task" }, 403, corsHeaders);
  }

  const body = await c.req.json();
  const patch: any = { updated_at: new Date().toISOString() };
  const changes: Record<string, any> = {};
  let nextProjectId = task.project_id || null;

  for (const field of ["status", "priority", "assigned_to", "due_date", "description", "tags", "visibility"]) {
    if (body[field] !== undefined) {
      changes[field] = { from: task[field], to: body[field] };
      patch[field] = body[field];
    }
  }
  if (body.project !== undefined) {
    if (!body.project) {
      nextProjectId = null;
    } else {
      const project = await resolveProjectRef(sb, body.project);
      if (!project) return c.json({ error: `Project "${body.project}" not found` }, 404, corsHeaders);
      if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
      nextProjectId = project.id;
    }
  }
  if (body.event !== undefined) {
    if (!body.event) {
      patch.event_id = null;
      changes.event_id = { from: task.event_id, to: null };
    } else {
      const event = await resolveEventRef(sb, body.event);
      if (!event) return c.json({ error: `Event "${body.event}" not found` }, 404, corsHeaders);
      if (!canAccessEvent(event, user, event.project)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
      if (event.project_id && nextProjectId && nextProjectId !== event.project_id) {
        return c.json({ error: "Task project and event project must match" }, 400, corsHeaders);
      }
      patch.event_id = event.id;
      changes.event_id = { from: task.event_id, to: event.id };
      if (event.project_id) nextProjectId = event.project_id;
    }
  }
  if (body.parent_task_number !== undefined) {
    if (body.parent_task_number === 0) {
      patch.parent_task_id = null;
      changes.parent_task_id = { from: task.parent_task_id, to: null };
    } else {
      const { data: parentTask } = await sb.from("tasks").select("*").eq("task_number", body.parent_task_number).single();
      if (!parentTask) return c.json({ error: `Parent task #${body.parent_task_number} not found` }, 404, corsHeaders);
      await hydrateRecordsWithProjects(sb, [parentTask]);
      if (!canAccessTask(parentTask, user, parentTask.project)) return c.json({ error: `Parent task #${body.parent_task_number} not found` }, 404, corsHeaders);
      if (parentTask.project_id && nextProjectId && nextProjectId !== parentTask.project_id) {
        return c.json({ error: "Task project and parent task project must match" }, 400, corsHeaders);
      }
      patch.parent_task_id = parentTask.id;
      changes.parent_task_id = { from: task.parent_task_id, to: parentTask.id };
      if (parentTask.project_id) nextProjectId = parentTask.project_id;
    }
  }
  if (nextProjectId !== task.project_id) {
    patch.project_id = nextProjectId;
    changes.project_id = { from: task.project_id || null, to: nextProjectId };
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
  await logTaskAudit(task.id, num, user.email, user.name, "human", action, {
    state_before: Object.fromEntries(Object.entries(changes).map(([k, v]: any) => [k, v.from])),
    state_after: Object.fromEntries(Object.entries(changes).map(([k, v]: any) => [k, v.to])),
    project_id: patch.project_id ?? task.project_id ?? null,
  });

  if (body.status === "completed") {
    const { data: taskLinks } = await sb.from("task_links").select("*").eq("task_id", task.id);
    for (const link of (taskLinks || [])) {
      try {
        if (link.link_type === "feedback") {
          await sb.from("feedback").update({ status: "done" }).eq("id", link.link_ref);
        }
        if (link.link_type === "milestone") {
          await sb.from("milestones").insert({
            title: task.title,
            date: new Date().toISOString().split("T")[0],
            category: "product",
            created_by: user.name,
            project_id: patch.project_id ?? task.project_id ?? null,
          });
        }
      } catch (e: any) {
        await logTaskAudit(task.id, num, "system", null, "system", "link_effect_failed", {
          state_after: { link_type: link.link_type, error: e.message },
          project_id: patch.project_id ?? task.project_id ?? null,
        });
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
          parent_task_id: task.parent_task_id || task.id, event_id: task.event_id,
          visibility: task.visibility,
          project_id: patch.project_id ?? task.project_id ?? null,
        }).select("task_number, id").single();
        if (nextTask) {
          await logTaskAudit(nextTask.id, nextTask.task_number, "system", null, "system", "recurring_created", {
            state_after: { from_task: task.task_number },
            channel: "system",
            project_id: patch.project_id ?? task.project_id ?? null,
          });
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
  const { data: task } = await sb.from("tasks").select("*").eq("task_number", num).single();
  if (!task) return c.json({ error: "Task not found" }, 404, corsHeaders);
  await hydrateRecordsWithProjects(sb, [task]);
  if (!canAccessTask(task, user, task.project)) return c.json({ error: "Task not found" }, 404, corsHeaders);
  if (!canModifyTask(task, user)) return c.json({ error: "Only the creator or assignee can modify this task" }, 403, corsHeaders);

  const body = await c.req.json();
  if (!body.link_type || !body.link_ref) return c.json({ error: "link_type and link_ref required" }, 400, corsHeaders);

  await sb.from("task_links").insert({ task_id: task.id, link_type: body.link_type, link_ref: body.link_ref });
  await logTaskAudit(task.id, num, user.email, user.name, "human", "linked", {
    state_after: { link_type: body.link_type, link_ref: body.link_ref },
    project_id: task.project_id || null,
  });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── PATCH /tasks/:number/triage — accept or dismiss ─────────────────
app.patch("/tasks/:number/triage", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const num = parseInt(c.req.param("number"));
  const body = await c.req.json();
  const sb = getSupabase();
  const { data: task } = await sb.from("tasks").select("*").eq("task_number", num).single();
  if (!task) return c.json({ error: "Task not found" }, 404, corsHeaders);
  await hydrateRecordsWithProjects(sb, [task]);
  if (!canAccessTask(task, user, task.project)) return c.json({ error: "Task not found" }, 404, corsHeaders);
  if (!canModifyTask(task, user)) return c.json({ error: "Only the creator or assignee can modify this task" }, 403, corsHeaders);

  if (body.action === "accept") {
    await sb.from("tasks").update({ requires_triage: false, updated_at: new Date().toISOString() }).eq("id", task.id);
    await logTaskAudit(task.id, num, user.email, user.name, "human", "triage_accepted", { project_id: task.project_id || null });
  } else if (body.action === "dismiss") {
    await sb.from("tasks").update({ status: "cancelled", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", task.id);
    await logTaskAudit(task.id, num, user.email, user.name, "human", "triage_dismissed", {
      state_after: { reason: body.reason || "" },
      project_id: task.project_id || null,
    });
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

  const { data: task, error: fetchErr } = await sb.from("tasks").select("*").eq("task_number", num).single();
  if (fetchErr || !task) return c.json({ error: "Task not found" }, 404, corsHeaders);
  await hydrateRecordsWithProjects(sb, [task]);
  if (!canAccessTask(task, user, task.project)) return c.json({ error: "Task not found" }, 404, corsHeaders);

  if (user.email !== task.created_by) {
    return c.json({ error: "Only the creator can cancel this task" }, 403, corsHeaders);
  }

  await sb.from("tasks").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", task.id);
  await logTaskAudit(task.id, num, user.email, user.name, "human", "cancelled", {
    state_before: { status: task.status },
    state_after: { status: "cancelled" },
    project_id: task.project_id || null,
  });

  return c.json({ ok: true }, 200, corsHeaders);
});


// ── GET /audit — query audit events ─────────────────────────────────
app.get("/audit", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const entityType = c.req.query("entity_type");
  const entityId = c.req.query("entity_id");
  const projectRef = c.req.query("project");
  const actor = c.req.query("actor");
  const actorAgentId = c.req.query("actor_agent_id");
  const channel = c.req.query("channel");
  const action = c.req.query("action");
  const since = c.req.query("since");
  const limit = parseInt(c.req.query("limit") || "30");

  const sb = getSupabase();
  const maxLimit = Math.min(limit, 100);
  const fetchLimit = Math.min(Math.max(maxLimit * 10, 100), 500);
  const ownedAgentSlugs = await listOwnedAgentSlugs(sb, user.email);

  if (actor && actor !== user.email && !projectRef) {
    return c.json({ error: "Forbidden" }, 403, corsHeaders);
  }
  if (actorAgentId && !ownedAgentSlugs.has(actorAgentId) && !projectRef) {
    return c.json({ error: "Forbidden" }, 403, corsHeaders);
  }

  let query = sb.from("audit_events").select("*").order("timestamp", { ascending: false }).limit(fetchLimit);

  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (projectRef) {
    const project = await resolveProjectRef(sb, projectRef);
    if (!project) return c.json({ error: `Project "${projectRef}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    query = query.eq("project_id", project.id);
  }
  if (actor) query = query.eq("actor_email", actor);
  if (actorAgentId) query = query.eq("actor_agent_id", actorAgentId);
  if (channel) query = query.eq("channel", channel);
  if (action) query = query.eq("action", action);
  if (since) query = query.gte("timestamp", since);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  const events = data || [];
  await hydrateRecordsWithProjects(sb, events as any[]);
  const visibleEvents = events
    .filter((event: any) => canReadAuditEvent(event, user, ownedAgentSlugs, event.project))
    .slice(0, maxLimit);
  return c.json({ events: visibleEvents }, 200, corsHeaders);
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
  let projectId = null;
  if (body.project) {
    const project = await resolveProjectRef(sb, body.project);
    if (!project) return c.json({ error: `Project "${body.project}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    projectId = project.id;
  }
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
    project_id: projectId,
  });

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "agent",
    entity_id: body.slug,
    action: "registered",
    channel: "api",
    project_id: projectId,
    state_after: { name: body.name, scopes: body.scopes, email: body.email, role: body.role, skill_slug: body.skill_slug, project_id: projectId },
  });

  return c.json({ ok: true, slug: body.slug }, 200, corsHeaders);
});

// ── GET /agents — list all agents ───────────────────────────────────
app.get("/agents", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const status = c.req.query("status");
  const projectRef = c.req.query("project");
  const sb = getSupabase();
  let query = sb.from("agents").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (projectRef) {
    const project = await resolveProjectRef(sb, projectRef);
    if (!project) return c.json({ error: `Project "${projectRef}" not found` }, 404, corsHeaders);
    if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
    query = query.eq("project_id", project.id);
  }
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  const agents = data || [];
  await hydrateRecordsWithProjects(sb, agents as any[]);
  return c.json({
    agents: agents.filter((agent: any) => canAccessAgent(agent, user, agent.project)),
  }, 200, corsHeaders);
});

// ── GET /agents/:slug — single agent + activity ─────────────────────
app.get("/agents/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const slug = c.req.param("slug");
  const sb = getSupabase();

  const { data: agent, error } = await sb.from("agents").select("*").eq("slug", slug).single();
  if (error || !agent) return c.json({ error: "Agent not found" }, 404, corsHeaders);
  await hydrateRecordsWithProjects(sb, [agent]);
  if (!canAccessAgent(agent, user, agent.project)) return c.json({ error: "Agent not found" }, 404, corsHeaders);

  let activity: any[] = [];
  if (agent.owner === user.email || agent.email === user.email || canAccessAgent(agent, user, agent.project)) {
    const { data } = await sb.from("audit_events").select("*").eq("actor_agent_id", slug).order("timestamp", { ascending: false }).limit(10);
    activity = data || [];
  }

  return c.json({ agent, activity }, 200, corsHeaders);
});

// ── PATCH /agents/:slug — update agent ──────────────────────────────
app.patch("/agents/:slug", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const slug = c.req.param("slug");
  const body = await c.req.json();
  const sb = getSupabase();
  const { data: agent, error: fetchErr } = await sb.from("agents").select("*").eq("slug", slug).single();
  if (fetchErr || !agent) return c.json({ error: "Agent not found" }, 404, corsHeaders);
  await hydrateRecordsWithProjects(sb, [agent]);
  if (!canAccessAgent(agent, user, agent.project)) return c.json({ error: "Agent not found" }, 404, corsHeaders);
  if (agent.owner !== user.email) return c.json({ error: "Only the owner can update this agent" }, 403, corsHeaders);

  const patch: any = {};
  for (const field of ["status", "scopes", "config", "machine", "skill_slug", "email", "role"]) {
    if (body[field] !== undefined) patch[field] = body[field];
  }
  if (body.project !== undefined) {
    if (!body.project) {
      patch.project_id = null;
    } else {
      const project = await resolveProjectRef(sb, body.project);
      if (!project) return c.json({ error: `Project "${body.project}" not found` }, 404, corsHeaders);
      if (!canAccessProject(project, user)) return c.json({ error: "Forbidden" }, 403, corsHeaders);
      patch.project_id = project.id;
    }
  }

  if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update" }, 400, corsHeaders);

  const { error } = await sb.from("agents").update(patch).eq("slug", slug);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  const action = body.status ? "status_changed" : "updated";
  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "agent",
    entity_id: slug,
    action,
    channel: "api",
    project_id: patch.project_id ?? agent.project_id ?? null,
    state_before: { status: agent.status, scopes: agent.scopes },
    state_after: patch,
  });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── POST /agents/:slug/heartbeat — agent liveness ───────────────────
app.post("/agents/:slug/heartbeat", async (c) => {
  const slug = c.req.param("slug");
  const sb = getSupabase();

  const { data: agent, error: fetchErr } = await sb.from("agents").select("status, scopes, last_seen, project_id").eq("slug", slug).single();
  if (fetchErr || !agent) return c.json({ error: "Agent not found" }, 404, corsHeaders);

  const now = new Date().toISOString();
  await sb.from("agents").update({ last_seen: now }).eq("slug", slug);

  const lastSeen = agent.last_seen ? new Date(agent.last_seen) : null;
  const gap = lastSeen ? (Date.now() - lastSeen.getTime()) / 1000 : Infinity;
  if (gap > 300) {
    await logAudit({
      actor_agent_id: slug,
      actor_type: "agent",
      entity_type: "agent",
      entity_id: slug,
      action: "heartbeat",
      channel: "system",
      project_id: agent.project_id || null,
    });
  }

  return c.json({ status: agent.status, scopes: agent.scopes }, 200, corsHeaders);
});

// ── ETF: list funds ─────────────────────────────────────────────────
app.get("/etf", async (c) => {
  const sb = getSupabase();
  const { data: funds, error } = await sb.from("etf_funds").select("*").eq("status", "active").order("ticker");
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  const enriched = [];
  for (const f of (funds || [])) {
    const { data: perf } = await sb.from("etf_performance").select("nav, daily_return, cumulative_return, date").eq("fund_id", f.id).order("date", { ascending: false }).limit(1);
    const { count } = await sb.from("etf_holdings").select("*", { count: "exact", head: true }).eq("fund_id", f.id);
    const latest = perf?.[0];
    enriched.push({
      ...f,
      latest_nav: latest?.nav ?? f.base_nav,
      daily_return: latest?.daily_return ?? 0,
      cumulative_return: latest?.cumulative_return ?? 0,
      holdings_count: count || 0,
      last_updated: latest?.date ?? f.inception_date,
    });
  }
  return c.json({ funds: enriched }, 200, corsHeaders);
});

// ── ETF: get fund detail ────────────────────────────────────────────
app.get("/etf/:ticker", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  const sb = getSupabase();

  const { data: fund, error } = await sb.from("etf_funds").select("*").eq("ticker", ticker).single();
  if (error || !fund) return c.json({ error: "Fund not found" }, 404, corsHeaders);

  const { data: holdings } = await sb.from("etf_holdings").select("*").eq("fund_id", fund.id).order("weight", { ascending: false });
  const { data: perf } = await sb.from("etf_performance").select("nav, daily_return, cumulative_return, date").eq("fund_id", fund.id).order("date", { ascending: false }).limit(1);

  const symbols = (holdings || []).map((h: any) => h.symbol);
  const priceMap: Record<string, any> = {};
  const sparkMap: Record<string, number[]> = {};
  for (const sym of symbols) {
    const { data: latest } = await sb.from("etf_prices").select("close_price, change_pct, date").eq("symbol", sym).order("date", { ascending: false }).limit(1);
    if (latest?.[0]) priceMap[sym] = latest[0];
    const { data: hist } = await sb.from("etf_prices").select("close_price").eq("symbol", sym).order("date", { ascending: true }).limit(20);
    if (hist?.length) sparkMap[sym] = hist.map((p: any) => p.close_price);
  }

  const enrichedHoldings = (holdings || []).map((h: any) => {
    const latest = priceMap[h.symbol];
    const entryPrice = h.entry_price;
    const sinceEntry = latest && entryPrice ? ((latest.close_price - entryPrice) / entryPrice) * 100 : null;
    return {
      ...h,
      latest_price: latest?.close_price ?? null,
      daily_change_pct: latest?.change_pct ?? null,
      entry_price: entryPrice ?? null,
      since_entry_pct: sinceEntry != null ? Math.round(sinceEntry * 100) / 100 : null,
      price_history: sparkMap[h.symbol] || [],
    };
  });

  const latest = perf?.[0];

  let benchmark = null;
  if (latest?.date) {
    const { data: spyToday } = await sb.from("etf_prices").select("close_price, change_pct").eq("symbol", "SPY").eq("date", latest.date).single();
    const { data: spyInception } = await sb.from("etf_prices").select("close_price").eq("symbol", "SPY").eq("date", fund.inception_date).single();
    if (spyToday && spyInception) {
      benchmark = {
        symbol: "SPY",
        daily_return: spyToday.change_pct / 100,
        cumulative_return: (spyToday.close_price - spyInception.close_price) / spyInception.close_price,
      };
    }
  }

  return c.json({
    fund,
    holdings: enrichedHoldings,
    performance: {
      nav: latest?.nav ?? fund.base_nav,
      daily_return: latest?.daily_return ?? 0,
      cumulative_return: latest?.cumulative_return ?? 0,
      date: latest?.date ?? fund.inception_date,
    },
    benchmark,
  }, 200, corsHeaders);
});

// ── ETF: performance history ────────────────────────────────────────
app.get("/etf/:ticker/performance", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  const range = c.req.query("range") || "1m";
  const sb = getSupabase();

  const { data: fund } = await sb.from("etf_funds").select("id").eq("ticker", ticker).single();
  if (!fund) return c.json({ error: "Fund not found" }, 404, corsHeaders);

  const days: Record<string, number> = { "1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365, all: 9999 };
  const since = new Date(Date.now() - (days[range] || 30) * 86400000).toISOString().split("T")[0];

  const { data } = await sb.from("etf_performance").select("date, nav, daily_return, cumulative_return").eq("fund_id", fund.id).gte("date", since).order("date", { ascending: true });

  const { data: fundFull } = await sb.from("etf_funds").select("inception_date").eq("id", fund.id).single();
  let spyBenchmark: any[] = [];
  if (fundFull) {
    const { data: spyInception } = await sb.from("etf_prices").select("close_price").eq("symbol", "SPY").eq("date", fundFull.inception_date).single();
    if (spyInception) {
      const { data: spyPrices } = await sb.from("etf_prices").select("date, close_price").eq("symbol", "SPY").gte("date", since).order("date", { ascending: true });
      spyBenchmark = (spyPrices || []).map((p: any) => ({
        date: p.date,
        cumulative_return: (p.close_price - spyInception.close_price) / spyInception.close_price,
      }));
    }
  }

  return c.json({ ticker, range, data: data || [], benchmark: spyBenchmark }, 200, corsHeaders);
});

// ── ETF: linked news ────────────────────────────────────────────────
app.get("/etf/:ticker/news", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  const sb = getSupabase();

  const { data: fund } = await sb.from("etf_funds").select("id").eq("ticker", ticker).single();
  if (!fund) return c.json({ error: "Fund not found" }, 404, corsHeaders);

  const { data: holdings } = await sb.from("etf_holdings").select("name, domain").eq("fund_id", fund.id);
  const names = (holdings || []).map((h: any) => h.name);
  const domains = (holdings || []).filter((h: any) => h.domain).map((h: any) => h.domain);

  const query = `*[_type == "newsPost" && published == true && count(entities[name in $names || domain in $domains]) > 0] | order(publishedAt desc)[0...20] { _id, title, "slug": slug.current, excerpt, category, publishedAt, entities[] { name, domain } }`;
  const res = await fetch(`${SANITY_API}/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}&$names=${encodeURIComponent(JSON.stringify(names))}&$domains=${encodeURIComponent(JSON.stringify(domains))}`);
  const json = await res.json();

  return c.json({ ticker, news: json.result || [] }, 200, corsHeaders);
});

// ── ETF: create fund ────────────────────────────────────────────────
app.post("/etf", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.ticker || !body.name) return c.json({ error: "ticker and name required" }, 400, corsHeaders);
  if (!body.holdings?.length) return c.json({ error: "holdings required" }, 400, corsHeaders);

  const weightSum = body.holdings.reduce((s: number, h: any) => s + (h.weight || 0), 0);
  if (Math.abs(weightSum - 1.0) > 0.001) return c.json({ error: `Holdings weights must sum to 1.0 (got ${weightSum.toFixed(4)})` }, 400, corsHeaders);

  const sb = getSupabase();
  const { data: fund, error } = await sb.from("etf_funds").insert({
    ticker: body.ticker.toUpperCase(),
    name: body.name,
    description: body.description || null,
    strategy: body.strategy || null,
    inception_date: body.inception_date || new Date().toISOString().split("T")[0],
    created_by: user.email,
  }).select("id, ticker").single();
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  const holdingsRows = body.holdings.map((h: any) => ({
    fund_id: fund.id,
    symbol: h.symbol.toUpperCase(),
    name: h.name,
    domain: h.domain || null,
    sector: h.sector || null,
    weight: h.weight,
  }));
  await sb.from("etf_holdings").insert(holdingsRows);

  await logAudit({ actor_email: user.email, actor_type: "human", entity_type: "etf", entity_id: fund.ticker, action: "created", channel: "api", state_after: { ticker: fund.ticker, holdings: body.holdings.length } });

  return c.json({ ok: true, ticker: fund.ticker }, 200, corsHeaders);
});

// ── ETF: update fund metadata ───────────────────────────────────────
app.patch("/etf/:ticker", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const ticker = c.req.param("ticker").toUpperCase();
  const sb = getSupabase();
  const body = await c.req.json();

  const patch: any = { updated_at: new Date().toISOString() };
  for (const f of ["name", "description", "strategy", "status"]) {
    if (body[f] !== undefined) patch[f] = body[f];
  }

  const { error } = await sb.from("etf_funds").update(patch).eq("ticker", ticker);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({ actor_email: user.email, actor_type: "human", entity_type: "etf", entity_id: ticker, action: "updated", channel: "api", state_after: patch });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── ETF: fetch Yahoo Finance prices for a symbol ────────────────────
async function fetchYahooPrices(symbol: string, range = "1mo"): Promise<{ date: string; close: number; changePct: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AstarETF/1.0)" } });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error("No chart data");

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points: { date: string; close: number; changePct: number }[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
    const prevClose = i > 0 && closes[i - 1] != null ? closes[i - 1] : closes[i];
    const changePct = prevClose ? ((closes[i] - prevClose) / prevClose) * 100 : 0;
    points.push({ date, close: Math.round(closes[i] * 10000) / 10000, changePct: Math.round(changePct * 10000) / 10000 });
  }
  return points;
}

async function fetchLatestPrice(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AstarETF/1.0)" } });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const closes = result.indicators?.quote?.[0]?.close || [];
  for (let i = closes.length - 1; i >= 0; i--) {
    if (closes[i] != null) return Math.round(closes[i] * 10000) / 10000;
  }
  return null;
}

// ── ETF: refresh prices + recalculate NAV (MUST be before /:ticker routes) ──
app.post("/etf/refresh-prices", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const sb = getSupabase();
  const targetTicker = c.req.query("ticker");

  let fundsQuery = sb.from("etf_funds").select("id, ticker, base_nav, inception_date").eq("status", "active");
  if (targetTicker) fundsQuery = fundsQuery.eq("ticker", targetTicker.toUpperCase());
  const { data: funds } = await fundsQuery;
  if (!funds?.length) return c.json({ error: "No active funds" }, 404, corsHeaders);

  const allSymbols = new Set<string>();
  const fundHoldings: Record<string, any[]> = {};
  for (const f of funds) {
    const { data: h } = await sb.from("etf_holdings").select("id, symbol, weight, entry_price").eq("fund_id", f.id);
    fundHoldings[f.id] = h || [];
    for (const hh of (h || [])) allSymbols.add(hh.symbol);
  }
  allSymbols.add("SPY");

  let pricesFetched = 0;
  const errors: string[] = [];
  const todayStr = new Date().toISOString().split("T")[0];

  for (const symbol of allSymbols) {
    try {
      const points = await fetchYahooPrices(symbol, "1mo");
      for (const p of points) {
        await sb.from("etf_prices").upsert({
          symbol, date: p.date, close_price: p.close, change_pct: p.changePct,
        }, { onConflict: "symbol,date" });
      }
      pricesFetched++;
    } catch (e: any) {
      errors.push(`${symbol}: ${e.message}`);
    }
  }

  for (const symbol of allSymbols) {
    try {
      const livePrice = await fetchLatestPrice(symbol);
      if (livePrice == null) continue;
      const { data: prevDay } = await sb.from("etf_prices").select("close_price").eq("symbol", symbol).lt("date", todayStr).order("date", { ascending: false }).limit(1);
      const prevClose = prevDay?.[0]?.close_price ?? livePrice;
      const changePct = Math.round(((livePrice - prevClose) / prevClose) * 10000) / 100;
      await sb.from("etf_prices").upsert({
        symbol, date: todayStr, close_price: livePrice, change_pct: changePct,
      }, { onConflict: "symbol,date" });
    } catch {}
  }

  let navsCalculated = 0;

  for (const f of funds) {
    const holdings = fundHoldings[f.id];
    if (!holdings?.length) continue;

    const symbols = holdings.map((h: any) => h.symbol);

    const needsEntryPrice = holdings.some((h: any) => !h.entry_price);
    if (needsEntryPrice) {
      for (const h of holdings) {
        if (h.entry_price) continue;
        const { data: price } = await sb.from("etf_prices").select("close_price").eq("symbol", h.symbol).order("date", { ascending: false }).limit(1);
        if (price?.[0]) {
          h.entry_price = price[0].close_price;
          await sb.from("etf_holdings").update({ entry_price: h.entry_price }).eq("id", h.id);
        }
      }
    }

    const latestPrices: Record<string, number> = {};
    for (const sym of symbols) {
      const { data: p } = await sb.from("etf_prices").select("close_price").eq("symbol", sym).order("date", { ascending: false }).limit(1);
      if (p?.[0]) latestPrices[sym] = p[0].close_price;
    }

    let nav = f.base_nav;
    let weightedReturn = 0;
    for (const h of holdings) {
      if (!h.entry_price || !latestPrices[h.symbol]) continue;
      const stockReturn = (latestPrices[h.symbol] - h.entry_price) / h.entry_price;
      weightedReturn += h.weight * stockReturn;
    }
    nav = Math.round(f.base_nav * (1 + weightedReturn) * 10000) / 10000;

    const { data: yesterdayPerf } = await sb.from("etf_performance").select("nav").eq("fund_id", f.id).lt("date", todayStr).order("date", { ascending: false }).limit(1);
    const startOfDayNav = yesterdayPerf?.[0]?.nav ?? f.base_nav;
    const dailyReturn = startOfDayNav > 0 ? (nav - startOfDayNav) / startOfDayNav : 0;
    const cumulativeReturn = (nav / f.base_nav) - 1;

    const snapshot = holdings.map((h: any) => {
      const ret = h.entry_price && latestPrices[h.symbol] ? (latestPrices[h.symbol] - h.entry_price) / h.entry_price : 0;
      return { symbol: h.symbol, weight: h.weight, return: Math.round(ret * 10000) / 10000 };
    });

    await sb.from("etf_performance").upsert({
      fund_id: f.id, date: todayStr, nav,
      daily_return: Math.round(dailyReturn * 1000000) / 1000000,
      cumulative_return: Math.round(cumulativeReturn * 1000000) / 1000000,
      holdings_snapshot: snapshot,
    }, { onConflict: "fund_id,date" });
    navsCalculated++;
  }

  await logAudit({ actor_email: user.email, actor_type: "human", entity_type: "etf", action: "prices_refreshed", channel: "api", state_after: { prices_fetched: pricesFetched, navs_calculated: navsCalculated, errors: errors.length } });

  return c.json({ ok: true, prices_fetched: pricesFetched, navs_calculated: navsCalculated, errors: errors.length ? errors : undefined }, 200, corsHeaders);
});

// ── ETF: rebalance holdings ─────────────────────────────────────────
app.post("/etf/:ticker/rebalance", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const ticker = c.req.param("ticker").toUpperCase();
  const sb = getSupabase();
  const body = await c.req.json();

  if (!body.holdings?.length) return c.json({ error: "holdings required" }, 400, corsHeaders);
  const weightSum = body.holdings.reduce((s: number, h: any) => s + (h.weight || 0), 0);
  if (Math.abs(weightSum - 1.0) > 0.001) return c.json({ error: `Weights must sum to 1.0 (got ${weightSum.toFixed(4)})` }, 400, corsHeaders);

  const { data: fund } = await sb.from("etf_funds").select("id").eq("ticker", ticker).single();
  if (!fund) return c.json({ error: "Fund not found" }, 404, corsHeaders);

  await sb.from("etf_holdings").delete().eq("fund_id", fund.id);
  const rows = body.holdings.map((h: any) => ({
    fund_id: fund.id,
    symbol: h.symbol.toUpperCase(),
    name: h.name || h.symbol,
    domain: h.domain || null,
    sector: h.sector || null,
    weight: h.weight,
  }));
  await sb.from("etf_holdings").insert(rows);

  await logAudit({ actor_email: user.email, actor_type: "human", entity_type: "etf", entity_id: ticker, action: "rebalanced", channel: "api", state_after: { holdings: body.holdings.length, weights: body.holdings.map((h: any) => `${h.symbol}:${h.weight}`) } });

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── POST /overtime/runs — create a new run record ─────────────────────
app.post("/overtime/runs", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.slug) return c.json({ error: "slug is required" }, 400, corsHeaders);
  if (!body.spec_title) return c.json({ error: "spec_title is required" }, 400, corsHeaders);

  const sb = getSupabase();
  const { data, error } = await sb.from("overtime_runs").insert({
    slug: body.slug,
    spec_title: body.spec_title,
    type: body.type || "dev",
    parent_task_number: body.parent_task_number ?? null,
    status: "running",
    model: body.model ?? null,
    worktree_path: body.worktree_path ?? null,
    branch_name: body.branch_name ?? null,
  }).select("id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  await logAudit({
    actor_email: user.email,
    actor_name: user.name,
    actor_type: "human",
    entity_type: "overtime_run",
    entity_id: data?.id,
    action: "started",
    channel: "api",
    state_after: { slug: body.slug, spec_title: body.spec_title, type: body.type || "dev" },
  });

  return c.json({ ok: true, id: data!.id }, 200, corsHeaders);
});

// ── PATCH /overtime/runs/:id — update a run record ────────────────────
app.patch("/overtime/runs/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const body = await c.req.json();

  const sb = getSupabase();
  const updates: Record<string, any> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.completed_at !== undefined) updates.completed_at = body.completed_at;
  if (body.total_cycles_u !== undefined) updates.total_cycles_u = body.total_cycles_u;
  if (body.total_cycles_e !== undefined) updates.total_cycles_e = body.total_cycles_e;
  if (body.total_rejections !== undefined) updates.total_rejections = body.total_rejections;
  if (body.total_cost_usd !== undefined) updates.total_cost_usd = body.total_cost_usd;
  if (body.model !== undefined) updates.model = body.model;
  if (body.git_commits !== undefined) updates.git_commits = body.git_commits;

  if (!Object.keys(updates).length) return c.json({ error: "No fields to update" }, 400, corsHeaders);

  const { error } = await sb.from("overtime_runs").update(updates).eq("id", id);
  if (error) return c.json({ error: error.message }, 500, corsHeaders);

  return c.json({ ok: true }, 200, corsHeaders);
});

// ── GET /overtime/runs/:id — get a single run record ──────────────────
app.get("/overtime/runs/:id", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const sb = getSupabase();
  const { data, error } = await sb.from("overtime_runs").select("*").eq("id", id).single();
  if (error) return c.json({ error: error.message }, 404, corsHeaders);
  return c.json({ run: data }, 200, corsHeaders);
});

// ── GET /overtime/runs — list run records ─────────────────────────────
app.get("/overtime/runs", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const sb = getSupabase();
  const { data, error } = await sb.from("overtime_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ runs: data || [] }, 200, corsHeaders);
});

// ── POST /overtime/cycles — record one agent cycle ────────────────────
app.post("/overtime/cycles", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const body = await c.req.json();
  if (!body.run_id) return c.json({ error: "run_id is required" }, 400, corsHeaders);
  if (!body.agent) return c.json({ error: "agent is required" }, 400, corsHeaders);
  if (body.cycle_number === undefined) return c.json({ error: "cycle_number is required" }, 400, corsHeaders);

  const sb = getSupabase();
  const { data, error } = await sb.from("overtime_cycles").insert({
    run_id: body.run_id,
    agent: body.agent,
    cycle_number: body.cycle_number,
    started_at: body.started_at ?? new Date().toISOString(),
    completed_at: body.completed_at ?? null,
    exit_code: body.exit_code ?? null,
    subtask_number: body.subtask_number ?? null,
    action_taken: body.action_taken ?? null,
    tokens_in: body.tokens_in ?? null,
    tokens_out: body.tokens_out ?? null,
    cost_usd: body.cost_usd ?? null,
    model: body.model ?? null,
    tool_calls_count: body.tool_calls_count ?? null,
    turns_used: body.turns_used ?? null,
    max_turns: body.max_turns ?? null,
  }).select("id").single();

  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ ok: true, id: data!.id }, 200, corsHeaders);
});

// ── GET /overtime/runs/:id/cycles — list cycles for a run ─────────────
app.get("/overtime/runs/:id/cycles", async (c) => {
  const user = await validateMsToken(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401, corsHeaders);

  const id = c.req.param("id");
  const sb = getSupabase();
  const { data, error } = await sb.from("overtime_cycles")
    .select("*")
    .eq("run_id", id)
    .order("started_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500, corsHeaders);
  return c.json({ cycles: data || [] }, 200, corsHeaders);
});

// ── Health ─────────────────────────────────────────────────────────────
app.get("/", (c) => c.json({ status: "ok", service: "skills-api" }, 200, corsHeaders));

Deno.serve(app.fetch);
