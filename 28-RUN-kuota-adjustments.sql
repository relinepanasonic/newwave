-- ── Kuota: manual top-up adjustments ─────────────────────────────────────────
-- A ProOne invoice is billed to one brand (invoice.brand), but sometimes one
-- invoice actually covers hours split across sibling brands managed by the
-- same client (e.g. one "Niko Electronic" invoice really pays for both Niko
-- Electronic and Numan live sessions). Since live_reports/schedule_slots
-- already tag each session with the correct brand, the fix is to let an admin
-- manually move some of the invoice-derived top-up from one brand/tier to
-- another for a given month, without touching the synced invoice itself.
--
-- Each row is a delta (can be negative) added on top of whatever the invoice
-- line items already contribute for that brand + tier + month. It's inserted
-- into the same "top-up" ledger the Kuota meter already sums, so it carries
-- forward into next month's balance exactly like a real top-up would.
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.kuota_adjustments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand        text NOT NULL,
  tier         text NOT NULL,        -- 'Regular' | 'Silver' | 'Gold' | 'Platinum' | 'Rubi' | 'Untagged'
  month_start  date NOT NULL,        -- first of the month this adjustment applies to
  delta_hours  numeric(10,2) NOT NULL DEFAULT 0,
  note         text,
  created_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (brand, tier, month_start)
);

ALTER TABLE public.kuota_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kuota_adjustments superadmin all" ON public.kuota_adjustments;
CREATE POLICY "kuota_adjustments superadmin all"
  ON public.kuota_adjustments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE OR REPLACE FUNCTION public.kuota_adjustments_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS kuota_adjustments_updated_at ON public.kuota_adjustments;
CREATE TRIGGER kuota_adjustments_updated_at
  BEFORE UPDATE ON public.kuota_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.kuota_adjustments_touch_updated_at();
