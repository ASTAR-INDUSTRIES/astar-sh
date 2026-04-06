import { Command } from "commander";
import { getToken } from "../lib/auth";
import { AstarAPI } from "../lib/api";
import { c, table } from "../lib/ui";

async function requireAuth(): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated. Run 'astar login' first.");
  return token;
}

function fmtPct(val: number | null | undefined): string {
  if (val == null) return `${c.dim}—${c.reset}`;
  const pct = (val * 100).toFixed(2);
  const color = val > 0 ? c.green : val < 0 ? c.red : c.dim;
  const sign = val > 0 ? "+" : "";
  return `${color}${sign}${pct}%${c.reset}`;
}

function fmtNav(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toFixed(2);
}

export function registerEtfCommands(program: Command) {
  const etf = program
    .command("etf")
    .description("Simulated ETF portfolios — track, rebalance, and analyze")
    .action(async () => {
      await etf.commands.find((cmd) => cmd.name() === "list")!.parseAsync([], { from: "user" });
    });

  etf
    .command("list")
    .description("List all ETF funds")
    .action(async () => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const funds = await api.listEtf();
        if (!funds.length) {
          console.log(`${c.dim}No funds.${c.reset}`);
          return;
        }
        console.log("");
        table(
          ["Ticker", "Name", "NAV", "Daily", "Cumul", "Holdings", "Status"],
          funds.map((f) => [
            `${c.cyan}${f.ticker}${c.reset}`,
            f.name,
            `${c.bold}${fmtNav(f.latest_nav)}${c.reset}`,
            fmtPct(f.daily_return),
            fmtPct(f.cumulative_return),
            `${c.dim}${f.holdings_count}${c.reset}`,
            `${c.dim}${f.status}${c.reset}`,
          ])
        );
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  etf
    .command("info <ticker>")
    .description("Detailed fund view — holdings, performance, linked news")
    .action(async (ticker: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const { fund, holdings, performance } = await api.getEtf(ticker);

        console.log("");
        console.log(`  ${c.bold}${fund.name}${c.reset} (${c.cyan}${fund.ticker}${c.reset})`);
        if (fund.description) console.log(`  ${c.dim}${fund.description}${c.reset}`);
        console.log(`  ${c.dim}Inception:${c.reset} ${fund.inception_date} · ${c.dim}Status:${c.reset} ${fund.status}`);
        if (fund.strategy) console.log(`  ${c.dim}Strategy:${c.reset} ${fund.strategy}`);

        console.log("");
        console.log(`  ${c.bold}PERFORMANCE${c.reset}`);
        console.log(`  NAV: ${c.bold}${fmtNav(performance.nav)}${c.reset}  Daily: ${fmtPct(performance.daily_return)}  Since inception: ${fmtPct(performance.cumulative_return)}`);

        console.log("");
        console.log(`  ${c.bold}HOLDINGS${c.reset}`);
        table(
          ["Symbol", "Name", "Weight", "Price", "Change"],
          holdings.map((h) => [
            `${c.cyan}${h.symbol}${c.reset}`,
            h.name,
            `${(h.weight * 100).toFixed(1)}%`,
            h.latest_price != null ? `$${h.latest_price.toFixed(2)}` : `${c.dim}—${c.reset}`,
            h.daily_change_pct != null ? fmtPct(h.daily_change_pct / 100) : `${c.dim}—${c.reset}`,
          ])
        );

        try {
          const news = await api.getEtfNews(ticker);
          if (news.length) {
            console.log("");
            console.log(`  ${c.bold}LINKED NEWS${c.reset}`);
            for (const n of news.slice(0, 5)) {
              const date = n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
              console.log(`  ${c.dim}${date}${c.reset}  ${n.title}`);
            }
          }
        } catch { /* news fetch optional */ }

        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  etf
    .command("performance <ticker>")
    .description("Performance history")
    .option("--range <range>", "Time range: 1w, 1m, 3m, 6m, 1y, all", "1m")
    .action(async (ticker: string, opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const data = await api.getEtfPerformance(ticker, opts.range);
        if (!data.length) {
          console.log(`${c.dim}No performance data yet.${c.reset}`);
          return;
        }
        console.log("");
        console.log(`  ${c.bold}${ticker.toUpperCase()}${c.reset} — ${opts.range} performance`);
        console.log("");
        table(
          ["Date", "NAV", "Daily", "Cumulative"],
          data.map((p) => [
            p.date,
            fmtNav(p.nav),
            fmtPct(p.daily_return),
            fmtPct(p.cumulative_return),
          ])
        );
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  etf
    .command("news <ticker>")
    .description("News articles linked to fund holdings")
    .action(async (ticker: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const news = await api.getEtfNews(ticker);
        if (!news.length) {
          console.log(`${c.dim}No linked news.${c.reset}`);
          return;
        }
        console.log("");
        for (const n of news) {
          const date = n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
          const entities = (n.entities || []).map((e: any) => e.name).join(", ");
          console.log(`  ${c.dim}${date}${c.reset}  ${n.title}`);
          if (entities) console.log(`  ${c.dim}     ${entities}${c.reset}`);
        }
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  etf
    .command("refresh [ticker]")
    .description("Fetch latest prices and recalculate NAV")
    .action(async (ticker?: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        console.log(`${c.dim}Fetching prices...${c.reset}`);
        const result = await api.refreshEtfPrices(ticker);
        console.log(`${c.green}✓${c.reset} ${result.prices_fetched} symbols fetched, ${result.navs_calculated} NAV(s) calculated`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
