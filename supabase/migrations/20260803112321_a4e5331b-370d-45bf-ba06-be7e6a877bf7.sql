ALTER TABLE public.thyrocare_recommendations
  ADD COLUMN IF NOT EXISTS external_intent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_note text;

CREATE TABLE IF NOT EXISTS public.external_lab_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recommendation_id uuid REFERENCES public.thyrocare_recommendations(id) ON DELETE SET NULL,
  uploaded_by uuid,
  product_codes text[] NOT NULL DEFAULT '{}',
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  lab_name text,
  collected_on date,
  notes text,
  status text NOT NULL DEFAULT 'uploaded',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_lab_reports TO authenticated;
GRANT ALL ON public.external_lab_reports TO service_role;

ALTER TABLE public.external_lab_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients manage own external reports"
  ON public.external_lab_reports FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Coaches manage assigned external reports"
  ON public.external_lab_reports FOR ALL TO authenticated
  USING (public.coach_owns_patient(user_id)) WITH CHECK (public.coach_owns_patient(user_id));

CREATE POLICY "Admins manage all external reports"
  ON public.external_lab_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ext_lab_reports_user ON public.external_lab_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_lab_reports_rec ON public.external_lab_reports(recommendation_id);

CREATE TRIGGER trg_ext_lab_reports_updated
  BEFORE UPDATE ON public.external_lab_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.lab_results
  ADD COLUMN IF NOT EXISTS external_report_id uuid REFERENCES public.external_lab_reports(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lab_results_external ON public.lab_results(external_report_id);