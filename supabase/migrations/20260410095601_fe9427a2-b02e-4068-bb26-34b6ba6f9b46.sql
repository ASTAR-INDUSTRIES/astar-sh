create table projects (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  name text not null,
  description text,
  visibility text not null default 'team' check (visibility in ('private', 'team', 'public')),
  owner text not null,
  members text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;

create or replace function public.can_view_project(
  project_visibility text,
  project_owner text,
  project_members text[]
) returns boolean
language sql
stable
as $$
  select case
    when auth.role() <> 'authenticated' then false
    when project_visibility = 'public' then coalesce(auth.jwt() ->> 'email', '') like '%@astarconsulting.no'
    when project_visibility = 'team' then (
      coalesce(auth.jwt() ->> 'email', '') = project_owner
      or coalesce(auth.jwt() ->> 'email', '') = any(coalesce(project_members, '{}'::text[]))
    )
    when project_visibility = 'private' then coalesce(auth.jwt() ->> 'email', '') = project_owner
    else false
  end
$$;

create or replace function public.can_view_project_by_id(project_ref uuid) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_ref
      and public.can_view_project(p.visibility, p.owner, p.members)
  )
$$;

create or replace function public.can_view_task_record(
  task_project_id uuid,
  task_visibility text,
  task_created_by text,
  task_assigned_to text
) returns boolean
language sql
stable
as $$
  select case
    when auth.role() <> 'authenticated' then false
    when task_visibility = 'private' then (
      coalesce(auth.jwt() ->> 'email', '') = task_created_by
      or coalesce(auth.jwt() ->> 'email', '') = coalesce(task_assigned_to, '')
    )
    when task_project_id is not null and task_visibility in ('public', 'team') then public.can_view_project_by_id(task_project_id)
    when task_visibility = 'public' then coalesce(auth.jwt() ->> 'email', '') like '%@astarconsulting.no'
    when task_visibility = 'team' then auth.role() = 'authenticated'
    else false
  end
$$;

create or replace function public.can_view_event_record(
  event_project_id uuid,
  event_visibility text,
  event_created_by text
) returns boolean
language sql
stable
as $$
  select case
    when auth.role() <> 'authenticated' then false
    when event_visibility = 'private' then coalesce(auth.jwt() ->> 'email', '') = event_created_by
    when event_project_id is not null and event_visibility in ('public', 'team') then public.can_view_project_by_id(event_project_id)
    when event_visibility = 'public' then coalesce(auth.jwt() ->> 'email', '') like '%@astarconsulting.no'
    when event_visibility = 'team' then auth.role() = 'authenticated'
    else false
  end
$$;

create policy "Project read" on projects
  for select
  to authenticated
  using (public.can_view_project(visibility, owner, members));

create policy "Project insert" on projects
  for insert
  to authenticated
  with check (coalesce(auth.jwt() ->> 'email', '') like '%@astarconsulting.no');

create policy "Project update" on projects
  for update
  to authenticated
  using (owner = coalesce(auth.jwt() ->> 'email', ''))
  with check (owner = coalesce(auth.jwt() ->> 'email', ''));

alter table tasks add column if not exists project_id uuid references projects(id) on delete set null;
alter table events add column if not exists project_id uuid references projects(id) on delete set null;
alter table milestones add column if not exists project_id uuid references projects(id) on delete set null;
alter table agents add column if not exists project_id uuid references projects(id) on delete set null;
alter table audit_events add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists idx_projects_slug on projects (slug);
create index if not exists idx_projects_owner on projects (owner);
create index if not exists idx_projects_visibility on projects (visibility);
create index if not exists idx_tasks_project_id on tasks (project_id) where project_id is not null;
create index if not exists idx_events_project_id on events (project_id) where project_id is not null;
create index if not exists idx_milestones_project_id on milestones (project_id) where project_id is not null;
create index if not exists idx_agents_project_id on agents (project_id) where project_id is not null;
create index if not exists idx_audit_project_id on audit_events (project_id) where project_id is not null;

drop policy if exists "Event read" on public.events;

create policy "Event read" on public.events
  for select
  to authenticated
  using (public.can_view_event_record(project_id, visibility, created_by));

drop policy if exists "Staff can view tasks" on public.tasks;
drop policy if exists "Anon can select tasks" on public.tasks;

create policy "Task read" on public.tasks
  for select
  to authenticated
  using (public.can_view_task_record(project_id, visibility, created_by, assigned_to));

drop policy if exists "Milestones are viewable by everyone" on public.milestones;

create policy "Milestone read" on public.milestones
  for select
  to authenticated
  using (
    project_id is null
    or public.can_view_project_by_id(project_id)
  );

drop policy if exists "Agents are publicly readable" on public.agents;

create policy "Agent read" on public.agents
  for select
  to authenticated
  using (
    project_id is null
    or public.can_view_project_by_id(project_id)
  );

drop policy if exists "Audit events are viewable by everyone" on public.audit_events;

create policy "Scoped audit read" on public.audit_events
  for select
  to authenticated
  using (
    actor_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1
      from public.agents a
      where a.slug = audit_events.actor_agent_id
        and a.owner = coalesce(auth.jwt() ->> 'email', '')
    )
    or (
      project_id is not null
      and public.can_view_project_by_id(project_id)
    )
  );

drop policy if exists "Anon can select task activity" on public.task_activity;
drop policy if exists "Staff can view task activity" on public.task_activity;

create policy "Activity visible via accessible task" on public.task_activity
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_activity.task_id
        and public.can_view_task_record(t.project_id, t.visibility, t.created_by, t.assigned_to)
    )
  );

drop policy if exists "Anon can select task links" on public.task_links;
drop policy if exists "Staff can view task links" on public.task_links;

create policy "Links visible via accessible task" on public.task_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_links.task_id
        and public.can_view_task_record(t.project_id, t.visibility, t.created_by, t.assigned_to)
    )
  );
