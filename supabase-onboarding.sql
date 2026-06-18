-- ============================================================
-- Run this in Supabase SQL Editor
-- Adds: onboarding_invites table + new profile columns + KTP storage
-- ============================================================

-- 1. Add new columns to profiles
alter table public.profiles add column if not exists alamat text;
alter table public.profiles add column if not exists nik_id text;
alter table public.profiles add column if not exists ktp_photo_url text;
alter table public.profiles add column if not exists tipe_host text;
alter table public.profiles add column if not exists target_hours integer default 155;

-- 2. Create onboarding_invites table
create table if not exists public.onboarding_invites (
  id            uuid default gen_random_uuid() primary key,
  token         text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz default now(),
  expires_at    timestamptz default (now() + interval '30 days'),
  name          text not null,
  tipe_host     text,
  target_hours  integer default 155,
  hourly_rate   integer default 0,
  status        text default 'pending',   -- 'pending' | 'completed'
  used_at       timestamptz,
  host_id       uuid references public.profiles(id)
);

-- 3. RLS
alter table public.onboarding_invites enable row level security;

create policy "superadmin manage invites"
  on public.onboarding_invites for all
  using (is_superadmin());

-- Host reads their own completed invite
create policy "host view own invite"
  on public.onboarding_invites for select
  using (auth.uid() = host_id);

-- Anyone can read a pending invite by token (for the public onboard page)
create policy "public read pending invite"
  on public.onboarding_invites for select
  using (status = 'pending');

-- 4. KTP photo storage bucket (private - for admin verification)
insert into storage.buckets (id, name, public)
values ('ktp-photos', 'ktp-photos', false)
on conflict (id) do nothing;

-- Only admins can read KTP photos
create policy "admin view ktp"
  on storage.objects for select
  using (bucket_id = 'ktp-photos' and is_superadmin());

-- Service role uploads (via API route using admin key)
-- No insert policy needed for public — API route uses service role key
