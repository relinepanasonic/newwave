-- ── Accounting: Expenses ledger ──────────────────────────────────────────
-- Fed either manually (superadmin, in-app) or pushed in by external apps via
-- POST /api/accounting/expenses (see that route for the payload shape).
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.expenses (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date           date NOT NULL,
  category       text NOT NULL,
  amount         numeric(14,0) NOT NULL DEFAULT 0,
  description    text,
  vendor         text,
  payment_method text,
  brand          text,           -- optional: ties an expense to a client brand
  receipt_url    text,
  source         text NOT NULL DEFAULT 'manual',  -- 'manual' or the pushing app's name
  external_id    text,           -- source system's own id, for idempotent pushes
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON public.expenses (date);
CREATE INDEX IF NOT EXISTS expenses_brand_idx ON public.expenses (brand);

-- One row per (source, external_id) so a retried push doesn't create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_external_id_key
  ON public.expenses (source, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses superadmin all" ON public.expenses;
CREATE POLICY "expenses superadmin all"
  ON public.expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- No policy for the push-in API: it uses the service-role key server-side
-- (gated by the ACCOUNTING_API_KEY bearer check in the route handler, not RLS).
