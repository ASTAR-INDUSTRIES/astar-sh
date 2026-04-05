alter table tasks add column visibility text default 'private'
  check (visibility in ('private', 'team', 'public'));

update tasks set visibility = 'private' where visibility is null;

drop policy "Public read" on tasks;

create policy "Owner read" on tasks for select using (
  visibility = 'public'
  or (visibility = 'team' and auth.role() = 'authenticated')
  or (visibility = 'private' and (
    created_by = auth.jwt()->>'email'
    or assigned_to = auth.jwt()->>'email'
  ))
);

drop policy "Public read" on task_activity;
create policy "Activity visible via task" on task_activity for select using (
  exists (
    select 1 from tasks t where t.id = task_activity.task_id
  )
);

drop policy "Public read" on task_links;
create policy "Links visible via task" on task_links for select using (
  exists (
    select 1 from tasks t where t.id = task_links.task_id
  )
);

create index idx_tasks_visibility on tasks (visibility);
