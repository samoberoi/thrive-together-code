
CREATE TABLE public.onboarding_grade_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  grade int NOT NULL,
  min_points int NOT NULL DEFAULT 0,
  max_points int NOT NULL DEFAULT 999,
  kicker text NOT NULL DEFAULT 'Understanding Your Body',
  headline text NOT NULL,
  headline_highlight text,
  accent text NOT NULL DEFAULT 'red',
  closing_line text,
  cta_label text NOT NULL DEFAULT 'So what can I do?',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.onboarding_grade_band_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id uuid NOT NULL REFERENCES public.onboarding_grade_bands(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'Lock',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.onboarding_grade_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key text NOT NULL,
  question_label text NOT NULL,
  answer_key text,
  answer_label text NOT NULL,
  match_type text NOT NULL DEFAULT 'equals',
  min_value numeric,
  max_value numeric,
  points int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_grade_rules_match_type_chk CHECK (match_type IN ('equals','range'))
);

CREATE INDEX idx_ob_grade_rules_qkey ON public.onboarding_grade_rules(question_key);
CREATE INDEX idx_ob_grade_band_cards_band ON public.onboarding_grade_band_cards(band_id);

GRANT SELECT ON public.onboarding_grade_bands TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.onboarding_grade_bands TO authenticated;
GRANT ALL ON public.onboarding_grade_bands TO service_role;

GRANT SELECT ON public.onboarding_grade_band_cards TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.onboarding_grade_band_cards TO authenticated;
GRANT ALL ON public.onboarding_grade_band_cards TO service_role;

GRANT SELECT ON public.onboarding_grade_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.onboarding_grade_rules TO authenticated;
GRANT ALL ON public.onboarding_grade_rules TO service_role;

ALTER TABLE public.onboarding_grade_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_grade_band_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_grade_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read grade bands" ON public.onboarding_grade_bands FOR SELECT USING (true);
CREATE POLICY "Admins manage grade bands" ON public.onboarding_grade_bands FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can read grade band cards" ON public.onboarding_grade_band_cards FOR SELECT USING (true);
CREATE POLICY "Admins manage grade band cards" ON public.onboarding_grade_band_cards FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can read grade rules" ON public.onboarding_grade_rules FOR SELECT USING (true);
CREATE POLICY "Admins manage grade rules" ON public.onboarding_grade_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_ob_grade_bands_updated BEFORE UPDATE ON public.onboarding_grade_bands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ob_grade_band_cards_updated BEFORE UPDATE ON public.onboarding_grade_band_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ob_grade_rules_updated BEFORE UPDATE ON public.onboarding_grade_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Seed bands ───────────────────────────────────────────────────────────────
INSERT INTO public.onboarding_grade_bands (slug, grade, min_points, max_points, kicker, headline, headline_highlight, accent, closing_line, cta_label, sort_order) VALUES
('severe', 3, 12, 999, 'Understanding Your Body', 'Here''s what''s happening', 'inside.', 'red', 'This is reversible — but it needs a structured protocol, not willpower.', 'So what can I do?', 3),
('moderate', 2, 5, 11, 'Understanding Your Body', 'Your body is giving you', 'early signals.', 'amber', 'Catching this now is the difference between a course-correction and a diagnosis.', 'So what can I do?', 2),
('normal', 1, 0, 4, 'Understanding Your Body', 'Your body is on the', 'right track.', 'green', 'You''re ahead of most. Now let''s protect and compound what you''ve built.', 'Show me the plan', 1);

INSERT INTO public.onboarding_grade_band_cards (band_id, title, description, icon, sort_order)
SELECT id, 'Insulin Resistance', 'When your cells stop responding to insulin, glucose stays in your blood.', 'Lock', 1 FROM public.onboarding_grade_bands WHERE slug='severe'
UNION ALL SELECT id, 'Visceral Fat', 'Fat around organs worsens insulin resistance — a vicious cycle.', 'Heart', 2 FROM public.onboarding_grade_bands WHERE slug='severe'
UNION ALL SELECT id, 'Lifestyle Triggers', 'Poor sleep, stress, and sedentary habits amplify metabolic dysfunction.', 'RefreshCw', 3 FROM public.onboarding_grade_bands WHERE slug='severe'
UNION ALL SELECT id, 'Rising Insulin Load', 'Your pancreas is working harder than it should to keep glucose in range.', 'Activity', 1 FROM public.onboarding_grade_bands WHERE slug='moderate'
UNION ALL SELECT id, 'Fat Storage Shift', 'Weight is starting to settle around the middle — the earliest metabolic warning.', 'Scale', 2 FROM public.onboarding_grade_bands WHERE slug='moderate'
UNION ALL SELECT id, 'Recovery Deficit', 'Sleep, stress and movement gaps are quietly eroding your metabolic buffer.', 'Moon', 3 FROM public.onboarding_grade_bands WHERE slug='moderate'
UNION ALL SELECT id, 'Stable Glucose Control', 'Your markers suggest your cells are still responding well to insulin.', 'ShieldCheck', 1 FROM public.onboarding_grade_bands WHERE slug='normal'
UNION ALL SELECT id, 'Healthy Body Composition', 'Your body composition is not adding metabolic stress right now.', 'Heart', 2 FROM public.onboarding_grade_bands WHERE slug='normal'
UNION ALL SELECT id, 'Protective Habits', 'Your sleep, movement and lifestyle choices are working in your favour.', 'Leaf', 3 FROM public.onboarding_grade_bands WHERE slug='normal';

-- ── Seed rules ───────────────────────────────────────────────────────────────
INSERT INTO public.onboarding_grade_rules (question_key, question_label, answer_key, answer_label, match_type, min_value, max_value, points, sort_order) VALUES
('goals','Why are you here','diabetes','Control Diabetes','equals',NULL,NULL,4,1),
('goals','Why are you here','weight','Lose Weight','equals',NULL,NULL,3,2),
('goals','Why are you here','lifestyle','Change Lifestyle','equals',NULL,NULL,2,3),
('goals','Why are you here','energy','Boost Energy','equals',NULL,NULL,1,4),
('age','Age',NULL,'Under 35','range',0,34.999,0,10),
('age','Age',NULL,'35–49','range',35,49.999,1,11),
('age','Age',NULL,'50 and above','range',50,200,2,12),
('bmi','BMI',NULL,'Below 25','range',0,24.999,0,20),
('bmi','BMI',NULL,'25 – 29.9 (Overweight)','range',25,29.999,2,21),
('bmi','BMI',NULL,'30 and above (Obese)','range',30,100,4,22),
('waist_male','Waist (Male)',NULL,'Under 90 cm','range',0,89.999,0,30),
('waist_male','Waist (Male)',NULL,'90 – 101.9 cm','range',90,101.999,2,31),
('waist_male','Waist (Male)',NULL,'102 cm and above','range',102,300,3,32),
('waist_female','Waist (Female)',NULL,'Under 80 cm','range',0,79.999,0,35),
('waist_female','Waist (Female)',NULL,'80 – 87.9 cm','range',80,87.999,2,36),
('waist_female','Waist (Female)',NULL,'88 cm and above','range',88,300,3,37),
('diabetesType','Diabetes status','type1','Type 1','equals',NULL,NULL,4,40),
('diabetesType','Diabetes status','type2','Type 2','equals',NULL,NULL,5,41),
('diabetesType','Diabetes status','prediabetes','Prediabetes','equals',NULL,NULL,3,42),
('diabetesType','Diabetes status','not_sure','Diagnosed, type unknown','equals',NULL,NULL,3,43),
('diabetesType','Diabetes status','none','No diabetes','equals',NULL,NULL,0,44),
('hasHypertension','High blood pressure','true','Yes','equals',NULL,NULL,2,50),
('hasHypertension','High blood pressure','false','No','equals',NULL,NULL,0,51),
('hasCardiovascular','Heart / cardiovascular condition','true','Yes','equals',NULL,NULL,3,55),
('hasCardiovascular','Heart / cardiovascular condition','false','No','equals',NULL,NULL,0,56),
('smoking','Smoking','true','Yes','equals',NULL,NULL,2,60),
('smoking','Smoking','false','No','equals',NULL,NULL,0,61),
('alcohol','Alcohol','none','None','equals',NULL,NULL,0,65),
('alcohol','Alcohol','moderate','Moderate','equals',NULL,NULL,1,66),
('alcohol','Alcohol','high','High','equals',NULL,NULL,2,67),
('activity','Physical activity','sedentary','Sedentary','equals',NULL,NULL,3,70),
('activity','Physical activity','light','Light','equals',NULL,NULL,2,71),
('activity','Physical activity','moderate','Moderate','equals',NULL,NULL,1,72),
('activity','Physical activity','active','Very Active','equals',NULL,NULL,0,73),
('sleepHours','Sleep hours',NULL,'Under 5 hrs','range',0,4.999,3,80),
('sleepHours','Sleep hours',NULL,'5 – 5.9 hrs','range',5,5.999,2,81),
('sleepHours','Sleep hours',NULL,'6 – 6.9 hrs','range',6,6.999,1,82),
('sleepHours','Sleep hours',NULL,'7 hrs and above','range',7,24,0,83);

-- ── Scoring function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_onboarding_grade(_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int := 0;
  r record;
  v_text text;
  v_num numeric;
  goal_pts int := 0;
  band record;
  cards jsonb;
  gender text := lower(coalesce(_answers->>'gender','male'));
BEGIN
  -- goals: highest scoring selected bucket
  SELECT coalesce(max(gr.points),0) INTO goal_pts
  FROM public.onboarding_grade_rules gr
  WHERE gr.question_key = 'goals' AND gr.is_active
    AND _answers ? 'goals'
    AND gr.answer_key IN (SELECT jsonb_array_elements_text(coalesce(_answers->'goals','[]'::jsonb)));
  total := total + goal_pts;

  FOR r IN
    SELECT * FROM public.onboarding_grade_rules
    WHERE is_active AND question_key <> 'goals'
  LOOP
    -- gender-specific waist keys
    IF r.question_key IN ('waist_male','waist_female') THEN
      IF (r.question_key = 'waist_male' AND gender <> 'male')
         OR (r.question_key = 'waist_female' AND gender = 'male') THEN
        CONTINUE;
      END IF;
      v_text := _answers->>'waist';
    ELSE
      v_text := _answers->>r.question_key;
    END IF;

    IF v_text IS NULL OR v_text = '' THEN CONTINUE; END IF;

    IF r.match_type = 'equals' THEN
      IF lower(v_text) = lower(coalesce(r.answer_key,'')) THEN
        total := total + r.points;
      END IF;
    ELSE
      BEGIN
        v_num := v_text::numeric;
      EXCEPTION WHEN others THEN
        CONTINUE;
      END;
      IF v_num >= coalesce(r.min_value,-1e9) AND v_num <= coalesce(r.max_value,1e9) THEN
        total := total + r.points;
      END IF;
    END IF;
  END LOOP;

  SELECT * INTO band FROM public.onboarding_grade_bands
  WHERE is_active AND total >= min_points AND total <= max_points
  ORDER BY grade DESC LIMIT 1;

  IF band IS NULL THEN
    SELECT * INTO band FROM public.onboarding_grade_bands WHERE is_active ORDER BY grade ASC LIMIT 1;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('title',c.title,'description',c.description,'icon',c.icon) ORDER BY c.sort_order),'[]'::jsonb)
  INTO cards FROM public.onboarding_grade_band_cards c WHERE c.band_id = band.id AND c.is_active;

  RETURN jsonb_build_object(
    'points', total,
    'grade', band.grade,
    'slug', band.slug,
    'kicker', band.kicker,
    'headline', band.headline,
    'headline_highlight', band.headline_highlight,
    'accent', band.accent,
    'closing_line', band.closing_line,
    'cta_label', band.cta_label,
    'cards', cards
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_onboarding_grade(jsonb) TO anon, authenticated, service_role;
