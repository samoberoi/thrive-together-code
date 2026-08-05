CREATE TABLE public.symptom_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.symptom_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.symptom_categories TO authenticated;
GRANT ALL ON public.symptom_categories TO service_role;
ALTER TABLE public.symptom_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Symptom categories are viewable by everyone" ON public.symptom_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage symptom categories" ON public.symptom_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.symptom_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.symptom_categories(id) ON DELETE CASCADE,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_symptom_options_category ON public.symptom_options(category_id);
GRANT SELECT ON public.symptom_options TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.symptom_options TO authenticated;
GRANT ALL ON public.symptom_options TO service_role;
ALTER TABLE public.symptom_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Symptom options are viewable by everyone" ON public.symptom_options FOR SELECT USING (true);
CREATE POLICY "Admins manage symptom options" ON public.symptom_options FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.user_symptoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  symptom_keys text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_symptoms TO authenticated;
GRANT ALL ON public.user_symptoms TO service_role;
ALTER TABLE public.user_symptoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own symptoms" ON public.user_symptoms FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own symptoms" ON public.user_symptoms FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own symptoms" ON public.user_symptoms FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Coaches view patient symptoms" ON public.user_symptoms FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'coach') AND public.coach_owns_patient(user_id));
CREATE POLICY "Coaches insert patient symptoms" ON public.user_symptoms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'coach') AND public.coach_owns_patient(user_id));
CREATE POLICY "Coaches update patient symptoms" ON public.user_symptoms FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'coach') AND public.coach_owns_patient(user_id)) WITH CHECK (public.has_role(auth.uid(), 'coach') AND public.coach_owns_patient(user_id));
CREATE POLICY "Admins manage user symptoms" ON public.user_symptoms FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_symptom_categories_updated_at BEFORE UPDATE ON public.symptom_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_symptom_options_updated_at BEFORE UPDATE ON public.symptom_options FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_user_symptoms_updated_at BEFORE UPDATE ON public.user_symptoms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();