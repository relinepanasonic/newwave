-- One-off cleanup: permanently delete invoices that were accidentally pushed
-- in from a ProOne workspace unrelated to New Wave, then "cancelled" via the
-- push-in API (which just zeroes/closes them rather than removing them).
--
-- Criteria: source = 'proone' AND status = 'cancelled' AND total_amount = 0.
-- invoice_items cascade-delete with their parent invoice (FK ON DELETE CASCADE).
--
-- Run in Supabase SQL Editor. Already executed once via the REST API on
-- 2026-08-05 (removed 35 rows) — kept here for reference / future reuse if
-- the same accidental-sync situation happens again.

DELETE FROM public.invoices
WHERE source = 'proone'
  AND status = 'cancelled'
  AND total_amount = 0;
