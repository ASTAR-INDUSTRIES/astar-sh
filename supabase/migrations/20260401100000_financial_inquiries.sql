create table financial_inquiries (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('log_hours', 'question', 'expense')),
  content text not null,
  author_email text not null,
  author_name text,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  response text,
  locked_by text,
  locked_at timestamptz,
  processed_by text,
  processed_at timestamptz,
  delivery_channel text default 'cli',
  created_at timestamptz default now()
);

alter table financial_inquiries enable row level security;

create policy "Public read" on financial_inquiries for select using (true);
create policy "Authenticated insert" on financial_inquiries for insert to authenticated with check (true);
create policy "Authenticated update" on financial_inquiries for update to authenticated using (true);

create index idx_inquiries_pending on financial_inquiries (status) where status = 'pending';
create index idx_inquiries_author on financial_inquiries (author_email);
