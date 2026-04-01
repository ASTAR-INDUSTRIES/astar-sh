create table feedback (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  type text default 'feature' check (type in ('bug', 'feature', 'pain', 'praise')),
  source text default 'human' check (source in ('human', 'agent')),
  author_email text not null,
  author_name text,
  linked_skill text,
  linked_news text,
  context jsonb default '{}',
  status text default 'new' check (status in ('new', 'accepted', 'rejected', 'done')),
  created_at timestamptz default now()
);

alter table feedback enable row level security;

create policy "Public read" on feedback for select using (true);
create policy "Authenticated insert" on feedback for insert to authenticated with check (true);
create policy "Authenticated update" on feedback for update to authenticated using (true);
