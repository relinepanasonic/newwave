-- ── 1. NW Packages table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nw_packages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  description    text,
  tipe_live      text NOT NULL DEFAULT 'Regular',
  jam_per_sesi   numeric(4,1) NOT NULL DEFAULT 4,
  price_per_jam  numeric(14,2) NOT NULL DEFAULT 0,
  sort_order     int NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_packages ENABLE ROW LEVEL SECURITY;

-- Policies (drop-then-create so this script is safe to re-run)
DROP POLICY IF EXISTS "Read packages" ON nw_packages;
CREATE POLICY "Read packages" ON nw_packages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage packages" ON nw_packages;
CREATE POLICY "Manage packages" ON nw_packages FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Memo evaluation on live_reports ───────────────────────────────────────
ALTER TABLE live_reports ADD COLUMN IF NOT EXISTS memo_checked boolean NOT NULL DEFAULT false;

-- (notes column already exists — used as the memo text)
-- (slot_date may or may not exist yet)
ALTER TABLE live_reports ADD COLUMN IF NOT EXISTS slot_date date;

-- ── 3. Live Report — Start Live timestamp + Product Sold ─────────────────────
ALTER TABLE live_reports ADD COLUMN IF NOT EXISTS live_started_at timestamptz;
ALTER TABLE live_reports ADD COLUMN IF NOT EXISTS product_sold_name text;
