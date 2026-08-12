CREATE TABLE IF NOT EXISTS public.health_score_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  score numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

GRANT SELECT, INSERT, UPDATE ON public.health_score_daily TO authenticated;
GRANT ALL ON public.health_score_daily TO service_role;

ALTER TABLE public.health_score_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own health score history"
ON public.health_score_daily FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Coaches view assigned patients health score history"
ON public.health_score_daily FOR SELECT TO authenticated
USING (public.is_assigned_patient_of_coach(user_id) OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_health_score_daily_user_date
ON public.health_score_daily (user_id, date);