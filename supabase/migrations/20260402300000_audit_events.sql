create table audit_events (
  id uuid default gen_random_uuid() primary key,
  timestamp timestamptz default now(),

  actor_email text,
  actor_name text,
  actor_type text default 'human' check (actor_type in ('human', 'agent', 'system')),
  actor_agent_id text,

  entity_type text not null,
  entity_id text,
  action text not null,
  state_before jsonb,
  state_after jsonb,

  channel text check (channel in ('cli', 'mcp', 'api', 'dashboard', 'system')),
  raw_input jsonb,

  context jsonb default '{}'
);

alter table audit_events enable row level security;
create policy "Public read" on audit_events for select using (true);
create policy "Service insert" on audit_events for insert to authenticated with check (true);

create index idx_audit_timestamp on audit_events (timestamp desc);
create index idx_audit_entity on audit_events (entity_type, entity_id);
create index idx_audit_actor on audit_events (actor_email);
create index idx_audit_actor_agent on audit_events (actor_agent_id) where actor_agent_id is not null;
create index idx_audit_channel on audit_events (channel);

create or replace view cli_events_view as
  select
    id,
    timestamp as created_at,
    action as event_type,
    case when entity_type = 'skill' then entity_id else null end as skill_slug,
    (state_after->>'title')::text as skill_title,
    actor_email as user_email,
    actor_name as user_name,
    coalesce(raw_input, context) as metadata
  from audit_events;

create or replace view task_activity_view as
  select
    id,
    (context->>'task_uuid')::uuid as task_id,
    actor_email as actor,
    actor_type,
    action,
    coalesce(state_after, '{}') as details,
    timestamp as created_at
  from audit_events
  where entity_type = 'task';
