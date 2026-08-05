CREATE UNIQUE INDEX IF NOT EXISTS coach_assignments_one_active_per_user
ON public.coach_assignments (user_id)
WHERE is_active;