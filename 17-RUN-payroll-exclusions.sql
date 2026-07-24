-- ── Payroll: per-period host exclusion ──────────────────────────────────────
-- Lets superadmin hide a host from a given pay period's Gaji table/export
-- (e.g. shouldn't be paid this cycle) without touching their schedule or
-- live reports. Run in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.payroll_exclusions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  period_start date NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (host_id, period_start)
);

ALTER TABLE public.payroll_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_exclusions superadmin all" ON public.payroll_exclusions;
CREATE POLICY "payroll_exclusions superadmin all"
  ON public.payroll_exclusions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
