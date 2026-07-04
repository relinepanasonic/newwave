-- ── New roles: operator & host_manager ──────────────────────────────────────
-- Run in Supabase SQL Editor. Safe to re-run.

-- 1. Ensure the is_superadmin() helper exists (from supabase-fix-rls.sql)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin');
$$;

-- 2. Helper functions for new roles
CREATE OR REPLACE FUNCTION public.is_schedule_editor()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'host_manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_host_like()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('host', 'host_manager')
  );
$$;

-- 3. schedule_slots: allow host_manager to write (operator read is already covered by slots_read)
DROP POLICY IF EXISTS "slots_admin_write" ON public.schedule_slots;
CREATE POLICY "slots_admin_write" ON public.schedule_slots
  FOR ALL USING (public.is_schedule_editor());

-- 4. look_approval API: also allow host_manager (already handled server-side)

-- 5. live_reports: host_manager can insert/read own (same as host)
DROP POLICY IF EXISTS "reports_host_insert" ON public.live_reports;
CREATE POLICY "reports_host_insert" ON public.live_reports
  FOR INSERT WITH CHECK (host_id = auth.uid() AND public.is_host_like());

-- 6. check_ins: operator & host_manager own records
DROP POLICY IF EXISTS "checkins_operator_insert" ON public.check_ins;
CREATE POLICY "checkins_operator_insert" ON public.check_ins
  FOR INSERT WITH CHECK (host_id = auth.uid());

-- 7. Set Anggi as host_manager
UPDATE public.profiles
SET role = 'host_manager'
WHERE full_name ILIKE 'Anggi%' AND role = 'host';

-- Verify
SELECT id, full_name, role FROM public.profiles WHERE role IN ('operator', 'host_manager');
