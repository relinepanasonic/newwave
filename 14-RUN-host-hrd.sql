-- ── Host HRD: Kasbon Request Flow ────────────────────────────────────────────
-- Adds request columns to kasbon so hosts can submit their own requests.
-- Superadmin reviews, can edit nominal, then approves/rejects.

ALTER TABLE public.kasbon
  ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(12,0),
  ADD COLUMN IF NOT EXISTS request_status   TEXT,        -- 'pending' | 'approved' | 'rejected' | NULL (admin-created)
  ADD COLUMN IF NOT EXISTS request_note     TEXT,        -- host's note / keperluan
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;

-- Host can submit a kasbon request (INSERT with request_status = 'pending')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kasbon' AND policyname = 'kasbon host insert request'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "kasbon host insert request"
        ON public.kasbon FOR INSERT
        WITH CHECK (
          auth.uid() = host_id
          AND request_status = 'pending'
        )
    $policy$;
  END IF;
END $$;
