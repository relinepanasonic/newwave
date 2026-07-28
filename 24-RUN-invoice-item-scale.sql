-- ── Invoice items: scale-based quantity (Month/Hour/Day/Pc) ─────────────────
-- Replaces the old "qty x jam_per_sesi x price" model with a plain
-- "qty x price = amount" model, matching ProOne Accounting's line item shape
-- (quantity x unitPrice). `scale` just labels what a unit of qty means.
-- jam_per_sesi is kept (existing invoices still show it), just no longer
-- used in the amount calculation for new/edited items.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS scale text DEFAULT 'Pc';
