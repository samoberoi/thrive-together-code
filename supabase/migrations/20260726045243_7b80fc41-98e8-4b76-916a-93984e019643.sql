CREATE OR REPLACE FUNCTION public.community_member_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.profiles;
$$;

GRANT EXECUTE ON FUNCTION public.community_member_count() TO authenticated;