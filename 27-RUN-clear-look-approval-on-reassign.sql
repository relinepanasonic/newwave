-- ── Bug fix: Look Approval photo/timestamp survived a host reassignment ──
-- Look Approval (the pre-live check-in selfie) is stored directly on the
-- schedule_slots row (look_approval_at / look_approval_url). When a slot's
-- host_id was changed (e.g. admin reassigns/swaps a session to a different
-- host), those columns were left untouched -- so the new host would see the
-- PREVIOUS host's photo and "already approved" status, letting them skip
-- taking their own photo, and the final report would show the wrong face.
--
-- The app-side fix (ScheduleClient.tsx's saveSlot) now clears these columns
-- whenever host_id changes. This trigger is a defense-in-depth backstop so
-- no other write path (present or future) can reintroduce the same bug.
--
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.clear_look_approval_on_host_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.host_id IS DISTINCT FROM OLD.host_id THEN
    NEW.look_approval_at := NULL;
    NEW.look_approval_url := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clear_look_approval_on_host_change ON public.schedule_slots;
CREATE TRIGGER trg_clear_look_approval_on_host_change
  BEFORE UPDATE ON public.schedule_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_look_approval_on_host_change();
