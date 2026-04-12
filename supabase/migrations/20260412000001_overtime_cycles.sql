create table overtime_cycles (
  id uuid default gen_random_uuid() primary key,
  run_id uuid not null references overtime_runs(id) on delete cascade,
  agent text not null check (agent in ('u', 'e')),
  cycle_number integer not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  exit_code integer,
  subtask_number integer,
  action_taken text check (action_taken in ('implemented', 'reviewed', 'approved', 'rejected', 'idle')),
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(10, 6),
  model text,
  tool_calls_count integer,
  turns_used integer,
  max_turns integer
);

alter table overtime_cycles enable row level security;
create policy "Authenticated read" on overtime_cycles for select to authenticated using (true);
create policy "Authenticated write" on overtime_cycles for all to authenticated using (true);

create index idx_overtime_cycles_run_id on overtime_cycles (run_id);
create index idx_overtime_cycles_agent on overtime_cycles (run_id, agent);
create index idx_overtime_cycles_started_at on overtime_cycles (started_at desc);
create index idx_overtime_cycles_subtask on overtime_cycles (subtask_number) where subtask_number is not null;
