CREATE OR REPLACE FUNCTION public.assign_coach_for_plan(_user_id uuid, _plan_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _coach_type coach_type;
  _coach_id UUID;
BEGIN
  IF _plan_id IN ('foundation', 'starter') THEN
    UPDATE public.coach_assignments SET is_active = false
     WHERE user_id = _user_id AND is_active = true;
    UPDATE public.profiles SET coach_name = NULL WHERE user_id = _user_id;
    RETURN NULL;
  END IF;

  _coach_type := CASE _plan_id
    WHEN 'active' THEN 'active_reset'::coach_type
    WHEN 'intensive' THEN 'pro_transformation'::coach_type
    WHEN 'pro' THEN 'pro_transformation'::coach_type
    ELSE 'active_reset'::coach_type
  END;

  UPDATE public.coach_assignments SET is_active = false
   WHERE user_id = _user_id AND is_active = true;

  -- Eligibility: coach_packages array when populated, else legacy coach_type
  SELECT c.id INTO _coach_id
  FROM public.coaches c
  LEFT JOIN (
    SELECT coach_id, COUNT(*) AS cnt
    FROM public.coach_assignments
    WHERE is_active = true
    GROUP BY coach_id
  ) a ON a.coach_id = c.id
  WHERE c.is_active = true
    AND (
      (COALESCE(array_length(c.coach_packages, 1), 0) > 0
        AND _coach_type::text = ANY (c.coach_packages))
      OR (COALESCE(array_length(c.coach_packages, 1), 0) = 0
        AND c.coach_type = _coach_type)
    )
  ORDER BY COALESCE(a.cnt, 0) ASC, c.avg_rating DESC, c.id ASC
  LIMIT 1;

  IF _coach_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.coach_assignments (user_id, coach_id, is_active)
  VALUES (_user_id, _coach_id, true)
  ON CONFLICT (user_id, coach_id) DO UPDATE SET is_active = true, assigned_at = now();

  UPDATE public.profiles
     SET coach_name = (SELECT name FROM public.coaches WHERE id = _coach_id)
   WHERE user_id = _user_id;

  RETURN _coach_id;
END;
$function$;