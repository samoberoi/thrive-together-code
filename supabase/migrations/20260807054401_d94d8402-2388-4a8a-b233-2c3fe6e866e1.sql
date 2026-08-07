-- Restore the original assignment for any patient who was previously reassigned.
-- Remove later rows first so the existing active-only unique index is respected.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY assigned_at ASC NULLS LAST, id ASC) AS rn
  FROM public.coach_assignments
)
DELETE FROM public.coach_assignments ca
USING ranked r
WHERE ca.id = r.id AND r.rn > 1;

UPDATE public.coach_assignments
SET is_active = true
WHERE is_active IS DISTINCT FROM true;

-- Keep profile display names aligned to the permanent assignment.
UPDATE public.profiles p
SET coach_name = c.name
FROM public.coach_assignments ca
JOIN public.coaches c ON c.id = ca.coach_id
WHERE ca.user_id = p.user_id
  AND p.coach_name IS DISTINCT FROM c.name;

DROP INDEX IF EXISTS public.coach_assignments_one_active_per_user;
CREATE UNIQUE INDEX coach_assignments_one_lifetime_per_user
  ON public.coach_assignments (user_id);

CREATE OR REPLACE FUNCTION public.guard_permanent_coach_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Coach assignments are permanent and cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND (
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

DROP TRIGGER IF EXISTS guard_permanent_coach_assignment ON public.coach_assignments;
CREATE TRIGGER guard_permanent_coach_assignment
BEFORE INSERT OR UPDATE OR DELETE ON public.coach_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_permanent_coach_assignment();

CREATE OR REPLACE FUNCTION public.assign_coach_for_plan(_user_id uuid, _plan_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coach_type public.coach_type;
  _coach_id uuid;
BEGIN
  -- Permanent means permanent: once any coach has been assigned, every later
  -- invocation returns that same coach without considering plan, status, or hours.
  SELECT ca.coach_id INTO _coach_id
  FROM public.coach_assignments ca
  WHERE ca.user_id = _user_id
  LIMIT 1;

  IF _coach_id IS NOT NULL THEN
    UPDATE public.profiles p
       SET coach_name = c.name
      FROM public.coaches c
     WHERE p.user_id = _user_id
       AND c.id = _coach_id
       AND p.coach_name IS DISTINCT FROM c.name;
    RETURN _coach_id;
  END IF;

  -- Plans without coaching do not create an initial assignment.
  IF _plan_id IN ('foundation', 'starter') THEN
    RETURN NULL;
  END IF;

  _coach_type := CASE _plan_id
    WHEN 'active' THEN 'active_reset'::public.coach_type
    WHEN 'intensive' THEN 'pro_transformation'::public.coach_type
    WHEN 'pro' THEN 'pro_transformation'::public.coach_type
    ELSE 'active_reset'::public.coach_type
  END;

  SELECT c.id INTO _coach_id
  FROM public.coaches c
  LEFT JOIN (
    SELECT coach_id, count(*) AS cnt
    FROM public.coach_assignments
    GROUP BY coach_id
  ) a ON a.coach_id = c.id
  WHERE c.is_active = true
    AND (
      (coalesce(array_length(c.coach_packages, 1), 0) > 0
        AND _coach_type::text = ANY (c.coach_packages))
      OR (coalesce(array_length(c.coach_packages, 1), 0) = 0
        AND c.coach_type = _coach_type)
    )
  ORDER BY coalesce(a.cnt, 0), c.avg_rating DESC, c.id
  LIMIT 1;

  IF _coach_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.coach_assignments (user_id, coach_id, is_active)
  VALUES (_user_id, _coach_id, true)
  ON CONFLICT (user_id) DO NOTHING;

  -- A concurrent request may have won; always return the permanently stored coach.
  SELECT ca.coach_id INTO _coach_id
  FROM public.coach_assignments ca
  WHERE ca.user_id = _user_id;

  UPDATE public.profiles p
     SET coach_name = c.name
    FROM public.coaches c
   WHERE p.user_id = _user_id
     AND c.id = _coach_id
     AND p.coach_name IS DISTINCT FROM c.name;

  RETURN _coach_id;
END;
$$;