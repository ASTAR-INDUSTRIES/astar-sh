# ETF

Simulated (paper) ETF portfolio system. Tracks real stock prices via Yahoo Finance, calculates weighted NAV, and auto-links news to holdings.

## Data model

### etf_funds
Fund metadata: ticker (unique), name, description, strategy, inception_date, base_nav (default 100), status (active/paused/closed), created_by.

### etf_holdings
Allocations per fund: symbol, name, domain (for news matching), sector, weight (decimal 0-1). Unique on (fund_id, symbol). Weights must sum to 1.0 — enforced at API layer.

### etf_prices
Daily price cache shared across all funds: symbol, date, close_price, change_pct. Unique on (symbol, date). Populated by Yahoo Finance fetch.

### etf_performance
Daily fund NAV: nav, daily_return, cumulative_return, holdings_snapshot (jsonb captures exact weights used). Unique on (fund_id, date).

## NAV calculation

```
daily_return = SUM(holding_weight * holding_daily_change_pct)
nav = previous_nav * (1 + daily_return)
cumulative_return = (nav / base_nav) - 1
```

NAV starts at 100 on inception date. Compounding daily. Only calculated on trading days (weekends/holidays have no price data and are skipped).

## Price fetching

- Source: Yahoo Finance v8 (`query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}`)
- Range: 1 month of daily data per fetch (fills gaps automatically)
- SPY always fetched alongside holdings for benchmark comparison
- Idempotent: upserts on (symbol, date) unique constraint
- Triggered via `POST /etf/refresh-prices` or `astar etf refresh`

## Benchmark

SPY (S&P 500 ETF) tracked automatically. Cumulative return calculated from fund inception date. Alpha = fund cumulative return - SPY cumulative return.

## News linkage

Computed at query time — no materialized table. GROQ query matches `etf_holdings.name`/`domain` against `newsPost.entities[].name`/`entities[].domain`.

## Key files

- `supabase/migrations/20260407000000_etf_funds.sql` — 4 tables
- `supabase/migrations/20260407000001_seed_astx.sql` — ASTX seed data
- `supabase/functions/skills-api/index.ts` — 8 REST endpoints + Yahoo Finance fetcher
- `supabase/functions/mcp-server/index.ts` — 6 MCP tools
- `cli/src/commands/etf.ts` — CLI commands
- `cli/src/lib/api.ts` — EtfFund, EtfHolding, EtfPerformancePoint interfaces
