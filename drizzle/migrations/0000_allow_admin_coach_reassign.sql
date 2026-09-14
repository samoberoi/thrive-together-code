-- Allow super admins to reassign a member's permanent coach in place.
CREATE OR REPLACE FUNCTION public.guard_permanent_coach_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('app.allow_coach_reassign', true), '') = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Coach assignments are permanent and cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_coach_reassign', true), '') <> 'on'
     AND (
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.coach_id IS DISTINCT FROM OLD.coach_id OR
       NEW.is_active IS DISTINCT FROM true
     ) THEN
    RAISE EXCEPTION 'Coach assignments are permanent and cannot be changed or deactivated';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A new coach assignment must be active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reassign_coach(_user_id uuid, _coach_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can reassign coaches';
  END IF;

  SELECT c.name INTO _name FROM public.coaches c WHERE c.id = _coach_id AND c.is_active = true;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'Coach not found or inactive';
  END IF;

  PERFORM set_config('app.allow_coach_reassign', 'on', true);

  INSERT INTO public.coach_assignments (user_id, coach_id, is_active)
  VALUES (_user_id, _coach_id, true)
  ON CONFLICT (user_id) DO UPDATE
    SET coach_id = EXCLUDED.coach_id,
        is_active = true,
        assigned_at = now();

  UPDATE public.profiles SET coach_name = _name WHERE user_id = _user_id;

  PERFORM set_config('app.allow_coach_reassign', 'off', true);

  RETURN _coach_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reassign_coach(uuid, uuid) TO authenticated;