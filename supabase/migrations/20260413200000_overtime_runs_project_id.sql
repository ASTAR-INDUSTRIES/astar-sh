-- Add project_id FK to overtime_runs so runs can be scoped to a project.
alter table public.overtime_runs
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists idx_overtime_runs_project_id
  on public.overtime_runs (project_id)
  where project_id is not null;

notify pgrst, 'reload schema';
