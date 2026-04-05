-- Add visibility column to tasks
alter table tasks add column visibility text default 'private'
  check (visibility in ('private', 'team', 'public'));

-- Migrate existing tasks to private
update tasks set visibility = 'private' where visibility is null;

-- Drop old permissive read policy
drop policy "Public read" on tasks;

-- New RLS policies for tasks
-- Private: only creator and assignee can see
-- Team: all authenticated users can see
-- Public: everyone can see
create policy "Owner read" on tasks for select using (
  visibility = 'public'
  or (visibility = 'team' and auth.role() = 'authenticated')
  or (visibility = 'private' and (
    created_by = auth.jwt()->>'email'
    or assigned_to = auth.jwt()->>'email'
  ))
);

-- Keep existing insert/update policies as-is (they already require authenticated)

-- Also update task_activity visibility to match parent task
drop policy "Public read" on task_activity;
create policy "Activity visible via task" on task_activity for select using (
  exists (
    select 1 from tasks t where t.id = task_activity.task_id
  )
);

-- Update task_links RLS too
drop policy "Public read" on task_links;
create policy "Links visible via task" on task_links for select using (
  exists (
    select 1 from tasks t where t.id = task_links.task_id
  )
);

-- Index for visibility filtering
create index idx_tasks_visibility on tasks (visibility);
