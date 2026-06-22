-- ============================================================
-- Run this in Supabase SQL Editor
-- Product Etalase Live: master product catalog per brand.
-- This is the source list that the Live Report product dropdown
-- and the Dashboard Top-5 (sold / traffic) draw from.
-- ============================================================

create table if not exists public.brand_products (
  id          uuid default gen_random_uuid() primary key,
  brand       text not null,
  name        text not null,
  sku         text,
  price       numeric(12,0) default 0,
  image_url   text,
  is_active   boolean default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create index if not exists brand_products_brand_idx on public.brand_products (brand);

alter table public.brand_products enable row level security;

-- Everyone signed in can read the catalog (hosts need it for the live report dropdown)
create policy "Authenticated can read brand_products"
  on public.brand_products for select
  using (auth.role() = 'authenticated');

-- Only superadmin manages the catalog
create policy "Superadmin can manage brand_products"
  on public.brand_products for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));
