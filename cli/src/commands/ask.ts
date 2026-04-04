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

async function pollForResponse(api: AstarAPI, slug: string, id: string, timeoutMs: number = 30000) {
  const start = Date.now();
  const interval = 3000;

  process.stdout.write(`  ${c.yellow}⏳${c.reset} Asking ${slug}...`);

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const msg = await api.getAgentMessage(slug, id);
      if (msg.status === "completed") {
        process.stdout.write(`\r${" ".repeat(40)}\r`);
        console.log(`  ${c.green}✓${c.reset} ${msg.response}`);
        return;
      }
      if (msg.status === "failed") {
        process.stdout.write(`\r${" ".repeat(40)}\r`);
        console.log(`  ${c.red}✗${c.reset} ${slug} error: ${msg.response || "Unknown error"}`);
        return;
      }
    } catch {}
  }

  process.stdout.write(`\r${" ".repeat(40)}\r`);
  console.log(`  ${c.dim}${slug} hasn't responded yet. Check later with:${c.reset} ${c.cyan}astar ask ${slug} --check${c.reset}`);
}

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

      const health = await api.checkAgentHealth(agent);
      const online = health.last_completed_at !== null || health.oldest_pending_age_seconds <= 300;
      if (!online) {
        console.log(`  ${c.yellow}⚠${c.reset}  ${agent} appears to be offline${health.pending_count ? ` (${health.pending_count} messages pending)` : ""}`);
        console.log(`  ${c.dim}Your message will be queued and processed when ${agent} comes back.${c.reset}`);
        console.log("");
      }

      try {
        const { id } = await api.askAgent(agent, message, type);

        if (type === "action") {
          console.log(`${c.green}✓${c.reset} Sent to ${c.cyan}${agent}${c.reset}. Will be processed shortly.`);
          if (!online) {
            console.log(`  ${c.dim}Check later with:${c.reset} ${c.cyan}astar ask ${agent} --check${c.reset}`);
          }
        } else {
          if (online) {
            await pollForResponse(api, agent, id);
          } else {
            console.log(`  ${c.green}✓${c.reset} Queued. Check later with: ${c.cyan}astar ask ${agent} --check${c.reset}`);
          }
        }
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
