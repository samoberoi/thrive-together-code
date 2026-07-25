CREATE OR REPLACE FUNCTION public.notify_patient_on_coach_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _coach_name TEXT;
BEGIN
  IF NEW.is_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'your coach') INTO _coach_name
  FROM public.coaches WHERE id = NEW.coach_id LIMIT 1;

  BEGIN
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url)
    VALUES (
      NEW.user_id,
      'Coach assigned 👋',
      _coach_name || ' is now your coach. Say hi and share your goals.',
      'coach_assignment',
      '🧑‍⚕️',
      '/coach'
    );
  EXCEPTION WHEN OTHERS THEN
    -- never block assignment because of a notification failure
    NULL;
  END;

  RETURN NEW;
END;
$function$;