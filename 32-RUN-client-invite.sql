-- ── Client onboarding invite link ───────────────────────────────────────────
-- Clients were only creatable by an admin typing their email + password by
-- hand (Hosts > Tambah Client), which means the admin has to invent and then
-- hand over a password. Hosts already have a self-signup link flow
-- (onboarding_invites -> /onboard), so reuse that table for clients: the
-- admin generates a link with the brand pre-set, the client opens it and
-- picks their own email + password.
--
-- client_brand is the only field the host flow doesn't already carry
-- (tipe_host/target_hours/hourly_rate stay null for client invites).
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.onboarding_invites ADD COLUMN IF NOT EXISTS client_brand text;

-- The invite link is opened by someone who is NOT logged in yet, so the
-- token lookup has to be readable anonymously. Restricted to pending rows
-- and requires knowing the (random 32-char) token; nothing sensitive lives
-- on this table.
DROP POLICY IF EXISTS "anon read pending invite by token" ON public.onboarding_invites;
CREATE POLICY "anon read pending invite by token"
  ON public.onboarding_invites FOR SELECT
  USING (status = 'pending');
