import type { Command } from "commander";
import { AstarAPI, type Agent } from "../lib/api";
import { c, table } from "../lib/ui";
import { getToken } from "../lib/auth";

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
}
