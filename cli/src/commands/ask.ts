import type { Command } from "commander";
import { AstarAPI, type InboxMessage } from "../lib/api";
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function inferType(content: string): "action" | "question" | "review" {
  const lower = content.toLowerCase().trim();
  if (lower.includes("?") || /^(what|how|why|when|who|where|is |are |can |do |does )/.test(lower)) return "question";
  if (/^review|review this|check this/.test(lower)) return "review";
  return "action";
}

const statusColors: Record<string, string> = {
  pending: c.dim,
  processing: c.yellow,
  completed: c.green,
  failed: c.red,
};

export function registerAskCommands(program: Command) {
  program
    .command("ask <agent> [message]")
    .description("Send a message to any agent")
    .option("--type <type>", "Force type: action, question, review")
    .option("--check", "List your recent messages to this agent")
    .option("-s, --status <status>", "Filter: pending, processing, completed, failed")
    .action(async (agent: string, message: string | undefined, opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      if (opts.check || !message) {
        try {
          const items = await api.listAgentMessages(agent, opts.status);
          if (!items.length) {
            console.log(`${c.dim}No messages to ${agent}.${c.reset}`);
            console.log(`  Send one: ${c.cyan}astar ask ${agent} "your message"${c.reset}`);
            return;
          }

          console.log("");
          table(
            ["#", "Type", "Message", "Status", "Response", "Date"],
            items.map((m, i) => {
              const sc = statusColors[m.status] || c.dim;
              return [
                `${c.dim}${i + 1}${c.reset}`,
                `${c.dim}${m.type}${c.reset}`,
                truncate(m.content, 30),
                `${sc}${m.status}${c.reset}`,
                m.response ? truncate(m.response, 30) : `${c.dim}—${c.reset}`,
                `${c.dim}${fmtDate(m.created_at)}${c.reset}`,
              ];
            })
          );
          console.log("");
        } catch (e: any) {
          console.error(`${c.red}✗${c.reset} ${e.message}`);
          process.exit(1);
        }
        return;
      }

      const type = opts.type || inferType(message);

      try {
        await api.askAgent(agent, message, type);
        console.log(`${c.green}✓${c.reset} Sent to ${c.cyan}${agent}${c.reset}`);

      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
