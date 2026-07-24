
-- 1) Coaches can UPDATE assigned patient profiles
CREATE POLICY "Coaches can update assigned patient profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_assignments ca
    JOIN public.coaches c ON c.id = ca.coach_id
    WHERE ca.user_id = profiles.user_id AND ca.is_active = true AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_assignments ca
    JOIN public.coaches c ON c.id = ca.coach_id
    WHERE ca.user_id = profiles.user_id AND ca.is_active = true AND c.user_id = auth.uid()
  )
);

-- 2) Custom step goal per user (coach override) on movement progress
ALTER TABLE public.user_movement_progress
  ADD COLUMN IF NOT EXISTS custom_daily_step_goal INTEGER,
  ADD COLUMN IF NOT EXISTS custom_goal_set_by UUID,
  ADD COLUMN IF NOT EXISTS custom_goal_note TEXT,
  ADD COLUMN IF NOT EXISTS custom_goal_updated_at TIMESTAMPTZ;

-- 3) Coaches can INSERT movement progress for assigned patients (so we can seed a row)
DROP POLICY IF EXISTS "Coaches insert assigned patient progress" ON public.user_movement_progress;
CREATE POLICY "Coaches insert assigned patient progress"
ON public.user_movement_progress
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role) AND coach_owns_patient(user_id)
);

-- 4) Coaches can UPDATE movement progress for their assigned patients
DROP POLICY IF EXISTS "Coaches update assigned patient progress" ON public.user_movement_progress;
CREATE POLICY "Coaches update assigned patient progress"
ON public.user_movement_progress
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role) AND coach_owns_patient(user_id)
)
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role) AND coach_owns_patient(user_id)
);
