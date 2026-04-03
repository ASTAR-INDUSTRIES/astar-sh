import { execSync } from "child_process";
import type { Command } from "commander";
import { AstarAPI } from "../lib/api";
import { c, table, tag, badge } from "../lib/ui";
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
  try {
    return await getToken();
  } catch {
    return undefined;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function getGitContext(): Record<string, string> {
  const ctx: Record<string, string> = {};
  try {
    ctx.repo = execSync("git rev-parse --show-toplevel", { stdio: "pipe" }).toString().trim().split("/").pop() || "";
    ctx.branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: "pipe" }).toString().trim();
  } catch {}
  return ctx;
}

const typeColors: Record<string, string> = {
  bug: c.red,
  feature: c.cyan,
  pain: c.yellow,
  praise: c.green,
};

const statusColors: Record<string, string> = {
  new: c.white,
  accepted: c.green,
  rejected: c.red,
  done: c.dim,
};

export function registerFeedbackCommands(program: Command) {
  const fb = program
    .command("feedback [message]")
    .description("Submit feedback or browse existing feedback")
    .option("-t, --type <type>", "Type: bug, feature, pain, praise", "feature")
    .option("-s, --skill <slug>", "Link to a skill")
    .action(async (message: string | undefined, opts: { type: string; skill?: string }) => {
      if (!message) {
        await fb.commands.find((cmd) => cmd.name() === "list")!.parseAsync([], { from: "user" });
        return;
      }

      const token = await requireAuth();
      const api = new AstarAPI(token);
      const context = getGitContext();

      try {
        await api.submitFeedback({
          content: message,
          type: opts.type,
          linked_skill: opts.skill || undefined,
          context,
        });

        const typeColor = typeColors[opts.type] || c.dim;
        console.log(`${c.green}✓${c.reset} Feedback submitted ${typeColor}(${opts.type})${c.reset}`);
        if (opts.skill) console.log(`  ${c.dim}→ ${opts.skill}${c.reset}`);
        if (context.repo) console.log(`  ${c.dim}context: ${context.repo}/${context.branch}${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  fb
    .command("list")
    .description("List recent feedback")
    .option("-s, --status <status>", "Filter: new, accepted, rejected, done")
    .action(async (opts: { status?: string }) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);

      try {
        const items = await api.listFeedback(opts.status);

        if (!items.length) {
          console.log(`${c.dim}No feedback${opts.status ? ` with status "${opts.status}"` : ""}.${c.reset}`);
          return;
        }

        console.log("");
        table(
          ["#", "Type", "Feedback", "Author", "Status", "Date"],
          items.map((f, i) => {
            const typeColor = typeColors[f.type] || c.dim;
            const statColor = statusColors[f.status] || c.dim;
            return [
              `${c.dim}${i + 1}${c.reset}`,
              `${typeColor}${f.type}${c.reset}`,
              `${truncate(f.content, 40)}`,
              `${c.dim}${f.author_name || f.author_email.split("@")[0]}${c.reset}`,
              `${statColor}${f.status}${c.reset}`,
              `${c.dim}${fmtDate(f.created_at)}${c.reset}`,
            ];
          })
        );
        console.log("");
        console.log(`  ${c.dim}${items.length} item(s)${c.reset}`);
        console.log(`  ${c.dim}Submit:${c.reset} ${c.cyan}astar feedback "your message"${c.reset}`);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  fb
    .command("close <id>")
    .description("Mark feedback as done")
    .option("-r, --resolution <text>", "Resolution note")
    .action(async (id: string, opts: { resolution?: string }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.updateFeedback(id, "done", opts.resolution);
        console.log(`${c.green}✓${c.reset} Feedback closed`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  fb
    .command("reject <id>")
    .description("Mark feedback as not relevant")
    .option("-r, --reason <text>", "Reason for rejection")
    .action(async (id: string, opts: { reason?: string }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.updateFeedback(id, "rejected", opts.reason);
        console.log(`${c.green}✓${c.reset} Feedback rejected`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
