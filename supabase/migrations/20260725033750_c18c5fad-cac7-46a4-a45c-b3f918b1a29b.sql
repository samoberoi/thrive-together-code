DROP FUNCTION IF EXISTS public.get_assigned_coach(uuid);

CREATE OR REPLACE FUNCTION public.get_assigned_coach(_user_id uuid)
RETURNS TABLE (
  id uuid,
  phone text,
  name text,
  description text,
  specialization text,
  coach_type public.coach_type,
  years_experience integer,
  total_consultations integer,
  avg_rating numeric,
  total_ratings integer,
  avatar_url text,
  is_active boolean,
  qualification text,
  languages text[],
  bio text,
  city text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coach_id uuid;
  _coach_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1
       FROM public.coach_assignments ca
       JOIN public.coaches c ON c.id = ca.coach_id
       WHERE ca.user_id = _user_id
         AND ca.is_active = true
         AND c.user_id = auth.uid()
     ) THEN
    RETURN;
  END IF;

  SELECT ca.coach_id
    INTO _coach_id
  FROM public.coach_assignments ca
  JOIN public.coaches c ON c.id = ca.coach_id
  WHERE ca.user_id = _user_id
    AND ca.is_active = true
    AND c.is_active = true
  ORDER BY ca.assigned_at DESC
  LIMIT 1;

  IF _coach_id IS NULL THEN
    SELECT NULLIF(BTRIM(p.coach_name), '')
      INTO _coach_name
    FROM public.profiles p
    WHERE p.user_id = _user_id
    LIMIT 1;

    IF _coach_name IS NOT NULL THEN
      SELECT c.id
        INTO _coach_id
      FROM public.coaches c
      WHERE c.is_active = true
        AND LOWER(BTRIM(c.name)) = LOWER(_coach_name)
      ORDER BY c.created_at DESC
      LIMIT 1;

      IF _coach_id IS NOT NULL THEN
        UPDATE public.coach_assignments
           SET is_active = false
         WHERE user_id = _user_id
           AND is_active = true
           AND coach_id <> _coach_id;

        INSERT INTO public.coach_assignments (user_id, coach_id, is_active)
        VALUES (_user_id, _coach_id, true)
        ON CONFLICT (user_id, coach_id)
        DO UPDATE SET is_active = true, assigned_at = now();
      END IF;
    END IF;
  END IF;

  IF _coach_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.phone,
    c.name,
    c.description,
    c.specialization,
    c.coach_type,
    c.years_experience,
    c.total_consultations,
    c.avg_rating,
    c.total_ratings,
    c.avatar_url,
    c.is_active,
    c.qualification,
    c.languages,
    c.bio,
    c.city
  FROM public.coaches c
  WHERE c.id = _coach_id
    AND c.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assigned_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assigned_coach(uuid) TO service_role;