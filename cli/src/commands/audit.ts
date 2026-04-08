import type { Command } from "commander";
import { AstarAPI } from "../lib/api";
import { getToken } from "../lib/auth";
import { c, table } from "../lib/ui";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

const channelColors: Record<string, string> = {
  cli: c.cyan,
  mcp: c.magenta,
  api: c.white,
  dashboard: c.yellow,
  system: c.dim,
};

const actorTypeIcons: Record<string, string> = {
  human: "",
  agent: " [agent]",
  system: " [sys]",
};

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

export function registerAuditCommands(program: Command) {
  program
    .command("audit")
    .description("Query the audit trail — who did what, when, how")
    .option("--entity <type>", "Filter: task, skill, news, feedback, inquiry, milestone")
    .option("--id <id>", "Filter by entity ID")
    .option("--project <slug>", "Filter by project slug")
    .option("--actor <email>", "Filter by actor email")
    .option("--agent <id>", "Filter by agent ID (e.g. cfa)")
    .option("--channel <ch>", "Filter: cli, mcp, api, dashboard, system")
    .option("--action <action>", "Filter by action")
    .option("--today", "Only today's events")
    .option("-n, --limit <n>", "Max results", "30")
    .action(async (opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const since = opts.today ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString() : undefined;
        const events = await api.queryAudit({
          entity_type: opts.entity,
          entity_id: opts.id,
          project: opts.project,
          actor: opts.actor,
          actor_agent_id: opts.agent,
          channel: opts.channel,
          action: opts.action,
          since,
          limit: parseInt(opts.limit),
        });

        if (!events.length) {
          console.log(`${c.dim}No audit events found.${c.reset}`);
          return;
        }

        console.log("");
        table(
          ["Time", "Actor", "Channel", "Entity", "Action", "Detail"],
          events.map((e) => {
            const chColor = channelColors[e.channel || ""] || c.dim;
            const actorName = e.actor_email?.split("@")[0] || e.actor_type;
            const typeIcon = actorTypeIcons[e.actor_type] || "";
            const entityStr = e.entity_id ? `${e.entity_type} #${e.entity_id}` : e.entity_type;
            const detail = e.project?.slug
              ? `${e.project.slug} · ${e.state_after?.title || e.state_after?.comment || e.state_after?.type || ""}`.trim()
              : e.state_after?.title || e.state_after?.comment || e.state_after?.type || "";
            return [
              `${c.dim}${fmtTime(e.timestamp)}${c.reset}`,
              `${actorName}${c.dim}${typeIcon}${c.reset}`,
              `${chColor}${e.channel || "—"}${c.reset}`,
              `${c.cyan}${truncate(entityStr, 20)}${c.reset}`,
              `${c.white}${e.action}${c.reset}`,
              `${c.dim}${truncate(detail, 25)}${c.reset}`,
            ];
          })
        );
        console.log("");
        console.log(`  ${c.dim}${events.length} event(s)${c.reset}`);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
