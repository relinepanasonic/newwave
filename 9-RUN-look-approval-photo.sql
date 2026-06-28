-- ── Look Approval photo ──────────────────────────────────────────────────────
-- Stores the photo the host captures when recording Look Approval, so the admin
-- can review the actual look in Live Details. Safe to re-run.
ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS look_approval_url text;
