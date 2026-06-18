-- ============================================================
-- Run this in Supabase SQL Editor
-- Adds: live_reports table + storage bucket for screenshots
-- ============================================================

-- 1. Create live_reports table
create table if not exists public.live_reports (
  id              uuid default gen_random_uuid() primary key,
  created_at      timestamptz default now(),
  host_id         uuid references public.profiles(id) on delete cascade not null,
  slot_id         uuid references public.schedule_slots(id) on delete set null,
  report_date     date not null,
  brand           text,
  platform        text,
  start_time      text,
  duration_hours  numeric(4,1) default 0,
  gmv             bigint default 0,
  impression      integer default 0,
  viewer          integer default 0,
  trans           integer default 0,
  comment_count   integer default 0,
  screenshot_url  text,
  notes           text
);

-- 2. Enable RLS
alter table public.live_reports enable row level security;

-- 3. RLS Policies
create policy "host insert own report"
  on public.live_reports for insert
  with check (auth.uid() = host_id);

create policy "host view own report"
  on public.live_reports for select
  using (auth.uid() = host_id or is_superadmin());

create policy "host update own report"
  on public.live_reports for update
  using (auth.uid() = host_id);

create policy "admin all live_reports"
  on public.live_reports for all
  using (is_superadmin());

-- 4. Storage bucket for screenshots
insert into storage.buckets (id, name, public)
values ('live-reports', 'live-reports', true)
on conflict (id) do nothing;

-- 5. Storage policies
create policy "host upload screenshot"
  on storage.objects for insert
  with check (bucket_id = 'live-reports' and auth.role() = 'authenticated');

create policy "host update screenshot"
  on storage.objects for update
  using (bucket_id = 'live-reports' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "public read screenshot"
  on storage.objects for select
  using (bucket_id = 'live-reports');
