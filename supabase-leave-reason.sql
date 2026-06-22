-- Optional: store the Cuti (on-leave) reason for hosts.
-- The app works without this column (the reason is just dropped if absent),
-- but running this lets HRD persist why a host is on leave.

alter table public.profiles
  add column if not exists leave_reason text;
