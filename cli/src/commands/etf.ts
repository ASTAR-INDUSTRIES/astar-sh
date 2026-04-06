import { Command } from "commander";
import { getToken } from "../lib/auth";
import { AstarAPI, EtfFund, EtfHolding } from "../lib/api";
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

const SPARK_CHARS = "▁▂▃▄▅▆▇█";
function sparkline(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => {
    const idx = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1));
    return SPARK_CHARS[idx];
  }).join("");
}

function asciiChart(data: { date: string; value: number }[], opts: { width?: number; height?: number; label?: string; benchmarkData?: { date: string; value: number }[] } = {}): string {
  if (data.length < 2) return "";
  const width = opts.width || 60;
  const height = opts.height || 12;

  const allValues = [...data.map(d => d.value)];
  if (opts.benchmarkData?.length) allValues.push(...opts.benchmarkData.map(d => d.value));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const sampled = data.length <= width ? data : data.filter((_, i) => i === 0 || i === data.length - 1 || Math.floor(i * width / data.length) !== Math.floor((i - 1) * width / data.length));
  const values = sampled.map(d => d.value);

  let benchValues: number[] = [];
  if (opts.benchmarkData?.length) {
    const bs = opts.benchmarkData.length <= width ? opts.benchmarkData : opts.benchmarkData.filter((_, i) => i === 0 || i === opts.benchmarkData!.length - 1 || Math.floor(i * width / opts.benchmarkData!.length) !== Math.floor((i - 1) * width / opts.benchmarkData!.length));
    benchValues = bs.map(d => d.value);
  }

  const lines: string[] = [];
  const labelWidth = 8;

  for (let row = height - 1; row >= 0; row--) {
    const threshold = min + (range * row / (height - 1));
    const yLabel = row === height - 1 ? max.toFixed(1) : row === 0 ? min.toFixed(1) : "";
    let line = `  ${c.dim}${yLabel.padStart(labelWidth)}${c.reset} `;

    for (let col = 0; col < values.length; col++) {
      const val = values[col];
      const benchVal = benchValues[col];
      const nextThreshold = min + (range * (row + 1) / (height - 1));

      if (val >= threshold && (row === height - 1 || val < nextThreshold)) {
        const lastVal = values[values.length - 1];
        const firstVal = values[0];
        line += lastVal >= firstVal ? `${c.green}█${c.reset}` : `${c.red}█${c.reset}`;
      } else if (val > threshold) {
        const lastVal = values[values.length - 1];
        const firstVal = values[0];
        line += lastVal >= firstVal ? `${c.green}│${c.reset}` : `${c.red}│${c.reset}`;
      } else if (benchVal != null && benchVal >= threshold && (row === height - 1 || benchVal < nextThreshold)) {
        line += `${c.dim}·${c.reset}`;
      } else {
        line += " ";
      }
    }
    lines.push(line);
  }

  const dateFirst = sampled[0]?.date?.slice(5) || "";
  const dateLast = sampled[sampled.length - 1]?.date?.slice(5) || "";
  const axisLine = `  ${"".padStart(labelWidth)} ${c.dim}${dateFirst}${"─".repeat(Math.max(1, values.length - dateFirst.length - dateLast.length))}${dateLast}${c.reset}`;
  lines.push(axisLine);

  if (opts.label) {
    const legend = opts.benchmarkData?.length
      ? `  ${"".padStart(labelWidth)} ${opts.label}  ${c.dim}· SPY${c.reset}`
      : `  ${"".padStart(labelWidth)} ${opts.label}`;
    lines.push(legend);
  }

  return lines.join("\n");
}

let monitorExpanded = true;
let monitorError = "";
let lastFunds: EtfFund[] = [];
let lastDetail: { fund: EtfFund; holdings: EtfHolding[]; performance: any; benchmark: any; news: any[]; perfHistory: any[]; benchHistory: any[] } | null = null;

async function renderMonitorAll(api: AstarAPI) {
  try {
    lastFunds = await api.listEtf();
    monitorError = "";
  } catch (e: any) {
    monitorError = e.message?.includes("401") ? "session expired — re-run astar login" : "API unreachable";
  }

  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const cols = process.stdout.columns || 100;

  process.stdout.write("\x1b[2J\x1b[H");

  console.log("");
  const headerPad = Math.max(1, cols - 18);
  console.log(`  ${c.bold}ETF FUNDS${c.reset}${" ".repeat(headerPad)}${c.dim}${time}${c.reset}`);
  console.log("");

  if (!lastFunds.length) {
    console.log(`  ${c.dim}No active funds.${c.reset}`);
  } else {
    for (const f of lastFunds) {
      const nav = fmtNav(f.latest_nav);
      const daily = fmtPct(f.daily_return);
      const cumul = fmtPct(f.cumulative_return);
      console.log(`  ${c.cyan}${c.bold}${f.ticker}${c.reset}  ${f.name}`);
      console.log(`  ${c.bold}${nav}${c.reset}  ${daily}  ${c.dim}cumul${c.reset} ${cumul}  ${c.dim}${f.holdings_count} holdings${c.reset}`);
      if (monitorExpanded && f.description) {
        console.log(`  ${c.dim}${f.description}${c.reset}`);
      }
      console.log("");
    }
  }

  if (monitorError) {
    console.log(`  ${c.yellow}⚠${c.reset}  ${c.yellow}${monitorError}${c.reset} ${c.dim}— showing last known state${c.reset}`);
  }
  console.log(`  ${c.dim}${lastFunds.length} fund(s)${c.reset}${" ".repeat(Math.max(1, cols - 55))}${c.dim}ctrl+o ${monitorExpanded ? "collapse" : "expand"} · ctrl+c quit${c.reset}`);
}

async function renderMonitorSingle(api: AstarAPI, ticker: string) {
  try {
    const [detail, news, perfFull] = await Promise.all([
      api.getEtf(ticker),
      api.getEtfNews(ticker).catch(() => []),
      api.getEtfPerformanceFull(ticker, "all").catch(() => ({ data: [], benchmark: [] })),
    ]);
    lastDetail = { ...detail, news, perfHistory: perfFull.data || [], benchHistory: perfFull.benchmark || [] };
    monitorError = "";
  } catch (e: any) {
    monitorError = e.message?.includes("401") ? "session expired — re-run astar login" : "API unreachable";
  }
  if (!lastDetail) return;

  const { fund, holdings, performance, benchmark, news, perfHistory, benchHistory } = lastDetail;
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const cols = process.stdout.columns || 100;

  process.stdout.write("\x1b[2J\x1b[H");

  console.log("");
  const headerPad = Math.max(1, cols - fund.ticker.length - 15);
  console.log(`  ${c.bold}${c.cyan}${fund.ticker}${c.reset}${" ".repeat(headerPad)}${c.dim}${time}${c.reset}`);
  console.log(`  ${c.bold}${fund.name}${c.reset}`);
  if (monitorExpanded && fund.strategy) {
    console.log(`  ${c.dim}${fund.strategy}${c.reset}`);
  }

  console.log("");
  const nav = `${c.bold}${fmtNav(performance.nav)}${c.reset}`;
  const daily = fmtPct(performance.daily_return);
  const cumul = fmtPct(performance.cumulative_return);
  console.log(`  NAV ${nav}  Daily ${daily}  Inception ${cumul}`);

  if (benchmark) {
    const alpha = performance.cumulative_return - benchmark.cumulative_return;
    const alphaColor = alpha > 0 ? c.green : alpha < 0 ? c.red : c.dim;
    const alphaSign = alpha > 0 ? "+" : "";
    console.log(`  ${c.dim}SPY${c.reset} ${fmtPct(benchmark.daily_return)} daily  ${fmtPct(benchmark.cumulative_return)} cumul  ${c.dim}α${c.reset} ${alphaColor}${alphaSign}${(alpha * 100).toFixed(2)}%${c.reset}`);
  }

  if (perfHistory.length >= 2) {
    const chartWidth = Math.min(60, cols - 15);
    const chartData = perfHistory.map((p: any) => ({ date: p.date, value: p.nav }));
    const benchData = benchHistory.length >= 2
      ? benchHistory.map((b: any) => ({ date: b.date, value: 100 * (1 + b.cumulative_return) }))
      : undefined;
    console.log("");
    console.log(asciiChart(chartData, { width: chartWidth, height: 8, label: `${c.bold}NAV${c.reset}`, benchmarkData: benchData }));
  }

  console.log("");
  console.log(`  ${c.bold}HOLDINGS${c.reset} ${c.dim}(${holdings.length})${c.reset}`);
  console.log("");

  const symWidth = 6;
  const nameWidth = Math.min(25, Math.max(12, cols - 75));
  console.log(`  ${c.dim}  ${"".padEnd(symWidth)} ${"".padEnd(nameWidth)} ${"Weight".padStart(6)}  ${"Price".padStart(10)}  ${"Daily".padStart(8)}  ${"Entry".padStart(10)}  ${"Since".padStart(8)}  ${"20d".padStart(10)}${c.reset}`);
  for (const h of holdings) {
    const sym = h.symbol.padEnd(symWidth);
    const name = h.name.length > nameWidth ? h.name.slice(0, nameWidth - 1) + "…" : h.name.padEnd(nameWidth);
    const weight = `${(h.weight * 100).toFixed(1)}%`.padStart(6);
    const price = h.latest_price != null ? `$${h.latest_price.toFixed(2)}`.padStart(10) : `${c.dim}${"—".padStart(10)}${c.reset}`;
    const change = h.daily_change_pct != null ? fmtPct(h.daily_change_pct / 100) : `${c.dim}—${c.reset}`;
    const changeColor = h.daily_change_pct != null && h.daily_change_pct > 0 ? c.green : h.daily_change_pct != null && h.daily_change_pct < 0 ? c.red : c.dim;
    const entryPx = (h as any).entry_price != null ? `$${(h as any).entry_price.toFixed(2)}`.padStart(10) : `${c.dim}${"—".padStart(10)}${c.reset}`;
    const sinceEntry = (h as any).since_entry_pct != null ? fmtPct((h as any).since_entry_pct / 100) : `${c.dim}—${c.reset}`;
    const hist = (h as any).price_history || [];
    const spark = hist.length >= 2 ? sparkline(hist) : "";
    const sparkColor = hist.length >= 2 && hist[hist.length - 1] >= hist[0] ? c.green : c.red;
    const bar = h.daily_change_pct != null && h.daily_change_pct > 0 ? `${c.green}▲${c.reset}` : h.daily_change_pct != null && h.daily_change_pct < 0 ? `${c.red}▼${c.reset}` : `${c.dim}·${c.reset}`;
    console.log(`  ${bar} ${c.cyan}${sym}${c.reset} ${c.dim}${name}${c.reset} ${weight}  ${price}  ${change}  ${entryPx}  ${sinceEntry}  ${sparkColor}${spark}${c.reset}`);
  }

  if (news.length) {
    const newsLimit = monitorExpanded ? 5 : 3;
    console.log("");
    console.log(`  ${c.bold}NEWS${c.reset} ${c.dim}(${news.length} linked)${c.reset}`);
    for (const n of news.slice(0, newsLimit)) {
      const date = n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
      const entities = (n.entities || []).map((e: any) => e.name).slice(0, 3).join(", ");
      console.log(`  ${c.dim}${date}${c.reset}  ${n.title}`);
      if (monitorExpanded && entities) console.log(`  ${c.dim}       ${entities}${c.reset}`);
    }
    if (news.length > newsLimit) console.log(`  ${c.dim}  +${news.length - newsLimit} more${c.reset}`);
  }

  console.log("");
  if (monitorError) {
    console.log(`  ${c.yellow}⚠${c.reset}  ${c.yellow}${monitorError}${c.reset} ${c.dim}— showing last known state${c.reset}`);
  }
  console.log(`  ${c.dim}Inception: ${fund.inception_date}${c.reset}${" ".repeat(Math.max(1, cols - 60))}${c.dim}ctrl+o ${monitorExpanded ? "collapse" : "expand"} · ctrl+c quit${c.reset}`);
}

function startMonitorLoop(tickFn: () => Promise<void>) {
  const run = async () => { try { await tickFn(); } catch {} };
  run();
  const interval = setInterval(run, 30000);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (key: Buffer) => {
      if (key[0] === 0x03) { clearInterval(interval); process.stdin.setRawMode(false); console.log(""); process.exit(0); }
      if (key[0] === 0x0f) { monitorExpanded = !monitorExpanded; run(); }
    });
  } else {
    process.on("SIGINT", () => { clearInterval(interval); console.log(""); process.exit(0); });
  }
}

export function registerEtfCommands(program: Command) {
  const etf = program
    .command("etf [ticker]")
    .description("Simulated ETF portfolios — track, rebalance, and analyze")
    .option("--monitor", "Live-updating ETF dashboard (30s refresh)")
    .action(async (ticker: string | undefined, opts) => {
      if (opts.monitor) {
        async function freshApi(): Promise<AstarAPI> {
          const token = await getToken();
          return new AstarAPI(token);
        }
        if (ticker) {
          startMonitorLoop(async () => { const api = await freshApi(); await renderMonitorSingle(api, ticker); });
        } else {
          startMonitorLoop(async () => { const api = await freshApi(); await renderMonitorAll(api); });
        }
        await new Promise(() => {});
        return;
      }

      if (ticker && /^[A-Z]{2,5}$/i.test(ticker)) {
        await etf.commands.find((cmd) => cmd.name() === "info")!.parseAsync([ticker], { from: "user" });
        return;
      }

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
        const { fund, holdings, performance, benchmark } = await api.getEtf(ticker);

        console.log("");
        console.log(`  ${c.bold}${fund.name}${c.reset} (${c.cyan}${fund.ticker}${c.reset})`);
        if (fund.description) console.log(`  ${c.dim}${fund.description}${c.reset}`);
        console.log(`  ${c.dim}Inception:${c.reset} ${fund.inception_date} · ${c.dim}Status:${c.reset} ${fund.status}`);
        if (fund.strategy) console.log(`  ${c.dim}Strategy:${c.reset} ${fund.strategy}`);

        console.log("");
        console.log(`  ${c.bold}PERFORMANCE${c.reset}`);
        console.log(`  NAV: ${c.bold}${fmtNav(performance.nav)}${c.reset}  Daily: ${fmtPct(performance.daily_return)}  Since inception: ${fmtPct(performance.cumulative_return)}`);
        if (benchmark) {
          const alpha = performance.cumulative_return - benchmark.cumulative_return;
          const alphaColor = alpha > 0 ? c.green : alpha < 0 ? c.red : c.dim;
          console.log(`  ${c.dim}SPY:${c.reset}  Daily: ${fmtPct(benchmark.daily_return)}  Since inception: ${fmtPct(benchmark.cumulative_return)}  ${c.dim}Alpha:${c.reset} ${alphaColor}${alpha > 0 ? "+" : ""}${(alpha * 100).toFixed(2)}%${c.reset}`);
        }

        console.log("");
        console.log(`  ${c.bold}HOLDINGS${c.reset}`);
        table(
          ["Symbol", "Name", "Weight", "Price", "Daily", "Entry", "Since Entry"],
          holdings.map((h: any) => [
            `${c.cyan}${h.symbol}${c.reset}`,
            h.name,
            `${(h.weight * 100).toFixed(1)}%`,
            h.latest_price != null ? `$${h.latest_price.toFixed(2)}` : `${c.dim}—${c.reset}`,
            h.daily_change_pct != null ? fmtPct(h.daily_change_pct / 100) : `${c.dim}—${c.reset}`,
            h.entry_price != null ? `$${h.entry_price.toFixed(2)}` : `${c.dim}—${c.reset}`,
            h.since_entry_pct != null ? fmtPct(h.since_entry_pct / 100) : `${c.dim}—${c.reset}`,
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
        } catch {}

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
        const full = await api.getEtfPerformanceFull(ticker, opts.range);
        const data = full.data;
        if (!data.length) {
          console.log(`${c.dim}No performance data yet.${c.reset}`);
          return;
        }
        console.log("");
        console.log(`  ${c.bold}${ticker.toUpperCase()}${c.reset} — ${opts.range} performance`);

        const chartData = data.map(p => ({ date: p.date, value: p.nav }));
        const benchData = full.benchmark?.length >= 2
          ? full.benchmark.map((b: any) => ({ date: b.date, value: 100 * (1 + b.cumulative_return) }))
          : undefined;
        const chartWidth = Math.min(60, (process.stdout.columns || 100) - 15);
        console.log("");
        console.log(asciiChart(chartData, { width: chartWidth, height: 10, label: `${c.bold}NAV${c.reset}`, benchmarkData: benchData }));

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
