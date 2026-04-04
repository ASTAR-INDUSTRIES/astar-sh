create table agents (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  name text not null,
  email text,
  role text,
  owner text not null,
  skill_slug text,
  scopes text[] default '{}',
  status text default 'active' check (status in ('active', 'paused', 'retired')),
  machine text,
  config jsonb default '{}',
  last_seen timestamptz,
  created_at timestamptz default now()
);

alter table agents enable row level security;
create policy "Public read" on agents for select using (true);
create policy "Authenticated write" on agents for all to authenticated using (true);
create index idx_agents_slug on agents (slug);
create index idx_agents_status on agents (status);
