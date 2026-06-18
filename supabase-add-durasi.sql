-- Add live duration fields to schedule_slots
alter table public.schedule_slots add column if not exists jam_mulai text;
alter table public.schedule_slots add column if not exists durasi numeric(4,1);
