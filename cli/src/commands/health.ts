import { homedir } from "os";
import { join, resolve } from "path";
import type { Command } from "commander";
import { c } from "../lib/ui";
import { VERSION } from "../index";
import { getAuthCache } from "../lib/config";
import { isBaseSkillInstalled, installBaseSkill, getGlobalSkillsDir, ASTAR_PLATFORM_SKILL } from "../lib/base-skill";
import { readManifest, hashContent } from "../lib/manifest";
import { getLocalHash, getRemoteHash } from "./update";
import { getConfig } from "../lib/config";

interface CheckResult {
  status: "ok" | "warning" | "critical";
  message: string;
}

interface SkillCheck {
  name: string;
  status: "ok" | "outdated" | "corrupted" | "missing";
  integrity: string;
}

interface HealthResult {
  overall: "healthy" | "warning" | "critical";
  checks: {
    cli: { status: string; current: string; latest: string | null; behind: boolean };
    auth: { status: string; email: string | null; valid: boolean; expired: boolean };
    base_skill: { status: string; installed: boolean; integrity: string; };
    global_skills: SkillCheck[];
    project_skills: SkillCheck[];
    api: { status: string; reachable: boolean; latency_ms: number | null };
    cfa: { status: string; online: boolean; pending: number };
  };
}

async function checkSkillIntegrity(skillDir: string, name: string): Promise<SkillCheck> {
  const skillFile = Bun.file(join(skillDir, "SKILL.md"));
  if (!(await skillFile.exists())) return { name, status: "missing", integrity: "missing" };

  const manifest = await readManifest(skillDir);
  const content = await skillFile.text();

  if (!manifest) return { name, status: "ok", integrity: "no manifest" };
  if (!manifest.content_hash) return { name, status: "ok", integrity: "unverified" };

  const currentHash = hashContent(content);
  if (currentHash !== manifest.content_hash) return { name, status: "corrupted", integrity: `hash mismatch (expected ${manifest.content_hash}, got ${currentHash})` };

  return { name, status: "ok", integrity: "ok" };
}

async function checkApi(): Promise<{ reachable: boolean; latency_ms: number | null }> {
  const config = await getConfig();
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${config.apiUrl}/`, { signal: controller.signal });
    clearTimeout(timeout);
    return { reachable: res.ok, latency_ms: Date.now() - start };
  } catch {
    clearTimeout(timeout);
    return { reachable: false, latency_ms: null };
  }
}

async function checkCfa(): Promise<{ online: boolean; pending: number }> {
  const config = await getConfig();
  try {
    const res = await fetch(`${config.apiUrl}/inquiries/health`);
    if (!res.ok) return { online: false, pending: 0 };
    const data = await res.json();
    const hasActivity = data.last_completed_at !== null;
    const stale = data.oldest_pending_age_seconds > 300;
    return { online: hasActivity || !stale, pending: data.pending_count };
  } catch {
    return { online: false, pending: 0 };
  }
}

async function runHealthChecks(extended: boolean): Promise<HealthResult> {
  const local = getLocalHash();
  const remote = extended ? getRemoteHash() : null;
  const behind = remote !== null && local !== null && remote !== local;

  const cache = await getAuthCache();
  const authValid = cache !== null && cache.expiresAt > Date.now();
  const authExpired = cache !== null && cache.expiresAt <= Date.now();

  const baseInstalled = await isBaseSkillInstalled();
  let baseIntegrity = "missing";
  if (baseInstalled) {
    const check = await checkSkillIntegrity(join(getGlobalSkillsDir(), "astar-platform"), "astar-platform");
    baseIntegrity = check.integrity;
  }

  let globalSkills: SkillCheck[] = [];
  let projectSkills: SkillCheck[] = [];
  let api = { reachable: false, latency_ms: null as number | null };
  let cfa = { online: false, pending: 0 };

  if (extended) {
    const [apiResult, cfaResult] = await Promise.all([
      checkApi().catch(() => ({ reachable: false, latency_ms: null })),
      checkCfa().catch(() => ({ online: false, pending: 0 })),
    ]);
    api = apiResult;
    cfa = cfaResult;

    const globalDir = getGlobalSkillsDir();
    try {
      const glob = new Bun.Glob("*/SKILL.md");
      for await (const path of glob.scan({ cwd: globalDir })) {
        const slug = path.replace("/SKILL.md", "");
        if (slug === "astar-platform") continue;
        globalSkills.push(await checkSkillIntegrity(join(globalDir, slug), slug));
      }
    } catch {}

    const projectDir = resolve(process.cwd(), ".claude", "skills");
    try {
      const glob = new Bun.Glob("*/SKILL.md");
      for await (const path of glob.scan({ cwd: projectDir })) {
        const slug = path.replace("/SKILL.md", "");
        projectSkills.push(await checkSkillIntegrity(join(projectDir, slug), slug));
      }
    } catch {}
  }

  let overall: "healthy" | "warning" | "critical" = "healthy";
  if (!baseInstalled || (!authValid && !authExpired)) overall = "critical";
  else if (authExpired || behind || baseIntegrity === "corrupted") overall = "critical";
  else if (globalSkills.some((s) => s.status === "corrupted") || (extended && !api.reachable)) overall = "warning";
  else if (extended && !cfa.online && cfa.pending > 0) overall = "warning";

  return {
    overall,
    checks: {
      cli: { status: behind ? "outdated" : "ok", current: local || VERSION, latest: remote, behind },
      auth: { status: authValid ? "ok" : authExpired ? "expired" : "missing", email: cache?.account?.username || null, valid: authValid, expired: authExpired },
      base_skill: { status: baseInstalled ? (baseIntegrity === "ok" || baseIntegrity === "unverified" ? "ok" : "corrupted") : "missing", installed: baseInstalled, integrity: baseIntegrity },
      global_skills: globalSkills,
      project_skills: projectSkills,
      api: { status: api.reachable ? "ok" : "unreachable", reachable: api.reachable, latency_ms: api.latency_ms },
      cfa: { status: cfa.online ? "ok" : cfa.pending > 0 ? "offline" : "idle", online: cfa.online, pending: cfa.pending },
    },
  };
}

function icon(status: string): string {
  if (status === "ok") return `${c.green}✓${c.reset}`;
  if (status === "warning" || status === "outdated" || status === "offline") return `${c.yellow}⚠${c.reset}`;
  return `${c.red}✗${c.reset}`;
}

function renderHealth(result: HealthResult, extended: boolean) {
  const ch = result.checks;

  console.log("");
  console.log(`  ${c.bold}${c.white}╱╲${c.reset}  ${c.bold}ASTAR HEALTH${c.reset}`);
  console.log(`  ${c.bold}${c.white}╱  ╲${c.reset} ${c.dim}v${ch.cli.current}${c.reset}`);
  console.log("");

  console.log(`  ${c.bold}Core${c.reset}`);
  console.log(`  ${icon(ch.cli.status)} CLI        ${c.dim}v${ch.cli.current}${c.reset}${ch.cli.behind ? ` ${c.yellow}→ ${ch.cli.latest} available${c.reset}` : ` ${c.dim}(latest)${c.reset}`}`);
  console.log(`  ${icon(ch.auth.status)} Auth       ${ch.auth.email ? `${ch.auth.email}` : `${c.dim}not signed in${c.reset}`}${ch.auth.expired ? ` ${c.yellow}(expired — may auto-refresh)${c.reset}` : ch.auth.valid ? ` ${c.dim}(valid)${c.reset}` : ""}`);
  console.log(`  ${icon(ch.base_skill.status)} Base skill ${ch.base_skill.installed ? `astar-platform ${c.dim}(${ch.base_skill.integrity})${c.reset}` : `${c.red}not installed${c.reset}`}`);

  if (extended) {
    console.log("");
    console.log(`  ${c.bold}Extended${c.reset}`);

    const allSkills = [...ch.global_skills, ...ch.project_skills];
    const healthy = allSkills.filter((s) => s.status === "ok").length;
    const total = allSkills.length;
    if (total > 0) {
      console.log(`  ${icon(healthy === total ? "ok" : "warning")} Skills     ${c.dim}${ch.global_skills.length} global, ${ch.project_skills.length} project${c.reset}${healthy < total ? ` ${c.yellow}(${total - healthy} issues)${c.reset}` : ` ${c.dim}(all healthy)${c.reset}`}`);
      for (const s of allSkills.filter((s) => s.status !== "ok")) {
        console.log(`    ${icon(s.status)} ${s.name} ${c.dim}(${s.integrity})${c.reset}`);
      }
    } else {
      console.log(`  ${c.dim}  Skills     none installed${c.reset}`);
    }

    console.log(`  ${icon(ch.api.status)} API        ${ch.api.reachable ? `${c.dim}reachable (${ch.api.latency_ms}ms)${c.reset}` : `${c.red}unreachable${c.reset}`}`);
    console.log(`  ${icon(ch.cfa.status)} CFA        ${ch.cfa.online ? `${c.dim}online${c.reset}` : ch.cfa.pending > 0 ? `${c.yellow}offline (${ch.cfa.pending} pending)${c.reset}` : `${c.dim}idle${c.reset}`}`);
  }

  console.log("");
  const overall = result.overall === "healthy" ? `${c.green}healthy${c.reset}` : result.overall === "warning" ? `${c.yellow}warning${c.reset}` : `${c.red}critical${c.reset}`;
  console.log(`  Status: ${overall}${!extended ? ` ${c.dim}(run with --extended for full check)${c.reset}` : ""}`);
  console.log("");
}

export function registerHealthCommand(program: Command) {
  program
    .command("health")
    .description("Check system health: CLI, auth, skills, API, CFA")
    .option("--extended", "Include global skills, API, and CFA checks")
    .option("--json", "Output as JSON")
    .option("--fix", "Auto-fix issues (install missing skills, update outdated)")
    .action(async (opts: { extended?: boolean; json?: boolean; fix?: boolean }) => {
      const result = await runHealthChecks(opts.extended || false);

      if (opts.fix) {
        if (!result.checks.base_skill.installed) {
          console.log(`  ${c.dim}Installing base skill...${c.reset}`);
          await installBaseSkill();
          result.checks.base_skill = { status: "ok", installed: true, integrity: "ok" };
          console.log(`  ${c.green}✓${c.reset} Installed astar-platform skill`);
        } else if (result.checks.base_skill.integrity === "corrupted" || result.checks.base_skill.integrity === "hash mismatch") {
          console.log(`  ${c.dim}Reinstalling base skill (integrity issue)...${c.reset}`);
          await installBaseSkill();
          result.checks.base_skill = { status: "ok", installed: true, integrity: "ok" };
          console.log(`  ${c.green}✓${c.reset} Reinstalled astar-platform skill`);
        }

        const warnings = result.checks.global_skills.filter((s) => s.status !== "ok").length + result.checks.project_skills.filter((s) => s.status !== "ok").length;
        if (warnings === 0 && result.checks.base_skill.status === "ok") {
          result.overall = result.checks.auth.valid ? "healthy" : result.overall;
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        renderHealth(result, opts.extended || false);
      }

      const exitCode = result.overall === "healthy" ? 0 : result.overall === "warning" ? 1 : 2;
      process.exit(exitCode);
    });
}
