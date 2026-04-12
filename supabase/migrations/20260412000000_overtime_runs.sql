create table overtime_runs (
  id uuid default gen_random_uuid() primary key,
  slug text not null,
  spec_title text not null,
  type text not null default 'dev',
  parent_task_number integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'stopped')),
  total_cycles_u integer not null default 0,
  total_cycles_e integer not null default 0,
  total_rejections integer not null default 0,
  total_cost_usd numeric(10, 6),
  model text,
  worktree_path text,
  branch_name text,
  git_commits text[] not null default '{}',
  created_by text
);

alter table overtime_runs enable row level security;
create policy "Authenticated read" on overtime_runs for select to authenticated using (true);
create policy "Authenticated write" on overtime_runs for all to authenticated using (true);

create index idx_overtime_runs_slug on overtime_runs (slug);
create index idx_overtime_runs_status on overtime_runs (status);
create index idx_overtime_runs_started_at on overtime_runs (started_at desc);
create index idx_overtime_runs_parent_task on overtime_runs (parent_task_number) where parent_task_number is not null;
