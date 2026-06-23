-- ============================================================
-- Run this in Supabase SQL Editor.
-- HRD Kasbon: host salary advances / debts deducted from payroll.
-- ============================================================

create table if not exists public.kasbon (
  id          uuid default gen_random_uuid() primary key,
  host_id     uuid references public.profiles(id) on delete cascade not null,
  amount      numeric(12,0) not null default 0,
  reason      text,
  status      text default 'unpaid',   -- 'unpaid' | 'paid'
  created_at  timestamptz default now(),
  paid_at     timestamptz
);

create index if not exists kasbon_host_idx on public.kasbon (host_id);

alter table public.kasbon enable row level security;

-- Superadmin manages everything
create policy "kasbon superadmin all"
  on public.kasbon for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));

-- Host can read their own kasbon (for their dashboard / payslip)
create policy "kasbon host read own"
  on public.kasbon for select
  using (auth.uid() = host_id);
