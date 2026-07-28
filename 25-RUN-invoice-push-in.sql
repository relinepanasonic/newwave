-- ── Invoices: two-way sync with ProOne ───────────────────────────────────
-- New Wave already pushes invoices it creates OUT to ProOne. This adds the
-- other direction: source/external_id columns so ProOne (or any other app)
-- can push invoices IN via POST /api/accounting/invoices (see that route),
-- same idempotent-upsert pattern as the expenses push-in API.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'newwave';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS external_id text;

-- One row per (source, external_id) so a retried push doesn't create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_source_external_id_key
  ON public.invoices (source, external_id) WHERE external_id IS NOT NULL;
