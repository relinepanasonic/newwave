-- ============================================================
-- Run this in Supabase SQL Editor
-- Adds new columns to schedule_slots for additional form fields
-- ============================================================

alter table public.schedule_slots add column if not exists background text;
alter table public.schedule_slots add column if not exists kostum text;
alter table public.schedule_slots add column if not exists gimmick text;
