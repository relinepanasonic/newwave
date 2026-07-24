-- ── Payroll: per-period manual adjustments ──────────────────────────────────
-- Tunjangan (allowance) + Bonus are added to a host's Gaji Aktual; Bayar
-- Kasbon (kasbon repayment this cycle) + Pinalti (penalty) are deducted.
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  period_start  date NOT NULL,
  tunjangan     numeric(12,0) NOT NULL DEFAULT 0,
  bonus         numeric(12,0) NOT NULL DEFAULT 0,
  kasbon_dibayar numeric(12,0) NOT NULL DEFAULT 0,
  pinalti       numeric(12,0) NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (host_id, period_start)
);

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_adjustments superadmin all" ON public.payroll_adjustments;
CREATE POLICY "payroll_adjustments superadmin all"
  ON public.payroll_adjustments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE OR REPLACE FUNCTION public.payroll_adjustments_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS payroll_adjustments_updated_at ON public.payroll_adjustments;
CREATE TRIGGER payroll_adjustments_updated_at
  BEFORE UPDATE ON public.payroll_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.payroll_adjustments_touch_updated_at();
