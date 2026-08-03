-- 1. Remove the redundant second meeting-notification trigger (added later, duplicated the original)
DROP TRIGGER IF EXISTS trg_notify_coach_meeting_user ON public.coach_meetings;
DROP FUNCTION IF EXISTS public.notify_coach_meeting_user();

-- 2. Prevent the same coach double-booking the same patient at the same slot
DELETE FROM public.coach_meetings m
 WHERE m.status = 'scheduled'
   AND EXISTS (
     SELECT 1 FROM public.coach_meetings k
      WHERE k.coach_id = m.coach_id AND k.user_id = m.user_id
        AND k.scheduled_at = m.scheduled_at AND k.status = 'scheduled'
        AND k.created_at < m.created_at
   );

CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_meetings_slot
  ON public.coach_meetings(coach_id, user_id, scheduled_at)
  WHERE status = 'scheduled';

-- 3. When a patient is reassigned, cancel the previous coach's future meetings
CREATE OR REPLACE FUNCTION public.cancel_prior_coach_meetings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.coach_meetings
       SET status = 'cancelled'
     WHERE user_id = NEW.user_id
       AND coach_id <> NEW.coach_id
       AND status = 'scheduled'
       AND scheduled_at > now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_prior_coach_meetings ON public.coach_assignments;
CREATE TRIGGER trg_cancel_prior_coach_meetings
  AFTER INSERT OR UPDATE OF is_active, coach_id ON public.coach_assignments
  FOR EACH ROW EXECUTE FUNCTION public.cancel_prior_coach_meetings();

-- 4. Block a handed-over coach from scheduling new meetings for that patient.
--    Purely about *who the patient's current coach is* — not about coach availability.
CREATE OR REPLACE FUNCTION public.guard_meeting_coach_is_current()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current uuid;
BEGIN
  SELECT coach_id INTO _current
    FROM public.coach_assignments
   WHERE user_id = NEW.user_id AND is_active
   ORDER BY assigned_at DESC
   LIMIT 1;

  IF _current IS NOT NULL
     AND NEW.coach_id <> _current
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'This patient is now assigned to a different coach.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_meeting_coach_is_current ON public.coach_meetings;
CREATE TRIGGER trg_guard_meeting_coach_is_current
  BEFORE INSERT ON public.coach_meetings
  FOR EACH ROW EXECUTE FUNCTION public.guard_meeting_coach_is_current();

-- 5. Clean up existing bad data
UPDATE public.coach_meetings m
   SET status = 'cancelled'
 WHERE m.status = 'scheduled'
   AND m.scheduled_at > now()
   AND EXISTS (
     SELECT 1 FROM public.coach_assignments a
      WHERE a.user_id = m.user_id AND a.is_active AND a.coach_id <> m.coach_id
   );

DELETE FROM public.notifications
 WHERE type = 'coach_meeting'
   AND EXISTS (
     SELECT 1 FROM public.notifications n2
      WHERE n2.user_id = notifications.user_id
        AND n2.type = 'meeting'
        AND n2.created_at = notifications.created_at
   );