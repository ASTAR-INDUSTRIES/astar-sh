import type { Command } from "commander";
import { AstarAPI } from "../lib/api";
import { c, table, tag } from "../lib/ui";
import { getToken } from "../lib/auth";

async function optionalAuth(): Promise<string | undefined> {
  try {
    return await getToken();
  } catch {
    return undefined;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function registerNewsCommands(program: Command) {
  const news = program
    .command("news")
    .description("Browse news from astar.sh");

  news
    .command("list")
    .description("List recent news")
    .option("-c, --category <category>", "Filter by category")
    .action(async (opts) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);
      const articles = await api.listNews(opts.category);

      if (!articles.length) {
        console.log(`${c.dim}No news found.${c.reset}`);
        return;
      }

      console.log("");
      table(
        ["#", "Title", "Category", "Author", "Date"],
        articles.map((a, i) => [
          `${c.dim}${i + 1}${c.reset}`,
          `${c.cyan}${truncate(a.title, 42)}${c.reset}`,
          a.category ? tag(a.category) : "",
          `${c.dim}${a.authorName || "—"}${c.reset}`,
          `${c.dim}${fmtDate(a.publishedAt)}${c.reset}`,
        ])
      );
      console.log("");
      console.log(`  ${c.dim}${articles.length} article(s)${opts.category ? ` in "${opts.category}"` : ""}${c.reset}`);
      console.log(`  ${c.dim}Read more at${c.reset} ${c.cyan}astar.sh${c.reset}`);
      console.log("");
    });

  news
    .command("info <slug>")
    .description("Read a news article")
    .action(async (slug: string) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);

      try {
        const a = await api.getNews(slug);

        console.log("");
        console.log(`  ${c.bold}${c.white}${a.title}${c.reset}`);
        console.log(`  ${c.dim}${a.authorName}${c.reset} · ${c.dim}${fmtDate(a.publishedAt)}${c.reset} · ${tag(a.category)}`);
        console.log("");

        if (a.excerpt) {
          console.log(`  ${c.dim}${a.excerpt}${c.reset}`);
          console.log("");
        }

        if (a.links?.length) {
          console.log(`  ${c.dim}links:${c.reset}`);
          for (const link of a.links) {
            console.log(`    ${c.cyan}${link.title}${c.reset} ${c.dim}${link.url}${c.reset}`);
          }
          console.log("");
        }

        if (a.content) {
          const lines = a.content.split("\n").slice(0, 20);
          console.log(`  ${c.dim}── content ──${c.reset}`);
          for (const line of lines) {
            console.log(`  ${c.dim}${line}${c.reset}`);
          }
          if (a.content.split("\n").length > 20) console.log(`  ${c.dim}...${c.reset}`);
          console.log("");
        }
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  news.action(async () => {
    await news.commands.find((cmd) => cmd.name() === "list")!.parseAsync([], { from: "user" });
  });
}
