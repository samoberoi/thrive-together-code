
-- Notify coach (native push) when a health_score_alerts row is inserted.
-- The existing dispatch trigger on notifications only fires push for type='health_alert',
-- so we insert a health_alert notification for the coach's user.

CREATE OR REPLACE FUNCTION public.notify_coach_on_health_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coach_user_id uuid;
  _patient_name text;
  _title text;
  _body text;
BEGIN
  SELECT c.user_id INTO _coach_user_id
  FROM public.coaches c
  WHERE c.id = NEW.coach_id;

  IF _coach_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.name, 'Your patient') INTO _patient_name
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF NEW.alert_type = 'critical_decline' THEN
    _title := '🚨 Critical: ' || _patient_name || ' needs attention';
  ELSE
    _title := '⚠️ ' || _patient_name || ' needs attention';
  END IF;

  _body := 'Health score dropped ' || abs(NEW.score_delta) || ' pts (' || NEW.previous_score || ' → ' || NEW.new_score || '). Tap to review.';

  INSERT INTO public.notifications (user_id, title, body, type, icon, action_url, is_read)
  VALUES (
    _coach_user_id,
    _title,
    _body,
    'health_alert',
    CASE WHEN NEW.alert_type = 'critical_decline' THEN '🚨' ELSE '⚠️' END,
    '/coach?tab=patients',
    false
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_coach_on_health_alert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_coach_on_health_alert() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_coach_on_health_alert ON public.health_score_alerts;
CREATE TRIGGER trg_notify_coach_on_health_alert
AFTER INSERT ON public.health_score_alerts
FOR EACH ROW
EXECUTE FUNCTION public.notify_coach_on_health_alert();
