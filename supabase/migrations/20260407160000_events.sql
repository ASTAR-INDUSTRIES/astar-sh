create table events (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  title text not null,
  type text not null default 'attending' check (type in ('arranged', 'speaking', 'attending', 'podcast')),
  status text not null default 'tentative' check (status in ('tentative', 'confirmed', 'completed', 'cancelled')),
  goal text not null,
  date date,
  date_tentative boolean not null default false,
  location text,
  attendees jsonb not null default '[]'::jsonb,
  visibility text not null default 'team' check (visibility in ('private', 'team', 'public')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table events enable row level security;

create policy "Event read" on events for select using (
  visibility = 'public'
  or (visibility = 'team' and auth.role() = 'authenticated')
  or (visibility = 'private' and created_by = auth.jwt()->>'email')
);

create policy "Authenticated insert" on events for insert to authenticated with check (true);
create policy "Authenticated update" on events for update to authenticated using (created_by = auth.jwt()->>'email');

create index idx_events_slug on events (slug);
create index idx_events_status on events (status);
create index idx_events_date on events (date) where date is not null;
create index idx_events_created_by on events (created_by);

alter table tasks add column event_id uuid references events(id) on delete set null;
create index idx_tasks_event_id on tasks (event_id) where event_id is not null;
