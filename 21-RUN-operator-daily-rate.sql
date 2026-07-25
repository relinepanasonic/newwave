-- ── Operator daily rate ──────────────────────────────────────────────────
-- Operators are paid per day worked (min. 8h), not per hour like hosts.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_rate numeric(12,0) DEFAULT 0;
