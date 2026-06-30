-- ── Petty Cash ───────────────────────────────────────────────────────────────
-- Tracks cash advances given to hosts for transport / operational expenses.
-- Superadmin creates → host accepts → host fills expense rows →
-- auto-closes when balance hits 0.

CREATE TABLE IF NOT EXISTS petty_cash (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_id      TEXT UNIQUE NOT NULL,             -- e.g. PC2607001
  host_id      UUID NOT NULL REFERENCES profiles(id),
  amount       NUMERIC NOT NULL CHECK (amount > 0),  -- initial cash given
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','active','closed')),
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS petty_cash_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  petty_cash_id   UUID NOT NULL REFERENCES petty_cash(id) ON DELETE CASCADE,
  tanggal         DATE NOT NULL DEFAULT CURRENT_DATE,
  remark          TEXT,
  cash_out        NUMERIC NOT NULL DEFAULT 0 CHECK (cash_out >= 0),
  receipt_url     TEXT,   -- Google Drive file URL
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE petty_cash       ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_items ENABLE ROW LEVEL SECURITY;

-- Superadmin: unrestricted
CREATE POLICY "sa_all_petty_cash" ON petty_cash FOR ALL TO authenticated
  USING  ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin' );

CREATE POLICY "sa_all_petty_cash_items" ON petty_cash_items FOR ALL TO authenticated
  USING  ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin' );

-- Host: read own petty cash
CREATE POLICY "host_read_petty_cash" ON petty_cash FOR SELECT TO authenticated
  USING ( host_id = auth.uid() );

-- Host: accept (pending → active only)
CREATE POLICY "host_accept_petty_cash" ON petty_cash FOR UPDATE TO authenticated
  USING    ( host_id = auth.uid() AND status = 'pending' )
  WITH CHECK ( status = 'active' );

-- Host: read own items
CREATE POLICY "host_read_petty_cash_items" ON petty_cash_items FOR SELECT TO authenticated
  USING ( EXISTS (
    SELECT 1 FROM petty_cash p WHERE p.id = petty_cash_id AND p.host_id = auth.uid()
  ));

-- Host: insert items only when status = active
CREATE POLICY "host_insert_petty_cash_items" ON petty_cash_items FOR INSERT TO authenticated
  WITH CHECK ( EXISTS (
    SELECT 1 FROM petty_cash p WHERE p.id = petty_cash_id AND p.host_id = auth.uid() AND p.status = 'active'
  ));

-- Host: delete own items only when active
CREATE POLICY "host_delete_petty_cash_items" ON petty_cash_items FOR DELETE TO authenticated
  USING ( EXISTS (
    SELECT 1 FROM petty_cash p WHERE p.id = petty_cash_id AND p.host_id = auth.uid() AND p.status = 'active'
  ));
