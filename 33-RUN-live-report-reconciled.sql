-- ── Make Reconciliation's "Fixed" status survive a re-upload ────────────────
-- Fixed / "Data App Benar" were tracked only in React state, keyed by the CSV
-- row index. Re-uploading the CSV (or reloading the page) wiped that state and
-- every reviewed row snapped back to "Berbeda" -- so a finished reconciliation
-- looked untouched the next time anyone opened it.
--
-- The stable identity here is the live_report itself, not the CSV row index
-- (which shifts between files), so the decision belongs on the report.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.live_reports ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
