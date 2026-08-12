CREATE OR REPLACE FUNCTION public.create_profile_health_alert_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _has_update boolean := false;
  _skip_notify boolean := false;
BEGIN
  -- Onboarding gate: values written while the user is still completing onboarding
  -- are setup baselines, not real measurements. Never alert on them.
  IF COALESCE(NEW.onboarding_completed, false) IS NOT TRUE
     OR COALESCE(OLD.onboarding_completed, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  _old_weight := OLD.weight;
  _new_weight := NEW.weight;

  IF _new_weight IS NOT NULL AND _new_weight IS DISTINCT FROM _old_weight THEN
    _has_update := true;
    _metric := 'Weight';
    _level := 'info';
    _title := 'Weight updated';
    _body := format('Weight updated to %s kg', _new_weight);

    IF _old_weight IS NOT NULL THEN
      _delta := _new_weight - _old_weight;
      _body := format('Weight %s %s kg (%s → %s)', CASE WHEN _delta > 0 THEN 'up' ELSE 'down' END, round(abs(_delta), 1), _old_weight, _new_weight);
      IF abs(_delta) >= 10 THEN
        _level := 'critical';
        _title := 'Critical weight change';
      ELSIF abs(_delta) >= 2 THEN
        _level := 'alert';
        _title := 'Weight change alert';
      END IF;
    ELSIF _new_weight >= 150 OR _new_weight <= 35 THEN
      _level := 'alert';
      _title := 'Weight alert';
      _body := format('Weight logged: %s kg', _new_weight);
    END IF;
  END IF;

  IF NOT _has_update THEN
    _old_bmi := OLD.bmi;
    _new_bmi := NEW.bmi;
    IF _new_bmi IS NOT NULL AND (_new_bmi IS DISTINCT FROM _old_bmi OR NEW.bmi_category IS DISTINCT FROM OLD.bmi_category) THEN
      _has_update := true;
      _metric := 'BMI';
      _level := 'info';
      _title := 'BMI updated';
      _body := format('BMI updated to %s (%s)', round(_new_bmi, 1), COALESCE(NEW.bmi_category, 'category pending'));
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

  IF NOT _has_update THEN
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
      _has_update := true;
      _metric := 'BP';
      _level := 'info';
      _title := 'BP updated';
      _body := format('BP updated to %s/%s mmHg', _new_sys, _new_dia);
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
      ELSE
        _skip_notify := _new_sys < 130 AND _new_dia < 90;
      END IF;
    END IF;
  END IF;

  IF _has_update AND NOT _skip_notify THEN
    IF _level IN ('alert', 'critical') THEN
      INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
      VALUES (NEW.user_id, _title, _body, 'health_alert', CASE WHEN _level = 'critical' THEN '🚨' ELSE '⚠️' END, '/home?tab=profile');
    END IF;

    PERFORM public.notify_assigned_coaches_of_health_metric(NEW.user_id, _title, _body, _level, COALESCE(_metric, 'Health'));
  END IF;

  RETURN NEW;
END;
$function$;