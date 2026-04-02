create sequence task_number_seq;

create table tasks (
  id uuid default gen_random_uuid() primary key,
  task_number int default nextval('task_number_seq') unique,
  title text not null,
  description text,
  status text default 'open' check (status in ('open', 'in_progress', 'completed', 'blocked', 'cancelled')),
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  created_by text not null,
  assigned_to text,
  completed_by text,
  due_date date,
  completed_at timestamptz,
  source text default 'human' check (source in ('human', 'agent', 'feedback', 'system')),
  tags text[] default '{}',
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table task_activity (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade,
  actor text not null,
  actor_type text default 'human' check (actor_type in ('human', 'agent', 'system')),
  action text not null,
  details jsonb default '{}',
  created_at timestamptz default now()
);

alter table tasks enable row level security;
alter table task_activity enable row level security;

create policy "Public read" on tasks for select using (true);
create policy "Authenticated insert" on tasks for insert to authenticated with check (true);
create policy "Authenticated update" on tasks for update to authenticated using (true);

create policy "Public read" on task_activity for select using (true);
create policy "Authenticated insert" on task_activity for insert to authenticated with check (true);

create index idx_tasks_status on tasks (status) where archived_at is null;
create index idx_tasks_assigned on tasks (assigned_to);
create index idx_tasks_created_by on tasks (created_by);
create index idx_tasks_due_date on tasks (due_date) where due_date is not null;
create index idx_task_activity_task_id on task_activity (task_id);
