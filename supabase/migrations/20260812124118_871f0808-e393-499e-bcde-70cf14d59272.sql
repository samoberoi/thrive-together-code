-- Helper: insert a patient notification without depending on the caller's session
CREATE OR REPLACE FUNCTION public.insert_patient_notification(
  _user_id uuid, _title text, _body text, _type text, _icon text, _action_url text, _dedupe_window interval DEFAULT interval '2 minutes'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = _user_id AND type = _type
      AND created_at > now() - _dedupe_window
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
  VALUES (_user_id, left(_title,120), left(_body,500), _type, _icon, _action_url)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Fasting protocol assigned by a coach/admin
CREATE OR REPLACE FUNCTION public.notify_patient_on_fasting_protocol()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _name text;
BEGIN
  IF NEW.assigned_by IS NULL OR NEW.assigned_by = NEW.user_id THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.status,'active') <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT protocol_name INTO _name FROM public.fasting_protocols WHERE id = NEW.protocol_id;

  PERFORM public.insert_patient_notification(
    NEW.user_id,
    '⏳ Fasting protocol assigned',
    'Your coach assigned you the ' || COALESCE(_name, 'fasting') || ' protocol. Tap to start.',
    'fasting',
    '⏳',
    '/home?tab=fasting'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_patient_on_fasting_protocol ON public.user_protocols;
CREATE TRIGGER trg_notify_patient_on_fasting_protocol
AFTER INSERT ON public.user_protocols
FOR EACH ROW EXECUTE FUNCTION public.notify_patient_on_fasting_protocol();

-- Supplement recommendation: make it session-independent + deduped
CREATE OR REPLACE FUNCTION public.notify_patient_on_supplement_reco()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.insert_patient_notification(
    NEW.user_id,
    'Coach recommended supplements 💊',
    'Your coach shared a new supplement plan. Tap to review.',
    'supplements',
    '💊',
    '/home?tab=supplements'
  );
  RETURN NEW;
END;
$$;

-- Supplement plan created/updated directly by a coach
CREATE OR REPLACE FUNCTION public.notify_patient_on_supplement_plan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assigned_by IS NULL OR NEW.assigned_by = NEW.user_id THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.status,'active') <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM public.insert_patient_notification(
    NEW.user_id,
    'Coach recommended supplements 💊',
    'Your coach shared a new supplement plan. Tap to review.',
    'supplements',
    '💊',
    '/home?tab=supplements'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_patient_on_supplement_plan ON public.user_supplement_plans;
CREATE TRIGGER trg_notify_patient_on_supplement_plan
AFTER INSERT ON public.user_supplement_plans
FOR EACH ROW EXECUTE FUNCTION public.notify_patient_on_supplement_plan();