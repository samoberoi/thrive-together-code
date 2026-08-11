CREATE POLICY "Coaches can view assigned patient exercise logs"
ON public.user_exercise_logs
FOR SELECT
TO authenticated
USING (public.coach_owns_patient(user_id));

CREATE POLICY "Coaches can view assigned patient video progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (public.coach_owns_patient(user_id));

CREATE POLICY "Coaches can view assigned patient soleus sessions"
ON public.user_soleus_sessions
FOR SELECT
TO authenticated
USING (public.coach_owns_patient(user_id));

CREATE POLICY "Coaches can view assigned patient breath sessions"
ON public.user_breath_sessions
FOR SELECT
TO authenticated
USING (public.coach_owns_patient(user_id));

CREATE POLICY "Admins can view all exercise logs"
ON public.user_exercise_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all video progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all soleus sessions"
ON public.user_soleus_sessions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_exercise_logs'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_exercise_logs; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'video_progress'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.video_progress; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_soleus_sessions'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_soleus_sessions; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_breath_sessions'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_breath_sessions; END IF;
END $$;

ALTER TABLE public.user_exercise_logs REPLICA IDENTITY FULL;
ALTER TABLE public.video_progress REPLICA IDENTITY FULL;
ALTER TABLE public.user_soleus_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.user_breath_sessions REPLICA IDENTITY FULL;