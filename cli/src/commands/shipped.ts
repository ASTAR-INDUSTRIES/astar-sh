import type { Command } from "commander";
import { AstarAPI } from "../lib/api";
import { c, table, tag } from "../lib/ui";
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

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const catColors: Record<string, string> = {
  contract: c.cyan,
  technical: c.magenta,
  product: c.green,
  team: c.yellow,
  general: c.dim,
};

export function registerShippedCommands(program: Command) {
  const shipped = program
    .command("shipped [title]")
    .description("Log a shipped milestone or browse the calendar")
    .option("-c, --category <cat>", "Category: general, contract, technical, product, team", "general")
    .option("-d, --date <date>", "Date (YYYY-MM-DD, default: today)")
    .action(async (title: string | undefined, opts: { category: string; date?: string }) => {
      if (!title) {
        await shipped.commands.find((cmd) => cmd.name() === "list")!.parseAsync([], { from: "user" });
        return;
      }

      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        await api.createMilestone({
          title,
          category: opts.category,
          date: opts.date,
        });

        const catColor = catColors[opts.category] || c.dim;
        const dateStr = opts.date ? ` — ${fmtDate(opts.date)}` : "";
        console.log(`${c.green}✓${c.reset} Shipped! ${catColor}(${opts.category})${c.reset}${dateStr}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  shipped
    .command("list")
    .description("List recent milestones")
    .option("-m, --month <month>", "Filter by month (YYYY-MM)")
    .action(async (opts: { month?: string }) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);

      try {
        const items = await api.listMilestones(opts.month);

        if (!items.length) {
          console.log(`${c.dim}No milestones${opts.month ? ` in ${opts.month}` : ""}.${c.reset}`);
          return;
        }

        console.log("");
        table(
          ["#", "Title", "Category", "Shipped By", "Date"],
          items.map((m, i) => {
            const catColor = catColors[m.category] || c.dim;
            return [
              `${c.dim}${i + 1}${c.reset}`,
              m.title,
              `${catColor}${m.category}${c.reset}`,
              `${c.dim}${m.created_by || "—"}${c.reset}`,
              `${c.dim}${fmtDate(m.date)}${c.reset}`,
            ];
          })
        );
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
