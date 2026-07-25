-- ── Operator Absensi: daily attendance + Lembur (overtime) requests ────────
-- Operators are not hourly (no schedule_slots), so this is a standalone daily
-- clock-in/clock-out with a photo stamp at each end, plus a Kasbon-style
-- request/approve flow for overtime. Run in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.attendance (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date                date NOT NULL,
  clock_in            timestamptz,
  clock_in_photo_url  text,
  clock_out           timestamptz,
  clock_out_photo_url text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (operator_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_operator_idx ON public.attendance (operator_id);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance superadmin all" ON public.attendance;
CREATE POLICY "attendance superadmin all"
  ON public.attendance FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "attendance operator select own" ON public.attendance;
CREATE POLICY "attendance operator select own"
  ON public.attendance FOR SELECT
  USING (auth.uid() = operator_id);

DROP POLICY IF EXISTS "attendance operator insert own" ON public.attendance;
CREATE POLICY "attendance operator insert own"
  ON public.attendance FOR INSERT
  WITH CHECK (auth.uid() = operator_id);

-- Operator needs UPDATE for clock-out, which happens on the same row clock-in created.
DROP POLICY IF EXISTS "attendance operator update own" ON public.attendance;
CREATE POLICY "attendance operator update own"
  ON public.attendance FOR UPDATE
  USING (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);

CREATE TABLE IF NOT EXISTS public.lembur_requests (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date           date NOT NULL,
  hours          numeric(4,2) NOT NULL,
  reason         text,
  request_status text DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  approved_at    timestamptz,
  approved_by    uuid REFERENCES public.profiles(id),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lembur_requests_operator_idx ON public.lembur_requests (operator_id);

ALTER TABLE public.lembur_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lembur_requests superadmin all" ON public.lembur_requests;
CREATE POLICY "lembur_requests superadmin all"
  ON public.lembur_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "lembur_requests operator select own" ON public.lembur_requests;
CREATE POLICY "lembur_requests operator select own"
  ON public.lembur_requests FOR SELECT
  USING (auth.uid() = operator_id);

DROP POLICY IF EXISTS "lembur_requests operator insert own" ON public.lembur_requests;
CREATE POLICY "lembur_requests operator insert own"
  ON public.lembur_requests FOR INSERT
  WITH CHECK (auth.uid() = operator_id AND request_status = 'pending');
