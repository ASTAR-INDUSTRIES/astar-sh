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
  const skills = await sanityQuery(`
    *[_type == "knowledgeSkill" && published == true] | order(title asc) {
      _id,
      title,
      "slug": slug.current,
      description,
      tags,
      project,
      "skillMd": skill_md,
      "referenceFiles": reference_files[] {
        filename,
        content
      }
    }
  `);

  await logEvent("skill.list", { metadata: { count: skills?.length ?? 0 } });
  return c.json({ skills }, 200, corsHeaders);
});

// ── GET /skills/:slug — single skill by slug ─────────────────────────
app.get("/skills/:slug", async (c) => {
  const slug = c.req.param("slug");

  const skill = await sanityQuery(
    `*[_type == "knowledgeSkill" && slug.current == $slug && published == true][0] {
      _id,
      title,
      "slug": slug.current,
      description,
      tags,
      project,
      "skillMd": skill_md,
      "referenceFiles": reference_files[] {
        filename,
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

// ── Health ─────────────────────────────────────────────────────────────
app.get("/", (c) => c.json({ status: "ok", service: "skills-api" }, 200, corsHeaders));

Deno.serve(app.fetch);
