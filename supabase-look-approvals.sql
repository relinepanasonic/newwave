-- ============================================================
-- Run this in Supabase SQL Editor.
-- Pra-Live "Look Approval": host uploads a makeup/look photo and
-- picks the brand (from today's schedule) before going live.
-- ============================================================

create table if not exists public.look_approvals (
  id             uuid default gen_random_uuid() primary key,
  host_id        uuid references public.profiles(id) on delete cascade not null,
  slot_id        uuid references public.schedule_slots(id) on delete set null,
  approval_date  date not null default current_date,
  brand          text,
  photo_url      text,
  status         text default 'submitted',   -- 'submitted' | 'approved' | 'rejected'
  notes          text,
  created_at     timestamptz default now()
);

create index if not exists look_approvals_host_idx on public.look_approvals (host_id, approval_date);

alter table public.look_approvals enable row level security;

create policy "look read authenticated"
  on public.look_approvals for select
  using (auth.role() = 'authenticated');

create policy "look host insert own"
  on public.look_approvals for insert
  with check (auth.uid() = host_id);

create policy "look superadmin all"
  on public.look_approvals for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));

-- Storage bucket for the look photos (public url, like live-reports)
insert into storage.buckets (id, name, public)
values ('look-approvals', 'look-approvals', true)
on conflict (id) do update set public = true;

drop policy if exists "public read look" on storage.objects;
create policy "public read look"
  on storage.objects for select
  using (bucket_id = 'look-approvals');

drop policy if exists "auth upload look" on storage.objects;
create policy "auth upload look"
  on storage.objects for insert
  with check (bucket_id = 'look-approvals' and auth.role() = 'authenticated');
