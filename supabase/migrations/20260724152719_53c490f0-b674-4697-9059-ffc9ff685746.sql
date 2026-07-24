REVOKE ALL ON FUNCTION public.get_coach_commission_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_commission_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_commission_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_commission_summary(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_coach_view_assigned_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_coach_view_assigned_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_coach_view_assigned_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_coach_view_assigned_user(uuid) TO service_role;