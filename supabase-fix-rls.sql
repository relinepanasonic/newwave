-- ============================================================
-- FIX: Infinite recursion in profiles RLS policies
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Drop the recursive policies
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

-- 2. Create a SECURITY DEFINER helper that bypasses RLS (breaks the loop)
create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

-- 3. Recreate profiles policies WITHOUT recursion
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() = id or public.is_superadmin()
  );

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles_admin_all" on public.profiles
  for all using (public.is_superadmin());

-- 4. Fix the other tables' policies to use the helper too (cleaner + faster)
drop policy if exists "rooms_admin_write" on public.rooms;
create policy "rooms_admin_write" on public.rooms
  for all using (public.is_superadmin());

drop policy if exists "slots_admin_write" on public.schedule_slots;
create policy "slots_admin_write" on public.schedule_slots
  for all using (public.is_superadmin());

drop policy if exists "checkins_own" on public.check_ins;
create policy "checkins_own" on public.check_ins
  for select using (host_id = auth.uid() or public.is_superadmin());

drop policy if exists "checkins_update_own" on public.check_ins;
create policy "checkins_update_own" on public.check_ins
  for update using (host_id = auth.uid() or public.is_superadmin());

drop policy if exists "checkins_admin" on public.check_ins;
create policy "checkins_admin" on public.check_ins
  for all using (public.is_superadmin());
