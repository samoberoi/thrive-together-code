GRANT EXECUTE ON FUNCTION public.bbdo_normalize_diet_preference(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_diet_plating(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swap_diet_plate(uuid, integer) TO authenticated, service_role;