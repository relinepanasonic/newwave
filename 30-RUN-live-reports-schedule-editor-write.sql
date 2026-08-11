-- ── Fix: host_manager can't save Reconciliation edits/inserts on live_reports ──
-- Reconciliation ("Recap Schedule" > CSV Rekonsiliasi) is accessible to both
-- superadmin and host_manager (see src/app/recap-schedule/page.tsx's
-- AuthGuard), and its whole purpose is letting an admin fix mismatched
-- reports or backfill missing ones for ANY host -- not just their own.
--
-- But live_reports only ever had two write paths:
--   - "host update own report" / "reports_host_insert": auth.uid() = host_id
--     (a host editing/filing their own report)
--   - "admin all live_reports": is_superadmin() (full access)
-- host_manager falls into neither when editing/creating a report for a
-- DIFFERENT host (the normal case in Reconciliation), so Supabase silently
-- updates/inserts 0 rows -- the UI's error text is easy to miss, so it just
-- looks like "I edited it and it didn't save."
--
-- Trying to fix this by reusing is_schedule_editor() (defined in
-- 15-RUN-new-roles.sql for this exact superadmin-OR-host_manager pattern,
-- already used by schedule_slots' write policy) surfaced that the function
-- doesn't actually exist in this database -- meaning 15-RUN-new-roles.sql's
-- statements never persisted (Supabase's SQL Editor runs a pasted script as
-- one transaction; if any later statement in it failed, everything in that
-- run rolls back, including CREATE FUNCTION statements that appeared to
-- succeed earlier in the same paste). That means schedule_slots' own
-- "slots_admin_write" policy for host_manager has likely never actually
-- existed either.
--
-- This file is fully self-contained (redefines both helper functions and
-- recreates every policy that depends on them) so it doesn't matter what
-- state 15-RUN-new-roles.sql is actually in. Run in Supabase SQL Editor.
-- Every statement is CREATE OR REPLACE / DROP+CREATE, so it's safe to re-run.

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

-- schedule_slots: host_manager can write (this is what 15-RUN-new-roles.sql
-- intended -- recreated here since that migration apparently never persisted.
DROP POLICY IF EXISTS "slots_admin_write" ON public.schedule_slots;
CREATE POLICY "slots_admin_write" ON public.schedule_slots
  FOR ALL USING (public.is_schedule_editor());

-- live_reports: a host (or host_manager filing on someone's behalf) inserting
-- their own report -- also from 15-RUN-new-roles.sql, recreated for the same reason.
DROP POLICY IF EXISTS "reports_host_insert" ON public.live_reports;
CREATE POLICY "reports_host_insert" ON public.live_reports
  FOR INSERT WITH CHECK (host_id = auth.uid() AND public.is_host_like());

-- live_reports: the actual fix -- host_manager (or superadmin) can read/
-- insert/update/delete ANY report, not just their own, matching what
-- Reconciliation needs to do for every host's data.
DROP POLICY IF EXISTS "schedule_editor_all live_reports" ON public.live_reports;
CREATE POLICY "schedule_editor_all live_reports"
  ON public.live_reports FOR ALL
  USING (public.is_schedule_editor())
  WITH CHECK (public.is_schedule_editor());
