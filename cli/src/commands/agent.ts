import type { Command } from "commander";
import { AstarAPI, type Agent } from "../lib/api";
import { c, table } from "../lib/ui";
import { getToken, loginForAgent } from "../lib/auth";
import { paths, ensureAgentDir } from "../lib/config";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

async function optionalAuth(): Promise<string | undefined> {
  try { return await getToken(); } catch { return undefined; }
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return `${c.dim}never${c.reset}`;
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const statusColors: Record<string, string> = {
  active: c.green,
  paused: c.yellow,
  retired: c.dim,
};

export function registerAgentCommands(program: Command) {
  const agent = program
    .command("agent")
    .description("Manage non-human employees")
    .action(async () => {
      await agent.commands.find((cmd) => cmd.name() === "list")!.parseAsync([], { from: "user" });
    });

  agent
    .command("list")
    .description("List all registered agents")
    .action(async () => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);
      try {
        const agents = await api.listAgents();
        if (!agents.length) {
          console.log(`${c.dim}No agents registered.${c.reset}`);
          console.log(`  Register with: ${c.cyan}astar agent register --slug cfa --name "Chief Financial Agent"${c.reset}`);
          return;
        }

        console.log("");
        table(
          ["Slug", "Name", "Status", "Last Seen", "Owner"],
          agents.map((a) => {
            const sc = statusColors[a.status] || c.dim;
            const seen = relativeTime(a.last_seen);
            const stale = a.status === "active" && a.last_seen && (Date.now() - new Date(a.last_seen).getTime()) > 300000;
            const seenStr = stale ? `${c.red}${seen} !!${c.reset}` : `${c.dim}${seen}${c.reset}`;
            return [
              `${c.cyan}${a.slug}${c.reset}`,
              a.name,
              `${sc}${a.status}${c.reset}`,
              seenStr,
              `${c.dim}${a.owner.split("@")[0]}${c.reset}`,
            ];
          })
        );
        const active = agents.filter((a) => a.status === "active").length;
        console.log("");
        console.log(`  ${c.dim}${agents.length} agent(s) · ${active} active${c.reset}`);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("info <slug>")
    .description("Show agent details and recent activity")
    .action(async (slug: string) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);
      try {
        const { agent: a, activity } = await api.getAgent(slug);
        const sc = statusColors[a.status] || c.dim;

        console.log("");
        console.log(`  ${c.bold}${c.white}${a.name}${c.reset}`);
        console.log(`  ${c.dim}slug:${c.reset}    ${c.cyan}${a.slug}${c.reset}`);
        if (a.email) console.log(`  ${c.dim}email:${c.reset}   ${a.email}`);
        console.log(`  ${c.dim}owner:${c.reset}   ${a.owner}`);
        if (a.skill_slug) console.log(`  ${c.dim}skill:${c.reset}   ${a.skill_slug}`);
        console.log(`  ${c.dim}status:${c.reset}  ${sc}${a.status}${c.reset}`);
        if (a.machine) console.log(`  ${c.dim}machine:${c.reset} ${a.machine}`);
        if (a.scopes?.length) console.log(`  ${c.dim}scopes:${c.reset}  ${a.scopes.join(` ${c.dim}·${c.reset} `)}`);
        console.log(`  ${c.dim}last seen:${c.reset} ${relativeTime(a.last_seen)}`);

        if (activity.length) {
          console.log("");
          console.log(`  ${c.bold}${c.white}Recent Activity${c.reset}`);
          for (const e of activity) {
            console.log(`  ${c.dim}${fmtTime(e.timestamp)}${c.reset}  ${e.action} ${e.entity_type}${e.entity_id ? ` #${e.entity_id}` : ""}`);
          }
        }
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("register")
    .description("Register a new agent")
    .requiredOption("--slug <slug>", "Unique identifier")
    .requiredOption("--name <name>", "Display name")
    .option("--email <email>", "Microsoft email")
    .option("--skill <slug>", "Skill that defines behavior")
    .option("--scopes <scopes>", "Comma-separated scopes")
    .option("--machine <machine>", "Machine it runs on")
    .option("--owner <email>", "Owner email (defaults to you)")
    .action(async (opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const result = await api.registerAgent({
          slug: opts.slug,
          name: opts.name,
          email: opts.email,
          skill_slug: opts.skill,
          scopes: opts.scopes?.split(",").map((s: string) => s.trim()) || [],
          machine: opts.machine,
          owner: opts.owner,
        });
        console.log(`${c.green}✓${c.reset} Agent ${c.cyan}${result.slug}${c.reset} registered`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("pause <slug>")
    .description("Pause an agent")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.updateAgent(slug, { status: "paused" });
        console.log(`${c.green}✓${c.reset} ${c.cyan}${slug}${c.reset} paused`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("resume <slug>")
    .description("Resume a paused agent")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.updateAgent(slug, { status: "active" });
        console.log(`${c.green}✓${c.reset} ${c.cyan}${slug}${c.reset} resumed`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("retire <slug>")
    .description("Permanently decommission an agent")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.updateAgent(slug, { status: "retired" });
        console.log(`${c.green}✓${c.reset} ${c.cyan}${slug}${c.reset} retired`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("logs <slug>")
    .description("Show agent audit trail")
    .action(async (slug: string) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);
      try {
        const events = await api.queryAudit({ actor_agent_id: slug, limit: 20 });
        if (!events.length) {
          console.log(`${c.dim}No audit events for ${slug}.${c.reset}`);
          return;
        }
        console.log("");
        for (const e of events) {
          console.log(`  ${c.dim}${fmtTime(e.timestamp)}${c.reset}  ${c.white}${e.action}${c.reset} ${e.entity_type}${e.entity_id ? ` #${e.entity_id}` : ""} ${c.dim}[${e.channel || "?"}]${c.reset}`);
        }
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("login <slug>")
    .description("Authenticate an agent's Microsoft account")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        const { agent: a } = await api.getAgent(slug);
        if (!a.email) {
          console.error(`${c.red}✗${c.reset} Agent '${slug}' has no email. Set it with:`);
          console.error(`  ${c.cyan}astar agent register --slug ${slug} --name "${a.name}" --email <email>${c.reset}`);
          process.exit(1);
        }

        console.log(`  Logging in as ${c.cyan}${a.email}${c.reset} for agent ${c.bold}${a.name}${c.reset}`);
        console.log("");

        const cache = await loginForAgent(slug);

        if (cache.account.username !== a.email) {
          console.error(`${c.red}✗${c.reset} Signed in as ${cache.account.username} but agent expects ${a.email}`);
          process.exit(1);
        }

        const agentDir = paths.agentDir(slug);
        const memoryFile = Bun.file(join(agentDir, "MEMORY.md"));
        if (!(await memoryFile.exists())) {
          await Bun.write(join(agentDir, "MEMORY.md"), `# Agent State: ${a.name}\n\n## Current\n- Last beat: never\n- Messages processed today: 0\n- Errors today: 0\n\n## Context\n(empty)\n`);
        }

        console.log(`${c.green}✓${c.reset} Agent ${c.cyan}${slug}${c.reset} authenticated as ${cache.account.username}`);
        console.log(`  ${c.dim}Workstation: ${agentDir}${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("hire <slug>")
    .description("One-command agent onboarding — register, auth, workstation, heartbeat")
    .requiredOption("--name <name>", "Display name")
    .requiredOption("--email <email>", "Microsoft email")
    .option("--skill <slug>", "Skill that defines behavior")
    .option("--scopes <scopes>", "Comma-separated scopes")
    .option("--machine <machine>", "Machine identifier")
    .option("--owner <email>", "Owner email")
    .option("--interval <seconds>", "Heartbeat interval in seconds", "30")
    .option("--skip-auth", "Skip Microsoft login (authenticate later with astar agent login)")
    .action(async (slug: string, opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      const scopes = opts.scopes?.split(",").map((s: string) => s.trim()) || [];
      const agentDir = paths.agentDir(slug);
      const home = homedir();

      console.log("");
      console.log(`  ${c.bold}Hiring ${opts.name}${c.reset} (${c.cyan}${slug}${c.reset})`);
      console.log("");

      try {
        console.log(`  ${c.dim}1/6${c.reset} Registering in agent registry...`);
        try {
          await api.registerAgent({ slug, name: opts.name, email: opts.email, skill_slug: opts.skill, scopes, machine: opts.machine, owner: opts.owner });
        } catch (e: any) {
          if (e.message?.includes("duplicate") || e.message?.includes("already")) {
            console.log(`  ${c.dim}     Already registered${c.reset}`);
          } else throw e;
        }

        console.log(`  ${c.dim}2/6${c.reset} Creating workstation at ${c.dim}${agentDir}${c.reset}`);
        await ensureAgentDir(slug);

        if (opts.skipAuth) {
          console.log(`  ${c.dim}3/6${c.reset} Skipping auth ${c.dim}(run ${c.cyan}astar agent login ${slug}${c.dim} later)${c.reset}`);
        } else {
          console.log(`  ${c.dim}3/6${c.reset} Authenticating as ${c.cyan}${opts.email}${c.reset}`);
          const cache = await loginForAgent(slug);
          if (cache.account.username !== opts.email) {
            console.error(`  ${c.red}✗${c.reset} Wrong account: signed in as ${cache.account.username}, expected ${opts.email}`);
            process.exit(1);
          }
        }

        console.log(`  ${c.dim}4/6${c.reset} Creating MEMORY.md`);
        await Bun.write(join(agentDir, "MEMORY.md"), `# Agent State: ${opts.name}\n\n## Current\n- Last beat: never\n- Messages processed today: 0\n- Errors today: 0\n\n## Context\n(empty)\n`);

        console.log(`  ${c.dim}5/6${c.reset} Generating heartbeat script`);
        const toolList = scopesToTools(scopes);
        const runSh = `#!/bin/bash
export ASTAR_AGENT="${slug}"
cd "${agentDir}"

claude -p "You are ${opts.name} running in heartbeat mode. Read MEMORY.md for your state. Check your inbox with read_inbox tool (agent_slug: ${slug}). Process any pending messages. Respond with respond_inbox. Update MEMORY.md with any state changes. Then exit." \\
  --allowedTools "${toolList}" \\
  --max-turns 20 \\
  --dangerously-skip-permissions
`;
        await Bun.write(join(agentDir, "run.sh"), runSh);
        execSync(`chmod +x "${join(agentDir, "run.sh")}"`);

        console.log(`  ${c.dim}6/6${c.reset} Installing launchd plist`);
        const label = `com.astar.agent.${slug}`;
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>${join(agentDir, "run.sh")}</string></array>
  <key>StartInterval</key><integer>${opts.interval}</integer>
  <key>StandardOutPath</key><string>${join(agentDir, "beat.log")}</string>
  <key>StandardErrorPath</key><string>${join(agentDir, "beat.err")}</string>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ASTAR_AGENT</key><string>${slug}</string>
    <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${home}/.bun/bin</string>
  </dict>
</dict>
</plist>`;
        const plistPath = join(home, "Library", "LaunchAgents", `${label}.plist`);
        await Bun.write(plistPath, plist);

        try {
          execSync(`launchctl load "${plistPath}" 2>/dev/null`);
        } catch {}

        console.log("");
        console.log(`  ${c.green}✓${c.reset} ${c.bold}${opts.name}${c.reset} is hired and running`);
        console.log("");
        console.log(`  ${c.dim}slug:${c.reset}      ${c.cyan}${slug}${c.reset}`);
        console.log(`  ${c.dim}email:${c.reset}     ${opts.email}`);
        if (opts.skill) console.log(`  ${c.dim}skill:${c.reset}     ${opts.skill}`);
        console.log(`  ${c.dim}scopes:${c.reset}    ${scopes.join(", ") || "none"}`);
        console.log(`  ${c.dim}heartbeat:${c.reset} every ${opts.interval}s`);
        console.log(`  ${c.dim}workspace:${c.reset} ${agentDir}`);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  agent
    .command("start <slug>")
    .description("Start an agent's heartbeat")
    .action(async (slug: string) => {
      const label = `com.astar.agent.${slug}`;
      const plistPath = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
      const file = Bun.file(plistPath);
      if (!(await file.exists())) {
        console.error(`${c.red}✗${c.reset} No launchd plist for ${slug}. Run ${c.cyan}astar agent hire ${slug}${c.reset} first.`);
        process.exit(1);
      }
      try {
        execSync(`launchctl load "${plistPath}" 2>/dev/null`);
        console.log(`${c.green}✓${c.reset} ${c.cyan}${slug}${c.reset} heartbeat started`);
      } catch {
        console.log(`${c.dim}Already running or loaded${c.reset}`);
      }
    });

  agent
    .command("stop <slug>")
    .description("Stop an agent's heartbeat")
    .action(async (slug: string) => {
      const label = `com.astar.agent.${slug}`;
      const plistPath = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
      try {
        execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
        console.log(`${c.green}✓${c.reset} ${c.cyan}${slug}${c.reset} heartbeat stopped`);
      } catch {
        console.log(`${c.dim}Not running${c.reset}`);
      }
    });
}

function scopesToTools(scopes: string[]): string {
  const scopeToolMap: Record<string, string[]> = {
    "inbox.read": ["read_inbox", "list_inbox"],
    "inbox.write": ["ask_agent"],
    "inbox.respond": ["respond_inbox"],
    "task.create": ["create_task"],
    "task.read": ["list_tasks", "get_task", "get_velocity", "suggest_next_task"],
    "task.write": ["update_task", "complete_task", "comment_task", "link_task"],
    "audit.read": ["query_audit"],
    "news.create": ["create_news"],
    "news.read": ["list_news"],
    "news.write": ["update_news"],
    "news.delete": ["delete_news"],
    "tweet.post": ["post_tweet"],
    "tweet.read": ["list_tweets"],
    "skill.read": ["list_skills", "get_skill"],
    "feedback.read": ["list_feedback"],
    "feedback.write": ["submit_feedback"],
    "agent.read": ["list_agents", "get_agent"],
    "milestone.create": ["create_milestone"],
    "milestone.read": ["list_milestones"],
  };

  const tools = new Set<string>();
  for (const scope of scopes) {
    const mapped = scopeToolMap[scope];
    if (mapped) mapped.forEach((t) => tools.add(t));
  }
  return [...tools].join(",");
}
