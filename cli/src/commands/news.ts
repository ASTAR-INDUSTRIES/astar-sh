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
    .description("Browse intelligence briefings from astar.sh");

  news
    .command("list")
    .description("List recent briefings")
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
        ["#", "Title", "Entities", "Category", "Sources", "Date"],
        articles.map((a, i) => [
          `${c.dim}${i + 1}${c.reset}`,
          `${c.cyan}${truncate(a.title, 38)}${c.reset}`,
          a.entities?.length ? `${c.dim}${a.entities.map((e) => e.name).join(", ")}${c.reset}` : `${c.dim}—${c.reset}`,
          a.category ? tag(a.category) : "",
          a.sources?.length ? `${c.dim}${a.sources.length}${c.reset}` : `${c.dim}—${c.reset}`,
          `${c.dim}${fmtDate(a.publishedAt)}${c.reset}`,
        ])
      );
      console.log("");
      console.log(`  ${c.dim}${articles.length} briefing(s)${opts.category ? ` in "${opts.category}"` : ""}${c.reset}`);
      console.log(`  ${c.dim}Details:${c.reset} ${c.cyan}astar news info <slug>${c.reset}`);
      console.log("");
    });

  news
    .command("info <slug>")
    .description("Read a full intelligence briefing")
    .action(async (slug: string) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);

      try {
        const a = await api.getNews(slug);

        console.log("");
        console.log(`  ${c.bold}${c.white}${a.title}${c.reset}`);
        console.log(`  ${c.dim}${a.authorName}${c.reset} · ${c.dim}${fmtDate(a.publishedAt)}${c.reset} · ${tag(a.category)}`);

        if (a.entities?.length) {
          console.log(`  ${c.dim}Entities:${c.reset} ${a.entities.map((e) => `${e.name} ${c.dim}(${e.domain})${c.reset}`).join(` ${c.dim}·${c.reset} `)}`);
        }

        if (a.continues && a.continuesTitle) {
          console.log(`  ${c.dim}Continues:${c.reset} ${a.continuesTitle}`);
          console.log(`  ${c.dim}→ astar news info ${a.continues}${c.reset}`);
        }

        console.log("");

        if (a.excerpt) {
          console.log(`  ${a.excerpt}`);
          console.log("");
        }

        if (a.sources?.length) {
          console.log(`  ${c.bold}${c.white}── SOURCE PERSPECTIVES ──${c.reset}`);
          console.log("");
          for (const src of a.sources) {
            const region = src.region ? ` ${c.dim}(${src.region})${c.reset}` : "";
            console.log(`  ${c.cyan}${src.name}${c.reset}${region}`);
            if (src.perspective) console.log(`  ${c.dim}${src.perspective}${c.reset}`);
            console.log(`  ${c.dim}${src.url}${c.reset}`);
            console.log("");
          }
        }

        if (a.consensus?.length) {
          console.log(`  ${c.bold}${c.white}── CONSENSUS ──${c.reset}`);
          for (const point of a.consensus) {
            console.log(`  ${c.green}•${c.reset} ${point}`);
          }
          console.log("");
        }

        if (a.divergence?.length) {
          console.log(`  ${c.bold}${c.white}── DIVERGENCE ──${c.reset}`);
          for (const point of a.divergence) {
            console.log(`  ${c.yellow}•${c.reset} ${point}`);
          }
          console.log("");
        }

        if (a.takeaway) {
          console.log(`  ${c.bold}${c.white}── ASTAR TAKEAWAY ──${c.reset}`);
          console.log(`  ${a.takeaway}`);
          console.log("");
        }

        if (a.content) {
          const lines = a.content.split("\n").slice(0, 20);
          console.log(`  ${c.dim}── full article ──${c.reset}`);
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
