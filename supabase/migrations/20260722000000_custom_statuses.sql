-- Custom per-user statuses
create table if not exists public.custom_statuses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now()
);

alter table public.custom_statuses enable row level security;

create policy "Users manage own custom statuses"
  on public.custom_statuses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow admins (service role) to read all custom statuses for the admin view
create policy "Service role full access"
  on public.custom_statuses
  for all
  using (auth.role() = 'service_role');

-- Add custom_status_id to companies (nullable — only set when using a custom status)
alter table public.companies
  add column if not exists custom_status_id uuid references public.custom_statuses(id) on delete set null;
