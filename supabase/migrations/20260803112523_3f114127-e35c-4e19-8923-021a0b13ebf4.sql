CREATE OR REPLACE FUNCTION public.notify_coach_on_external_test_intent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _coach_user uuid;
  _patient_name text;
BEGIN
  IF NEW.external_intent IS TRUE AND COALESCE(OLD.external_intent, false) IS FALSE THEN
    SELECT c.user_id INTO _coach_user
    FROM public.coach_assignments ca
    JOIN public.coaches c ON c.id = ca.coach_id
    WHERE ca.user_id = NEW.user_id AND ca.is_active = true
    LIMIT 1;

    SELECT COALESCE(name, 'A patient') INTO _patient_name FROM public.profiles WHERE user_id = NEW.user_id;

    IF _coach_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
      VALUES (
        _coach_user,
        'Test being done outside',
        _patient_name || ' will get the recommended test done outside and will upload the report.',
        'lab_test', '🧪', '/coach?tab=lab-tests'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_external_intent ON public.thyrocare_recommendations;
CREATE TRIGGER trg_notify_external_intent
  AFTER UPDATE OF external_intent ON public.thyrocare_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.notify_coach_on_external_test_intent();

CREATE OR REPLACE FUNCTION public.notify_on_external_lab_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _coach_user uuid;
  _patient_name text;
BEGIN
  SELECT c.user_id INTO _coach_user
  FROM public.coach_assignments ca
  JOIN public.coaches c ON c.id = ca.coach_id
  WHERE ca.user_id = NEW.user_id AND ca.is_active = true
  LIMIT 1;

  SELECT COALESCE(name, 'A patient') INTO _patient_name FROM public.profiles WHERE user_id = NEW.user_id;

  IF NEW.uploaded_by IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
    VALUES (
      NEW.user_id,
      'Outside report added',
      'Your coach uploaded an outside lab report to your profile.',
      'lab_test', '📄', '/dashboard?tab=profile&section=lab-tests'
    );
  ELSIF _coach_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
    VALUES (
      _coach_user,
      'Outside report uploaded',
      _patient_name || ' uploaded a lab report done outside. Review it and enter the values.',
      'lab_test', '📄', '/coach?tab=lab-tests'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_external_report ON public.external_lab_reports;
CREATE TRIGGER trg_notify_external_report
  AFTER INSERT ON public.external_lab_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_external_lab_report();

CREATE OR REPLACE FUNCTION public.notify_patient_on_external_report_reviewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'reviewed' AND COALESCE(OLD.status, '') <> 'reviewed' THEN
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
    VALUES (
      NEW.user_id,
      'Your outside report is ready',
      'Your coach has added your report values. Your markers and charts are now updated.',
      'lab_test', '📈', '/dashboard?tab=profile&section=lab-tests'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_external_report_reviewed ON public.external_lab_reports;
CREATE TRIGGER trg_notify_external_report_reviewed
  AFTER UPDATE OF status ON public.external_lab_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_patient_on_external_report_reviewed();