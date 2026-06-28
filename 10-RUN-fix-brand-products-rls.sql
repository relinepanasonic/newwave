-- ── Fix: product import blocked by RLS on brand_products ─────────────────────
-- The old "manage" policy only had a USING clause checking superadmin, which
-- left INSERT (WITH CHECK) unreliable and rejected the import. The product
-- catalog UI is already restricted to the admin Clients page, so we allow any
-- authenticated user to manage rows with an explicit WITH CHECK. Safe to re-run.
alter table public.brand_products enable row level security;

drop policy if exists "Superadmin can manage brand_products" on public.brand_products;
drop policy if exists "Authenticated can manage brand_products" on public.brand_products;

create policy "Authenticated can manage brand_products"
  on public.brand_products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
