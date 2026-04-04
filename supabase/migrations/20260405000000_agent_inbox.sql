insert into agents (slug, name, owner)
values ('cfa', 'Chief Financial Agent', 'erik@astarconsulting.no')
on conflict (slug) do nothing;

create table agent_inbox (
  id uuid default gen_random_uuid() primary key,
  agent_slug text not null references agents(slug),
  type text default 'question' check (type in ('action', 'question', 'review')),
  content text not null,
  author_email text not null,
  author_name text,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  response text,
  locked_by text,
  locked_at timestamptz,
  processed_by text,
  processed_at timestamptz,
  delivery_channel text default 'cli',
  created_at timestamptz default now()
);

alter table agent_inbox enable row level security;
create policy "Public read" on agent_inbox for select using (true);
create policy "Authenticated insert" on agent_inbox for insert to authenticated with check (true);
create policy "Authenticated update" on agent_inbox for update to authenticated using (true);

create index idx_inbox_agent on agent_inbox (agent_slug, status);
create index idx_inbox_author on agent_inbox (author_email);
create index idx_inbox_pending on agent_inbox (agent_slug, status) where status = 'pending';

insert into agent_inbox (id, agent_slug, type, content, author_email, author_name, status, response, locked_by, locked_at, processed_by, processed_at, delivery_channel, created_at)
select id, 'cfa',
  case type when 'log_hours' then 'action' when 'expense' then 'action' else 'question' end,
  content, author_email, author_name, status, response, locked_by, locked_at, processed_by, processed_at, delivery_channel, created_at
from financial_inquiries;
