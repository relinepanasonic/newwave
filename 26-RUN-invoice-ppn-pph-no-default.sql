-- ── Invoices: PPN/PPH default to 0, not 11%/2% ───────────────────────────
-- New Wave doesn't apply PPN or PPH by default. The column defaults (11 and
-- 2) were leaking through whenever the app's insert accidentally omitted the
-- field -- InvoicePanel.tsx and the push-in API both had that bug (fixed
-- alongside this migration), but the column defaults themselves were also
-- wrong for this business and should never silently add tax that wasn't
-- explicitly turned on in the form.
-- Run in Supabase SQL Editor. Safe to re-run. Does not touch existing rows.

ALTER TABLE public.invoices ALTER COLUMN ppn_pct SET DEFAULT 0;
ALTER TABLE public.invoices ALTER COLUMN pph_pct SET DEFAULT 0;
