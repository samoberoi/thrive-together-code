-- Ensure existing notification/alert tables have the Data API privileges expected by their RLS rules.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_score_alerts TO authenticated;
GRANT ALL ON public.health_score_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.notify_assigned_coaches_of_health_metric(
  _patient_user_id uuid,
  _title text,
  _body text,
  _level text DEFAULT 'alert',
  _metric text DEFAULT 'Health'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _coach record;
  _patient_name text;
  _coach_title text;
  _coach_body text;
  _icon text;
BEGIN
  IF _patient_user_id IS NULL OR length(trim(COALESCE(_body, ''))) = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(trim(p.name), ''), 'Your patient') INTO _patient_name
  FROM public.profiles p
  WHERE p.user_id = _patient_user_id;

  _patient_name := COALESCE(_patient_name, 'Your patient');
  _icon := CASE WHEN _level = 'critical' THEN '🚨' ELSE '⚠️' END;
  _coach_title := CASE
    WHEN _level = 'critical' THEN '🚨 Critical: ' || _patient_name || ' needs attention'
    ELSE '⚠️ ' || _patient_name || ' needs attention'
  END;
  _coach_body := left(COALESCE(NULLIF(trim(_metric), ''), 'Health') || ': ' || trim(_body) || '. Tap to review.', 500);

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
        AND n.created_at > now() - interval '15 minutes'
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

REVOKE ALL ON FUNCTION public.notify_assigned_coaches_of_health_metric(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_assigned_coaches_of_health_metric(uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_health_log_alert_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prev_weight numeric;
  _delta numeric;
  _title text;
  _body text;
  _level text;
  _glucose numeric;
  _metric text;
BEGIN
  IF NEW.log_type = 'bp' AND NEW.bp_systolic IS NOT NULL AND NEW.bp_diastolic IS NOT NULL THEN
    _metric := 'BP';
    IF NEW.bp_systolic >= 180 OR NEW.bp_diastolic >= 120 THEN
      _level := 'critical';
      _title := 'Critical BP alert';
      _body := format('Very high BP: %s/%s mmHg', NEW.bp_systolic, NEW.bp_diastolic);
    ELSIF NEW.bp_systolic >= 140 OR NEW.bp_diastolic >= 90 THEN
      _level := 'alert';
      _title := 'High BP alert';
      _body := format('High BP: %s/%s mmHg', NEW.bp_systolic, NEW.bp_diastolic);
    ELSIF NEW.bp_systolic <= 90 OR NEW.bp_diastolic <= 60 THEN
      _level := 'alert';
      _title := 'Low BP alert';
      _body := format('Low BP: %s/%s mmHg', NEW.bp_systolic, NEW.bp_diastolic);
    END IF;
  ELSIF NEW.log_type = 'weight' AND NEW.weight_kg IS NOT NULL THEN
    _metric := 'Weight';
    SELECT hl.weight_kg INTO _prev_weight
    FROM public.health_logs hl
    WHERE hl.user_id = NEW.user_id
      AND hl.log_type = 'weight'
      AND hl.id <> NEW.id
      AND hl.weight_kg IS NOT NULL
    ORDER BY hl.logged_at DESC, hl.created_at DESC
    LIMIT 1;

    IF _prev_weight IS NOT NULL THEN
      _delta := NEW.weight_kg - _prev_weight;
      IF abs(_delta) >= 10 THEN
        _level := 'critical';
        _title := 'Critical weight change';
        _body := format('Weight %s %s kg (%s → %s)', CASE WHEN _delta > 0 THEN 'up' ELSE 'down' END, round(abs(_delta), 1), _prev_weight, NEW.weight_kg);
      ELSIF abs(_delta) >= 2 THEN
        _level := 'alert';
        _title := 'Weight change alert';
        _body := format('Weight %s %s kg (%s → %s)', CASE WHEN _delta > 0 THEN 'up' ELSE 'down' END, round(abs(_delta), 1), _prev_weight, NEW.weight_kg);
      END IF;
    ELSIF NEW.weight_kg >= 150 OR NEW.weight_kg <= 35 THEN
      _level := 'alert';
      _title := 'Weight alert';
      _body := format('Weight logged: %s kg', NEW.weight_kg);
    END IF;
  ELSIF NEW.log_type = 'diabetes' THEN
    _metric := 'Glucose';
    _glucose := COALESCE(NEW.glucose_morning, NEW.glucose_evening);
    IF _glucose IS NOT NULL THEN
      IF _glucose >= 250 THEN
        _level := 'critical';
        _title := 'Critical glucose alert';
        _body := format('Very high glucose: %s mg/dL', _glucose);
      ELSIF _glucose <= 54 THEN
        _level := 'critical';
        _title := 'Critical glucose alert';
        _body := format('Very low glucose: %s mg/dL', _glucose);
      ELSIF _glucose >= 180 THEN
        _level := 'alert';
        _title := 'High glucose alert';
        _body := format('High glucose: %s mg/dL', _glucose);
      ELSIF _glucose <= 70 THEN
        _level := 'alert';
        _title := 'Low glucose alert';
        _body := format('Low glucose: %s mg/dL', _glucose);
      ELSIF _glucose >= 140 THEN
        _level := 'alert';
        _title := 'Elevated glucose alert';
        _body := format('Elevated glucose: %s mg/dL', _glucose);
      END IF;
    END IF;
  END IF;

  IF _level IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
    VALUES (NEW.user_id, _title, _body, 'health_alert', CASE WHEN _level = 'critical' THEN '🚨' ELSE '⚠️' END, '/home?tab=profile');

    PERFORM public.notify_assigned_coaches_of_health_metric(NEW.user_id, _title, _body, _level, COALESCE(_metric, 'Health'));
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_profile_health_alert_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _old_weight numeric;
  _new_weight numeric;
  _delta numeric;
  _old_sys numeric;
  _old_dia numeric;
  _new_sys numeric;
  _new_dia numeric;
  _old_bmi numeric;
  _new_bmi numeric;
  _title text;
  _body text;
  _level text;
  _metric text;
  _new_clinical jsonb;
  _old_clinical jsonb;
BEGIN
  _old_weight := OLD.weight;
  _new_weight := NEW.weight;

  IF _new_weight IS NOT NULL AND _new_weight IS DISTINCT FROM _old_weight THEN
    _metric := 'Weight';
    IF _old_weight IS NOT NULL THEN
      _delta := _new_weight - _old_weight;
      IF abs(_delta) >= 10 THEN
        _level := 'critical';
        _title := 'Critical weight change';
        _body := format('Weight %s %s kg (%s → %s)', CASE WHEN _delta > 0 THEN 'up' ELSE 'down' END, round(abs(_delta), 1), _old_weight, _new_weight);
      ELSIF abs(_delta) >= 2 THEN
        _level := 'alert';
        _title := 'Weight change alert';
        _body := format('Weight %s %s kg (%s → %s)', CASE WHEN _delta > 0 THEN 'up' ELSE 'down' END, round(abs(_delta), 1), _old_weight, _new_weight);
      END IF;
    ELSIF _new_weight >= 150 OR _new_weight <= 35 THEN
      _level := 'alert';
      _title := 'Weight alert';
      _body := format('Weight logged: %s kg', _new_weight);
    END IF;
  END IF;

  IF _level IS NULL THEN
    _old_bmi := OLD.bmi;
    _new_bmi := NEW.bmi;
    IF _new_bmi IS NOT NULL AND (_new_bmi IS DISTINCT FROM _old_bmi OR NEW.bmi_category IS DISTINCT FROM OLD.bmi_category) THEN
      _metric := 'BMI';
      IF _new_bmi >= 35 THEN
        _level := 'critical';
        _title := 'Critical BMI alert';
        _body := format('BMI is %s (%s)', round(_new_bmi, 1), COALESCE(NEW.bmi_category, 'high risk'));
      ELSIF _new_bmi >= 30 THEN
        _level := 'alert';
        _title := 'BMI alert';
        _body := format('BMI is %s (%s)', round(_new_bmi, 1), COALESCE(NEW.bmi_category, 'obesity range'));
      END IF;
    END IF;
  END IF;

  IF _level IS NULL THEN
    _new_clinical := COALESCE(NEW.clinical::jsonb, '{}'::jsonb);
    _old_clinical := COALESCE(OLD.clinical::jsonb, '{}'::jsonb);

    IF (_new_clinical ->> 'systolicBP') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      _new_sys := (_new_clinical ->> 'systolicBP')::numeric;
    END IF;
    IF (_new_clinical ->> 'diastolicBP') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      _new_dia := (_new_clinical ->> 'diastolicBP')::numeric;
    END IF;
    IF (_old_clinical ->> 'systolicBP') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      _old_sys := (_old_clinical ->> 'systolicBP')::numeric;
    END IF;
    IF (_old_clinical ->> 'diastolicBP') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      _old_dia := (_old_clinical ->> 'diastolicBP')::numeric;
    END IF;

    IF _new_sys IS NOT NULL AND _new_dia IS NOT NULL AND (_new_sys IS DISTINCT FROM _old_sys OR _new_dia IS DISTINCT FROM _old_dia) THEN
      _metric := 'BP';
      IF _new_sys >= 180 OR _new_dia >= 120 THEN
        _level := 'critical';
        _title := 'Critical BP alert';
        _body := format('Very high BP: %s/%s mmHg', _new_sys, _new_dia);
      ELSIF _new_sys >= 140 OR _new_dia >= 90 THEN
        _level := 'alert';
        _title := 'High BP alert';
        _body := format('High BP: %s/%s mmHg', _new_sys, _new_dia);
      ELSIF _new_sys <= 90 OR _new_dia <= 60 THEN
        _level := 'alert';
        _title := 'Low BP alert';
        _body := format('Low BP: %s/%s mmHg', _new_sys, _new_dia);
      END IF;
    END IF;
  END IF;

  IF _level IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
    VALUES (NEW.user_id, _title, _body, 'health_alert', CASE WHEN _level = 'critical' THEN '🚨' ELSE '⚠️' END, '/home?tab=profile');

    PERFORM public.notify_assigned_coaches_of_health_metric(NEW.user_id, _title, _body, _level, COALESCE(_metric, 'Health'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_health_alert_notification ON public.profiles;
CREATE TRIGGER trg_profiles_health_alert_notification
AFTER UPDATE OF weight, bmi, bmi_category, clinical ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_profile_health_alert_notification();