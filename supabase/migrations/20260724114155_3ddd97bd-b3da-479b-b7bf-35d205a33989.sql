
-- Extend user_diet_profiles with sub-preferences + food-item-backed allergies
ALTER TABLE public.user_diet_profiles
  ADD COLUMN IF NOT EXISTS sub_preferences text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergen_food_ids uuid[] NOT NULL DEFAULT '{}';

-- Track gluten-free eligibility on food items (nullable = unknown)
ALTER TABLE public.food_items
  ADD COLUMN IF NOT EXISTS is_gluten_free boolean;

-- Allow coaches to create/update diet profiles for their assigned patients
DROP POLICY IF EXISTS "Coaches can insert patient diet profiles" ON public.user_diet_profiles;
CREATE POLICY "Coaches can insert patient diet profiles"
ON public.user_diet_profiles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'coach'::app_role) AND public.coach_owns_patient(user_id));

DROP POLICY IF EXISTS "Coaches can update patient diet profiles" ON public.user_diet_profiles;
CREATE POLICY "Coaches can update patient diet profiles"
ON public.user_diet_profiles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'coach'::app_role) AND public.coach_owns_patient(user_id))
WITH CHECK (public.has_role(auth.uid(), 'coach'::app_role) AND public.coach_owns_patient(user_id));
