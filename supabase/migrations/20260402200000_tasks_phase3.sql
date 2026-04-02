alter table tasks add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;

create index idx_tasks_search on tasks using gin(search_vector);
