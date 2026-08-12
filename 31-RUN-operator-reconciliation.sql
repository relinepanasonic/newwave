-- ── Let operator run CSV Reconciliation ─────────────────────────────────────
-- Reconciliation (Recap Schedule) needs to read every host's live_reports and
-- schedule_slots, correct mismatched reports, and -- via "Tidak Lapor" /
-- "Buat Jadwal" -- insert missing reports and their schedule slots. Operator
-- previously had none of those rights, so without this the page would load
-- empty and every save would silently affect 0 rows.
--
-- Deliberately a superset of is_schedule_editor() rather than an edit to it:
-- is_schedule_editor() also guards schedule_slots' own write policy, and
-- widening that in place would have quietly granted operators full Schedule
-- editing as a side effect of a reconciliation change.
--
-- NOTE: this does grant operator delete rights on live_reports/schedule_slots
-- (RLS can't express "insert+update but not delete" in one FOR ALL policy),
-- which the "Report Duplikat" tab and Reconciliation's own Batalkan use.
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.is_reconciler()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'host_manager', 'operator')
  );
$$;

DROP POLICY IF EXISTS "reconciler_all live_reports" ON public.live_reports;
CREATE POLICY "reconciler_all live_reports"
  ON public.live_reports FOR ALL
  USING (public.is_reconciler())
  WITH CHECK (public.is_reconciler());

-- Needed for "Buat Jadwal", which creates the schedule_slot before attaching
-- the CSV's numbers to it as a live_report.
DROP POLICY IF EXISTS "reconciler_all schedule_slots" ON public.schedule_slots;
CREATE POLICY "reconciler_all schedule_slots"
  ON public.schedule_slots FOR ALL
  USING (public.is_reconciler())
  WITH CHECK (public.is_reconciler());

-- Reconciliation resolves CSV host names against profiles, and reads the
-- rooms list to place a created slot.
DROP POLICY IF EXISTS "reconciler_read profiles" ON public.profiles;
CREATE POLICY "reconciler_read profiles"
  ON public.profiles FOR SELECT
  USING (public.is_reconciler());

DROP POLICY IF EXISTS "reconciler_read rooms" ON public.rooms;
CREATE POLICY "reconciler_read rooms"
  ON public.rooms FOR SELECT
  USING (public.is_reconciler());
