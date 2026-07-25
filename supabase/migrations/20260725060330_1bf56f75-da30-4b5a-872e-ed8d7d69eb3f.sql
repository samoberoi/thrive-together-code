CREATE OR REPLACE FUNCTION public.get_community_post_likers(
  _post_id uuid,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  liked_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cl.user_id,
    COALESCE(NULLIF(BTRIM(p.name), ''), 'Member') AS name,
    p.avatar_url,
    cl.created_at AS liked_at
  FROM public.community_likes cl
  LEFT JOIN public.profiles p ON p.user_id = cl.user_id
  WHERE cl.post_id = _post_id
    AND auth.uid() IS NOT NULL
  ORDER BY cl.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 200)
$$;

REVOKE ALL ON FUNCTION public.get_community_post_likers(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_post_likers(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_post_likers(uuid, integer) TO service_role;