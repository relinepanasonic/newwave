-- ── Invoice: due date ────────────────────────────────────────────────────
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date;
