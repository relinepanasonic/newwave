-- Live report products (per-product breakdown per live session)
create table if not exists public.live_report_products (
  id uuid default gen_random_uuid() primary key,
  live_report_id uuid references public.live_reports(id) on delete cascade not null,
  host_id uuid references public.profiles(id) on delete set null,
  report_date date,
  brand text,
  produk_terjual text not null,
  product_klik int default 0,
  item_sold int default 1,
  total numeric(12,0) default 0,
  created_at timestamptz default now()
);

alter table public.live_report_products enable row level security;
create policy "Authenticated can read products" on public.live_report_products for select using (auth.role() = 'authenticated');
create policy "Host can insert own products" on public.live_report_products for insert with check (auth.uid() = host_id);
create policy "Host can delete own products" on public.live_report_products for delete using (auth.uid() = host_id);

-- If tables already exist, run these ALTER statements first:
-- alter table public.invoices add column if not exists pph_pct numeric(5,2) default 2;

-- Invoices
create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  invoice_number text not null,
  invoice_date date not null default current_date,
  brand text not null,
  client_id uuid references public.profiles(id) on delete set null,
  invoice_to text,
  sub_total numeric(12,0) default 0,
  discount_pct numeric(5,2) default 0,
  ppn_pct numeric(5,2) default 11,
  pph_pct numeric(5,2) default 2,
  total_amount numeric(12,0) default 0,
  bank_name text default 'Bank BCA',
  bank_account_name text default 'PT Pintu Langit Inovasi Global',
  bank_account_number text default '4295775788',
  notes text,
  status text default 'unpaid',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Invoice line items
create table if not exists public.invoice_items (
  id uuid default gen_random_uuid() primary key,
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  name text not null,
  description text,
  tipe_live text,
  jam_per_sesi numeric(4,1) default 4,
  qty int default 1,
  price numeric(12,0) default 0,
  amount numeric(12,0) default 0,
  is_free boolean default false
);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
create policy "Authenticated can read invoices" on public.invoices for select using (auth.role() = 'authenticated');
create policy "Superadmin can manage invoices" on public.invoices for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));
create policy "Authenticated can read invoice items" on public.invoice_items for select using (auth.role() = 'authenticated');
create policy "Superadmin can manage invoice items" on public.invoice_items for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));
