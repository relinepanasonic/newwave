-- Client blackout hours: times a brand cannot go live on a given platform
create table if not exists public.client_blackouts (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null,
  platform    text,        -- null = all platforms
  day_of_week int[],       -- null = every day; 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  start_time  time not null,
  end_time    time not null,
  reason      text,
  created_at  timestamptz default now()
);

alter table public.client_blackouts enable row level security;

-- Superadmin can do everything
create policy "superadmin_all" on public.client_blackouts
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

-- All authenticated users can read (needed by schedule form validation)
create policy "authenticated_read" on public.client_blackouts
  for select using (auth.role() = 'authenticated');
