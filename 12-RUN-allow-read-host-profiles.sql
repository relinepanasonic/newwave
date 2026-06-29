-- Allow all authenticated users to read active host profiles.
-- This is needed so client users can see host names in:
--   • Jadwal Live (client-schedule) — who is doing their live
--   • Laporan Live (client-live-report) — which host submitted the report
-- Without this policy, embedding profiles(full_name) via host_id returns 0 rows
-- for client users (profiles RLS only allows reading one's own row by default).
create policy "authenticated_read_host_profiles"
  on public.profiles
  for select
  to authenticated
  using (role = 'host' and is_active = true);

-- Allow clients to read live reports for their brand.
-- Without this, clients cannot see any live_reports rows.
create policy "clients_read_own_brand_live_reports"
  on public.live_reports
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'client'
        and client_brand = live_reports.brand
    )
  );
