CREATE POLICY "Patients manage own lab report files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'lab-reports' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'lab-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Coaches read assigned lab report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lab-reports' AND public.coach_owns_patient(((storage.foldername(name))[1])::uuid));

CREATE POLICY "Coaches upload assigned lab report files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lab-reports' AND public.coach_owns_patient(((storage.foldername(name))[1])::uuid));

CREATE POLICY "Admins manage lab report files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'lab-reports' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'lab-reports' AND public.has_role(auth.uid(), 'admin'::app_role));