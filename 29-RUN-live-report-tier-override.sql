-- ── Kuota: manual Tipe Live tag directly on a live_report ───────────────────
-- Most recent live_reports have no slot_id at all (hosts file reports
-- without picking a scheduled slot), so there is no schedule_slot to set a
-- Tipe Live on -- the "Belum Ditandai" bucket can't be fixed via Schedule for
-- this data. tier_override lets an admin tag the report itself directly from
-- Client List's "Belum Ditandai" list. When set it takes priority over
-- whatever the linked slot (if any) says.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.live_reports ADD COLUMN IF NOT EXISTS tier_override text;
