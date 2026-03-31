create table milestones (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date date not null,
  category text default 'general',
  created_at timestamptz default now(),
  created_by text
);

alter table milestones enable row level security;

create policy "Public read" on milestones for select using (true);
create policy "Authenticated insert" on milestones for insert to authenticated with check (true);
create policy "Authenticated delete" on milestones for delete to authenticated using (true);
create policy "Authenticated update" on milestones for update to authenticated using (true);
