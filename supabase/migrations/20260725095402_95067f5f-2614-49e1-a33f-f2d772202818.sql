CREATE OR REPLACE FUNCTION public.notify_assigned_coaches_of_health_metric(
  _patient_user_id uuid,
  _title text,
  _body text,
  _level text DEFAULT 'alert'::text,
  _metric text DEFAULT 'Health'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _coach record;
  _patient_name text;
  _coach_title text;
  _coach_body text;
  _icon text;
  _dedupe_window interval;
BEGIN
  IF _patient_user_id IS NULL OR length(trim(COALESCE(_body, ''))) = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(trim(p.name), ''), 'Your patient') INTO _patient_name
  FROM public.profiles p
  WHERE p.user_id = _patient_user_id;

  _patient_name := COALESCE(_patient_name, 'Your patient');
  _icon := CASE WHEN _level = 'critical' THEN '🚨' WHEN _level = 'info' THEN '📈' ELSE '⚠️' END;
  _coach_title := CASE
    WHEN _level = 'critical' THEN '🚨 Critical: ' || _patient_name || ' needs attention'
    WHEN _level = 'info' THEN '📈 ' || _patient_name || ' updated health data'
    ELSE '⚠️ ' || _patient_name || ' needs attention'
  END;
  _coach_body := left(COALESCE(NULLIF(trim(_metric), ''), 'Health') || ': ' || trim(_body) || '. Tap to review.', 500);
  _dedupe_window := CASE WHEN _level = 'info' THEN interval '3 minutes' ELSE interval '15 minutes' END;

  FOR _coach IN
    SELECT DISTINCT c.user_id AS coach_user_id
    FROM public.coach_assignments ca
    JOIN public.coaches c ON c.id = ca.coach_id
    WHERE ca.user_id = _patient_user_id
      AND ca.is_active = true
      AND c.user_id IS NOT NULL
      AND c.is_active = true
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = _coach.coach_user_id
        AND n.type = 'health_alert'
        AND n.title = left(_coach_title, 120)
        AND n.body = _coach_body
        AND n.created_at > now() - _dedupe_window
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, icon, action_url, is_read)
      VALUES (
        _coach.coach_user_id,
        left(_coach_title, 120),
        _coach_body,
        'health_alert',
        _icon,
        '/coach?tab=patients',
        false
      );
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION public.notify_assigned_coaches_of_health_metric(uuid, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_assigned_coaches_of_health_metric(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_assigned_coaches_of_health_metric(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_assigned_coaches_of_health_metric(uuid, text, text, text, text) TO service_role;