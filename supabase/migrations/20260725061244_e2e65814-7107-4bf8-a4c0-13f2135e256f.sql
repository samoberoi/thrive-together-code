CREATE OR REPLACE FUNCTION public.bbdo_normalize_diet_preference(_diet text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _diet IS NULL OR btrim(_diet) = '' THEN 'veg'
    WHEN lower(replace(replace(btrim(_diet), '-', '_'), ' ', '_')) IN ('vegetarian', 'veg', 'mixed') THEN 'veg'
    WHEN lower(replace(replace(btrim(_diet), '-', '_'), ' ', '_')) IN ('nonveg', 'non_veg', 'non_vegetarian', 'nonvegetarian') THEN 'non_veg'
    WHEN lower(replace(replace(btrim(_diet), '-', '_'), ' ', '_')) = 'vegan' THEN 'vegan'
    WHEN lower(replace(replace(btrim(_diet), '-', '_'), ' ', '_')) = 'jain' THEN 'jain'
    WHEN lower(replace(replace(btrim(_diet), '-', '_'), ' ', '_')) = 'eggitarian' THEN 'eggitarian'
    ELSE lower(replace(replace(btrim(_diet), '-', '_'), ' ', '_'))
  END
$$;

REVOKE ALL ON FUNCTION public.bbdo_normalize_diet_preference(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bbdo_normalize_diet_preference(text) TO authenticated, service_role;

DELETE FROM public.diet_platings
WHERE COALESCE(plate_data->>'diet', 'mixed') = 'mixed';