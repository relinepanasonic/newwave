-- ── 1. Add username (calling name) to profiles ──────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Update existing 7 hosts with their calling names
UPDATE profiles SET username = 'Anggi'   WHERE role = 'host' AND full_name ILIKE 'Anggi Aliyah%';
UPDATE profiles SET username = 'Naya'    WHERE role = 'host' AND full_name ILIKE 'Inayah Aqila%';
UPDATE profiles SET username = 'Koko'    WHERE role = 'host' AND full_name ILIKE 'Koko%';
UPDATE profiles SET username = 'Cici'    WHERE role = 'host' AND full_name ILIKE 'Leyka%';
UPDATE profiles SET username = 'Mutiara' WHERE role = 'host' AND full_name ILIKE 'Mutiara%';
UPDATE profiles SET username = 'Nadya'   WHERE role = 'host' AND full_name ILIKE 'Nadya%';
UPDATE profiles SET username = 'Regyna'  WHERE role = 'host' AND full_name ILIKE 'Regyna%';

-- ── 2. Add look_approval_at to schedule_slots ────────────────────────────────
ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS look_approval_at timestamptz;
