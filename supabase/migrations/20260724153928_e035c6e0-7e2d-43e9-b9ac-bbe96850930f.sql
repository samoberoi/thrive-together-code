REVOKE ALL ON FUNCTION public.bbdo_normalize_diet_preference(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bbdo_normalize_diet_preference(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_diet_plating(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_diet_plating(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.swap_diet_plate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_diet_plate(uuid, integer) TO authenticated, service_role;