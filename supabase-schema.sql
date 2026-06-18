-- ============================================================
-- NEW WAVE LIVE SPECIALIST — Database Schema
-- Run this in Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- 1. PROFILES (extends Supabase Auth users)
-- ─────────────────────────────────────────
create table public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  full_name     text not null,
  role          text not null check (role in ('superadmin','host','client')),
  hourly_rate   numeric(10,2) default 0,       -- only used if role = 'host'
  phone         text,
  avatar_url    text,
  is_active     boolean default true,
  client_brand  text,                           -- only used if role = 'client'
  created_at    timestamptz default now()
);

alter table public.profiles enable row level security;

-- Superadmin sees all; host/client see only themselves
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
  );

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles_admin_all" on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
  );

-- ─────────────────────────────────────────
-- 2. ROOMS / LOCATIONS
-- ─────────────────────────────────────────
create table public.rooms (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,          -- e.g. "Puan 1", "PRJ"
  group_name  text not null,          -- "Jakarta Puan" | "Luar Puan"
  sort_order  int default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

alter table public.rooms enable row level security;
create policy "rooms_read_all" on public.rooms for select using (true);
create policy "rooms_admin_write" on public.rooms for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- Seed default rooms
insert into public.rooms (name, group_name, sort_order) values
  ('Puan 1', 'Jakarta Puan', 1),
  ('Puan 2', 'Jakarta Puan', 2),
  ('Puan 3', 'Jakarta Puan', 3),
  ('Cawang',  'Luar Puan',   4),
  ('PRJ',     'Luar Puan',   5),
  ('Room 3',  'Luar Puan',   6);

-- ─────────────────────────────────────────
-- 3. SCHEDULE SLOTS
-- ─────────────────────────────────────────
create table public.schedule_slots (
  id          uuid primary key default uuid_generate_v4(),
  slot_date   date not null,
  session_no  int not null check (session_no between 1 and 24),  -- 1=00-01, 24=23-24
  room_id     uuid references public.rooms not null,
  host_id     uuid references public.profiles,
  brand       text,
  platform    text check (platform in ('Shopee','TikTok','Instagram','YouTube','Other')),
  konsep      text,
  status      text default 'scheduled' check (status in ('scheduled','live','done','cancelled')),
  notes       text,
  created_by  uuid references public.profiles,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(slot_date, session_no, room_id)
);

alter table public.schedule_slots enable row level security;

-- All authenticated users can read; only admins write
create policy "slots_read" on public.schedule_slots
  for select using (auth.uid() is not null);

create policy "slots_admin_write" on public.schedule_slots for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- ─────────────────────────────────────────
-- 4. CHECK-INS (actual clock in/out)
-- ─────────────────────────────────────────
create table public.check_ins (
  id           uuid primary key default uuid_generate_v4(),
  slot_id      uuid references public.schedule_slots on delete cascade,
  host_id      uuid references public.profiles not null,
  clock_in     timestamptz,
  clock_out    timestamptz,
  total_hours  numeric(5,2) generated always as (
                 case when clock_in is not null and clock_out is not null
                 then round(extract(epoch from (clock_out - clock_in)) / 3600.0, 2)
                 else null end
               ) stored,
  notes        text,
  created_at   timestamptz default now()
);

alter table public.check_ins enable row level security;

create policy "checkins_own" on public.check_ins
  for select using (host_id = auth.uid() or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

create policy "checkins_insert_own" on public.check_ins
  for insert with check (host_id = auth.uid());

create policy "checkins_update_own" on public.check_ins
  for update using (host_id = auth.uid() or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

create policy "checkins_admin" on public.check_ins for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- ─────────────────────────────────────────
-- 5. PAYROLL VIEW (21st-to-20th periods)
-- ─────────────────────────────────────────
create or replace view public.payroll_summary as
select
  p.id as host_id,
  p.full_name,
  p.hourly_rate,
  -- Salary period: 21st of prev month to 20th of current month
  case
    when extract(day from c.clock_in) >= 21
    then date_trunc('month', c.clock_in)::date
    else (date_trunc('month', c.clock_in) - interval '1 month')::date
  end as period_start,
  sum(c.total_hours) as total_hours,
  sum(c.total_hours) * p.hourly_rate as total_salary,
  count(*) as session_count
from public.check_ins c
join public.profiles p on p.id = c.host_id
where c.total_hours is not null
group by p.id, p.full_name, p.hourly_rate,
  case
    when extract(day from c.clock_in) >= 21
    then date_trunc('month', c.clock_in)::date
    else (date_trunc('month', c.clock_in) - interval '1 month')::date
  end;

-- ─────────────────────────────────────────
-- 6. AUTO-UPDATE updated_at on schedule_slots
-- ─────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger schedule_slots_updated_at
  before update on public.schedule_slots
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- 7. Auto-create profile on signup
-- ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'host')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
