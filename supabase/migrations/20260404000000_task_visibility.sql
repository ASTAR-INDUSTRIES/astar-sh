-- Add visibility column to tasks
alter table tasks
  add column visibility text not null default 'private'
  check (visibility in ('private', 'team', 'public'));

-- Drop the old blanket public-read policy
drop policy "Public read" on tasks;

-- Owner/assignee can always read their own tasks
create policy "Owner read" on tasks for select using (
  created_by = (current_setting('request.jwt.claims', true)::json ->> 'email')
  or assigned_to = (current_setting('request.jwt.claims', true)::json ->> 'email')
);

-- Authenticated users can read team + public tasks
create policy "Team read" on tasks for select to authenticated using (
  visibility in ('team', 'public')
);

-- Anonymous users can read public tasks
create policy "Public read" on tasks for select to anon using (
  visibility = 'public'
);

-- Index on visibility for efficient policy evaluation
create index idx_tasks_visibility on tasks (visibility);
