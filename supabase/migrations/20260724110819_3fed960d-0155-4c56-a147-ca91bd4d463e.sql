
CREATE TABLE IF NOT EXISTS public.coach_video_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  patient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('exercise','yoga')),
  item_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_user_id, module, item_key)
);

CREATE INDEX IF NOT EXISTS idx_cva_patient_module ON public.coach_video_assignments(patient_user_id, module);
CREATE INDEX IF NOT EXISTS idx_cva_coach ON public.coach_video_assignments(coach_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_video_assignments TO authenticated;
GRANT ALL ON public.coach_video_assignments TO service_role;

ALTER TABLE public.coach_video_assignments ENABLE ROW LEVEL SECURITY;

-- Patients can view their own assignments
CREATE POLICY "Patients read own assignments"
  ON public.coach_video_assignments FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid());

-- Coaches can view assignments they made
CREATE POLICY "Coaches read own assignments"
  ON public.coach_video_assignments FOR SELECT TO authenticated
  USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

-- Coaches can insert assignments for their assigned patients
CREATE POLICY "Coaches insert assignments for their patients"
  ON public.coach_video_assignments FOR INSERT TO authenticated
  WITH CHECK (
    coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coach_assignments ca
      WHERE ca.coach_id = coach_video_assignments.coach_id
        AND ca.user_id = coach_video_assignments.patient_user_id
        AND ca.is_active = true
    )
  );

-- Coaches can delete their assignments
CREATE POLICY "Coaches delete own assignments"
  ON public.coach_video_assignments FOR DELETE TO authenticated
  USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

-- Admins full access
CREATE POLICY "Admins manage all assignments"
  ON public.coach_video_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
