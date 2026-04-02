import type { Command } from "commander";
import { AstarAPI } from "../lib/api";
import { c, table } from "../lib/ui";
import { getToken } from "../lib/auth";
import { getConfig } from "../lib/config";

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

const statusColors: Record<string, string> = {
  pending: c.dim,
  processing: c.yellow,
  completed: c.green,
  failed: c.red,
};

async function checkCfaHealth(): Promise<{ online: boolean; pending: number }> {
  try {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/inquiries/health`);
    if (!res.ok) return { online: false, pending: 0 };
    const data = await res.json();
    const hasActivity = data.last_completed_at !== null;
    const stale = data.oldest_pending_age_seconds > 300;
    return {
      online: hasActivity || !stale,
      pending: data.pending_count,
    };
  } catch {
    return { online: false, pending: 0 };
  }
}

async function pollForResponse(api: AstarAPI, id: string, timeoutMs: number = 30000) {
  const start = Date.now();
  const interval = 3000;

  process.stdout.write(`  ${c.yellow}⏳${c.reset} Asking CFA...`);

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const inquiry = await api.getInquiry(id);
      if (inquiry.status === "completed") {
        process.stdout.write(`\r${" ".repeat(40)}\r`);
        console.log(`  ${c.green}✓${c.reset} ${inquiry.response}`);
        return;
      }
      if (inquiry.status === "failed") {
        process.stdout.write(`\r${" ".repeat(40)}\r`);
        console.log(`  ${c.red}✗${c.reset} CFA error: ${inquiry.response || "Unknown error"}`);
        return;
      }
    } catch {}
  }

  process.stdout.write(`\r${" ".repeat(40)}\r`);
  console.log(`  ${c.dim}CFA hasn't responded yet. Check later with:${c.reset} ${c.cyan}astar hours check${c.reset}`);
}

export function registerHoursCommands(program: Command) {
  const hours = program
    .command("hours [question]")
    .description("Log hours, ask financial questions, or check CFA responses")
    .action(async (question: string | undefined) => {
      if (!question) {
        await hours.commands.find((cmd) => cmd.name() === "check")!.parseAsync([], { from: "user" });
        return;
      }

      const token = await requireAuth();
      const api = new AstarAPI(token);

      const health = await checkCfaHealth();
      if (!health.online) {
        console.log(`  ${c.yellow}⚠${c.reset}  CFA appears to be offline${health.pending ? ` (${health.pending} inquiries pending)` : ""}`);
        console.log(`  ${c.dim}Your question will be queued and answered when CFA comes back.${c.reset}`);
        console.log("");
      }

      try {
        const { id } = await api.submitInquiry(question, "question");
        if (health.online) {
          await pollForResponse(api, id);
        } else {
          console.log(`  ${c.green}✓${c.reset} Queued. Check later with: ${c.cyan}astar hours check${c.reset}`);
        }
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  hours
    .command("log <description>")
    .description("Log hours (processed by CFA)")
    .action(async (description: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        await api.submitInquiry(description, "log_hours");
        console.log(`${c.green}✓${c.reset} Sent to CFA. Will be logged shortly.`);

        const health = await checkCfaHealth();
        if (!health.online) {
          console.log(`  ${c.yellow}⚠${c.reset}  ${c.dim}CFA appears offline — will process when back.${c.reset}`);
        }
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  hours
    .command("check")
    .description("See your recent inquiries and CFA responses")
    .option("-s, --status <status>", "Filter: pending, processing, completed, failed")
    .action(async (opts: { status?: string }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        const [items, health] = await Promise.all([
          api.listOwnInquiries(opts.status),
          checkCfaHealth(),
        ]);

        if (!items.length) {
          console.log(`${c.dim}No inquiries.${c.reset}`);
          console.log(`  Submit with: ${c.cyan}astar hours log "8h on Project X"${c.reset}`);
          return;
        }

        console.log("");

        if (!health.online && health.pending > 0) {
          console.log(`  ${c.yellow}⚠${c.reset}  CFA offline — ${health.pending} inquiry(s) queued`);
          console.log("");
        }

        table(
          ["#", "Type", "Inquiry", "Status", "Response", "Date"],
          items.map((inq, i) => {
            const sc = statusColors[inq.status] || c.dim;
            return [
              `${c.dim}${i + 1}${c.reset}`,
              `${c.dim}${inq.type}${c.reset}`,
              truncate(inq.content, 30),
              `${sc}${inq.status}${c.reset}`,
              inq.response ? truncate(inq.response, 30) : `${c.dim}—${c.reset}`,
              `${c.dim}${fmtDate(inq.created_at)}${c.reset}`,
            ];
          })
        );
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  hours
    .command("month")
    .description("Ask CFA for your monthly summary")
    .action(async () => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

      const health = await checkCfaHealth();
      if (!health.online) {
        console.log(`  ${c.yellow}⚠${c.reset}  CFA appears to be offline`);
        console.log(`  ${c.dim}Your question will be queued and answered when CFA comes back.${c.reset}`);
        console.log("");
      }

      try {
        const { id } = await api.submitInquiry(`Give me my full monthly hour summary for ${month}`, "question");
        if (health.online) {
          await pollForResponse(api, id);
        } else {
          console.log(`  ${c.green}✓${c.reset} Queued. Check later with: ${c.cyan}astar hours check${c.reset}`);
        }
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
