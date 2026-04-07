drop policy if exists "Public read" on public.feedback;

create policy "Staff can read feedback" on public.feedback
  for select
  to authenticated
  using ((select (auth.jwt() ->> 'email')) like '%@astarconsulting.no');

drop policy if exists "Public read" on public.audit_events;

create policy "Owners can read audit events" on public.audit_events
  for select
  to authenticated
  using (
    actor_email = (select auth.jwt() ->> 'email')
    or exists (
      select 1
      from public.agents a
      where a.slug = audit_events.actor_agent_id
        and a.owner = (select auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Activity visible via task" on public.task_activity;

create policy "Activity visible via accessible task" on public.task_activity
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_activity.task_id
        and (
          t.visibility in ('public', 'team')
          or t.created_by = (select auth.jwt() ->> 'email')
          or t.assigned_to = (select auth.jwt() ->> 'email')
        )
    )
  );

drop policy if exists "Links visible via task" on public.task_links;

create policy "Links visible via accessible task" on public.task_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_links.task_id
        and (
          t.visibility in ('public', 'team')
          or t.created_by = (select auth.jwt() ->> 'email')
          or t.assigned_to = (select auth.jwt() ->> 'email')
        )
    )
  );
