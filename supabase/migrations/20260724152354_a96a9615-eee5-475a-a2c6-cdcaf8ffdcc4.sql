CREATE OR REPLACE FUNCTION public.can_coach_view_assigned_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.coach_assignments ca ON ca.coach_id = c.id
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND ca.is_active = true
      AND ca.user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_coach_view_assigned_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "Coaches can view assigned patient subscriptions" ON public.subscriptions;
CREATE POLICY "Coaches can view assigned patient subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (public.can_coach_view_assigned_user(user_id));