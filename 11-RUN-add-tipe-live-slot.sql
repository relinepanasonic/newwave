-- Add tipe_live to schedule_slots so each slot records which package type it uses
-- (e.g. Regular, Silver, Gold). Safe to re-run.
alter table public.schedule_slots
  add column if not exists tipe_live text;
