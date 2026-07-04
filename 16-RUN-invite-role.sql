-- Add role column to onboarding_invites so operator/host_manager can be invited
ALTER TABLE public.onboarding_invites
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'host'
    CHECK (role IN ('host', 'operator', 'host_manager'));
