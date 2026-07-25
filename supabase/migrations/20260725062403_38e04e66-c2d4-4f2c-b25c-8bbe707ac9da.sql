CREATE OR REPLACE FUNCTION public.swap_diet_plate(_plate_id uuid, _seed integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.diet_platings%ROWTYPE;
  _resolved_diet text;
  _prefs text[] := ARRAY[]::text[];
  _diet_filter text[];
  _is_vegan boolean;
  _is_veg boolean;
  _is_nonveg boolean;
  _is_eggitarian boolean;
  _use_nonveg boolean;
  _items text[] := ARRAY[]::text[];
  _old_items text[] := ARRAY[]::text[];
  _candidate text;
  _title text;
  _plate jsonb;
  _seed_txt text := COALESCE(_seed::text, floor(random() * 1000000000)::text) || extract(epoch from clock_timestamp())::text;
  _recs text[];
  _allergens uuid[];
  _sub text[];
  _skip_dairy boolean;
  _skip_gluten boolean;
  _jain boolean;
  _f_protein_veg uuid;
  _f_protein_nv uuid;
  _f_dairy uuid;
  _f_fats uuid;
  _f_nuts uuid;
  _f_alt_grain uuid;
  _f_veg uuid;
BEGIN
  SELECT * INTO _row FROM public.diet_platings WHERE id = _plate_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Plate not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> _row.user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.coach_owns_patient(_row.user_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _f_protein_veg FROM public.food_filters WHERE name ILIKE 'Veg / Vegan Proteins' LIMIT 1;
  SELECT id INTO _f_protein_nv FROM public.food_filters WHERE name ILIKE 'Lean Proteins' LIMIT 1;
  SELECT id INTO _f_dairy FROM public.food_filters WHERE name ILIKE 'Dairy/ Milk Alternatives' LIMIT 1;
  SELECT id INTO _f_fats FROM public.food_filters WHERE name ILIKE 'Healthy Fats' LIMIT 1;
  SELECT id INTO _f_nuts FROM public.food_filters WHERE name ILIKE 'Nuts & Seeds' LIMIT 1;
  SELECT id INTO _f_alt_grain FROM public.food_filters WHERE name ILIKE 'Rice & Wheat Alternatives' LIMIT 1;
  SELECT id INTO _f_veg FROM public.food_filters WHERE name ILIKE 'Vegetables' LIMIT 1;

  SELECT
    public.bbdo_normalize_diet_preference(COALESCE(diet_preference, 'mixed')),
    COALESCE(ARRAY(SELECT public.bbdo_normalize_diet_preference(x) FROM unnest(COALESCE(diet_preferences, '{}'::text[])) AS x), ARRAY[]::text[])
  INTO _resolved_diet, _prefs
  FROM public.user_diet_profiles
  WHERE user_id = _row.user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  _resolved_diet := COALESCE(_resolved_diet, 'veg');
  IF array_length(_prefs, 1) IS NULL THEN
    _prefs := ARRAY[_resolved_diet];
  END IF;

  _is_vegan := _resolved_diet = 'vegan' OR 'vegan' = ANY(_prefs);
  _is_veg := _is_vegan OR _resolved_diet IN ('veg', 'jain') OR 'veg' = ANY(_prefs) OR 'jain' = ANY(_prefs);
  _is_eggitarian := _resolved_diet = 'eggitarian' OR 'eggitarian' = ANY(_prefs);
  _is_nonveg := (_resolved_diet = 'non_veg' OR 'non_veg' = ANY(_prefs)) AND NOT _is_veg AND NOT _is_eggitarian;

  IF _is_vegan THEN
    _diet_filter := ARRAY['vegan'];
  ELSIF _is_veg AND NOT _is_nonveg AND NOT _is_eggitarian THEN
    _diet_filter := ARRAY['vegan','veg'];
  ELSIF _is_eggitarian AND NOT _is_nonveg THEN
    _diet_filter := ARRAY['vegan','veg'];
  ELSIF _is_nonveg THEN
    _diet_filter := ARRAY['vegan','veg','non_veg'];
  ELSE
    _diet_filter := ARRAY['vegan','veg'];
  END IF;

  SELECT recs, allergen_ids, sub_prefs INTO _recs, _allergens, _sub
  FROM public.bbdo_user_diet_gating(_row.user_id);

  _recs := COALESCE(_recs, ARRAY['encourage','moderate']);
  _allergens := COALESCE(_allergens, ARRAY[]::uuid[]);
  _sub := COALESCE(_sub, ARRAY[]::text[]);
  _skip_dairy := _is_vegan OR ('dairy_free' = ANY(_sub));
  _skip_gluten := 'gluten_free' = ANY(_sub);
  _jain := _resolved_diet = 'jain' OR 'jain' = ANY(_prefs) OR 'jain' = ANY(_sub);

  SELECT COALESCE(array_agg(value::text), ARRAY[]::text[]) INTO _old_items
  FROM jsonb_array_elements_text(COALESCE(_row.plate_data->'items', '[]'::jsonb)) AS value;

  _use_nonveg := _is_nonveg AND NOT _is_vegan AND NOT _is_eggitarian;

  IF _row.meal_slot = 'first_meal' THEN
    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = CASE WHEN _use_nonveg THEN _f_protein_nv ELSE _f_protein_veg END
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'fp')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _use_nonveg THEN 'Eggs' ELSE 'Tofu' END);

    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_alt_grain
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'fg')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _skip_gluten THEN 'Quinoa' ELSE 'Oats' END);

    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_fats
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'ff')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Olive Oil');
  ELSIF _row.meal_slot = 'mid_bite' THEN
    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_nuts
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'mn')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Almonds');

    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = CASE WHEN _skip_dairy THEN _f_fats ELSE _f_dairy END
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'md')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _skip_dairy THEN 'Avocado' ELSE 'Greek Yogurt' END);
  ELSE
    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = CASE WHEN _use_nonveg THEN _f_protein_nv ELSE _f_protein_veg END
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'lp')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _use_nonveg THEN 'Chicken' ELSE 'Paneer' END);

    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_veg
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'lv')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Broccoli');

    SELECT name INTO _candidate
    FROM public.food_items
    WHERE is_active
      AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_fats
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'lf')
    LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Avocado');
  END IF;

  _title := array_to_string(_items, ' + ');
  _plate := jsonb_build_object('title', _title, 'items', to_jsonb(_items), 'diet', _resolved_diet, 'shuffled_at', now());

  UPDATE public.diet_platings
  SET plate_data = _plate
  WHERE id = _plate_id;

  RETURN _plate;
END;
$function$;

REVOKE ALL ON FUNCTION public.swap_diet_plate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_diet_plate(uuid, integer) TO authenticated, service_role;