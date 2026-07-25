REVOKE EXECUTE ON FUNCTION public.get_assigned_coach(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_assigned_coach(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_assigned_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assigned_coach(uuid) TO service_role;