-- ============================================================
-- Run this ONCE in Supabase SQL Editor.
-- Fixes "can't delete host" — converts blocking foreign keys
-- (default RESTRICT) into ON DELETE SET NULL / CASCADE so a
-- profile can be deleted without manually clearing every table.
-- ============================================================

-- onboarding_invites: keep the invite row, just detach the host links
alter table public.onboarding_invites drop constraint if exists onboarding_invites_host_id_fkey;
alter table public.onboarding_invites
  add constraint onboarding_invites_host_id_fkey
  foreign key (host_id) references public.profiles(id) on delete set null;

alter table public.onboarding_invites drop constraint if exists onboarding_invites_created_by_fkey;
alter table public.onboarding_invites
  add constraint onboarding_invites_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- schedule_slots: keep the slot, detach host + creator
alter table public.schedule_slots drop constraint if exists schedule_slots_host_id_fkey;
alter table public.schedule_slots
  add constraint schedule_slots_host_id_fkey
  foreign key (host_id) references public.profiles(id) on delete set null;

alter table public.schedule_slots drop constraint if exists schedule_slots_created_by_fkey;
alter table public.schedule_slots
  add constraint schedule_slots_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- check_ins.host_id is NOT NULL → can't set null, so cascade-delete the rows
alter table public.check_ins drop constraint if exists check_ins_host_id_fkey;
alter table public.check_ins
  add constraint check_ins_host_id_fkey
  foreign key (host_id) references public.profiles(id) on delete cascade;

-- invoices: keep the invoice, detach the creator
alter table public.invoices drop constraint if exists invoices_created_by_fkey;
alter table public.invoices
  add constraint invoices_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- ============================================================
-- After running the above, deleting a host works everywhere.
-- live_reports already cascades; brand_products / invoice.client_id
-- already set null, so nothing else needs changing.
-- ============================================================
