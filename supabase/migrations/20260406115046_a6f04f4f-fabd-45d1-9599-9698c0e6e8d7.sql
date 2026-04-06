create table etf_funds (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  name text not null,
  description text,
  strategy text,
  inception_date date not null default current_date,
  base_nav numeric(12,4) default 100.0000,
  status text default 'active' check (status in ('active', 'paused', 'closed')),
  created_by text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table etf_holdings (
  id uuid default gen_random_uuid() primary key,
  fund_id uuid not null references etf_funds(id) on delete cascade,
  symbol text not null,
  name text not null,
  domain text,
  sector text,
  weight numeric(6,4) not null check (weight > 0 and weight <= 1),
  added_at timestamptz default now(),
  unique(fund_id, symbol)
);

create table etf_prices (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  date date not null,
  close_price numeric(12,4) not null,
  change_pct numeric(8,4),
  fetched_at timestamptz default now(),
  unique(symbol, date)
);

create table etf_performance (
  id uuid default gen_random_uuid() primary key,
  fund_id uuid not null references etf_funds(id) on delete cascade,
  date date not null,
  nav numeric(12,4) not null,
  daily_return numeric(8,6),
  cumulative_return numeric(10,6),
  holdings_snapshot jsonb default '[]',
  calculated_at timestamptz default now(),
  unique(fund_id, date)
);

alter table etf_funds enable row level security;
alter table etf_holdings enable row level security;
alter table etf_prices enable row level security;
alter table etf_performance enable row level security;

create policy "Public read etf_funds" on etf_funds for select using (true);
create policy "Staff insert etf_funds" on etf_funds for insert with check (true);
create policy "Staff update etf_funds" on etf_funds for update using (true);

create policy "Public read etf_holdings" on etf_holdings for select using (true);
create policy "Staff insert etf_holdings" on etf_holdings for insert with check (true);
create policy "Staff update etf_holdings" on etf_holdings for update using (true);
create policy "Staff delete etf_holdings" on etf_holdings for delete using (true);

create policy "Public read etf_prices" on etf_prices for select using (true);
create policy "Staff insert etf_prices" on etf_prices for insert with check (true);
create policy "Staff update etf_prices" on etf_prices for update using (true);

create policy "Public read etf_performance" on etf_performance for select using (true);
create policy "Staff insert etf_performance" on etf_performance for insert with check (true);

create index idx_etf_holdings_fund on etf_holdings (fund_id);
create index idx_etf_prices_symbol_date on etf_prices (symbol, date desc);
create index idx_etf_performance_fund_date on etf_performance (fund_id, date desc);
create index idx_etf_funds_ticker on etf_funds (ticker);