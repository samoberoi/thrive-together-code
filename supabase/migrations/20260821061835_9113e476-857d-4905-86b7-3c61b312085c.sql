DROP POLICY IF EXISTS "Coaches view assigned client plates" ON public.user_plates;
CREATE POLICY "Coaches view assigned client plates" ON public.user_plates
FOR SELECT TO authenticated
USING (
  public.can_coach_view_assigned_user(user_id)
  OR public.has_role(auth.uid(), 'admin')
);