-- Subtasks
alter table tasks add column parent_task_id uuid references tasks(id);
create index idx_tasks_parent on tasks (parent_task_id) where parent_task_id is not null;

-- Agent triage
alter table tasks add column confidence float;
alter table tasks add column requires_triage boolean default false;

-- Recurring
alter table tasks add column recurring jsonb;

-- Estimated hours
alter table tasks add column estimated_hours numeric;

-- Polymorphic links
create table task_links (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade,
  link_type text not null check (link_type in ('skill', 'news', 'feedback', 'url', 'milestone', 'task')),
  link_ref text not null,
  created_at timestamptz default now()
);

alter table task_links enable row level security;
create policy "Public read" on task_links for select using (true);
create policy "Authenticated insert" on task_links for insert to authenticated with check (true);
create policy "Authenticated delete" on task_links for delete to authenticated using (true);
create index idx_task_links_task on task_links (task_id);
