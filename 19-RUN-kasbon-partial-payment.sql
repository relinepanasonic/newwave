-- ── Kasbon: track partial payments made via payroll (Bayar Kasbon) ─────────
-- A single kasbon record can now be paid down incrementally across pay
-- periods. `paid_amount` accumulates; status flips to 'paid' once it covers
-- `amount`. payroll_kasbon_payments is the ledger recording which payroll
-- period paid how much against which kasbon record, so a period's "Bayar
-- Kasbon" figure can be edited and re-allocated without losing track of
-- prior periods' payments. Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.kasbon ADD COLUMN IF NOT EXISTS paid_amount numeric(12,0) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.payroll_kasbon_payments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  period_start date NOT NULL,
  kasbon_id    uuid REFERENCES public.kasbon(id) ON DELETE CASCADE NOT NULL,
  amount       numeric(12,0) NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.payroll_kasbon_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_kasbon_payments superadmin all" ON public.payroll_kasbon_payments;
CREATE POLICY "payroll_kasbon_payments superadmin all"
  ON public.payroll_kasbon_payments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
