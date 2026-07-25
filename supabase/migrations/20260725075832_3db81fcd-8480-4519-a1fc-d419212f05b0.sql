-- Rewrite generator: strict preference-based protein selection
CREATE OR REPLACE FUNCTION public.generate_diet_plating(_user_id uuid, _diet text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _start date := current_date;
  _resolved_diet text;
  _prefs text[] := ARRAY[]::text[];
  _is_vegan boolean;
  _is_veg boolean;
  _is_nonveg boolean;
  _is_eggitarian boolean;
  _d integer;
  _count integer := 0;
  _slots text[] := ARRAY['first_meal','mid_bite','last_meal'];
  _slot text;
  _plate jsonb;
  _cal integer;
  _items text[];
  _title text;
  _diet_filter text[];        -- broad filter for grains/veg/fats/nuts/dairy
  _protein_filter text[];     -- strict filter for the protein pick
  _protein_food_filter uuid;  -- Veg proteins vs Lean proteins food_filters row
  _seed text := extract(epoch from clock_timestamp())::text;
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
  _candidate text;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.coach_owns_patient(_user_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _f_protein_veg FROM public.food_filters WHERE name ILIKE 'Veg / Vegan Proteins' LIMIT 1;
  SELECT id INTO _f_protein_nv  FROM public.food_filters WHERE name ILIKE 'Lean Proteins' LIMIT 1;
  SELECT id INTO _f_dairy       FROM public.food_filters WHERE name ILIKE 'Dairy/ Milk Alternatives' LIMIT 1;
  SELECT id INTO _f_fats        FROM public.food_filters WHERE name ILIKE 'Healthy Fats' LIMIT 1;
  SELECT id INTO _f_nuts        FROM public.food_filters WHERE name ILIKE 'Nuts & Seeds' LIMIT 1;
  SELECT id INTO _f_alt_grain   FROM public.food_filters WHERE name ILIKE 'Rice & Wheat Alternatives' LIMIT 1;
  SELECT id INTO _f_veg         FROM public.food_filters WHERE name ILIKE 'Vegetables' LIMIT 1;

  IF _diet IS NULL OR length(trim(_diet)) = 0 THEN
    SELECT
      public.bbdo_normalize_diet_preference(COALESCE(diet_preference, 'mixed')),
      COALESCE(ARRAY(SELECT public.bbdo_normalize_diet_preference(x) FROM unnest(COALESCE(diet_preferences, '{}'::text[])) AS x), ARRAY[]::text[])
    INTO _resolved_diet, _prefs
    FROM public.user_diet_profiles
    WHERE user_id = _user_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
    _resolved_diet := COALESCE(_resolved_diet, 'veg');
  ELSE
    _resolved_diet := public.bbdo_normalize_diet_preference(_diet);
    _prefs := ARRAY[_resolved_diet];
    INSERT INTO public.user_diet_profiles (user_id, diet_preference, diet_preferences)
    VALUES (_user_id, _resolved_diet, _prefs)
    ON CONFLICT (user_id) DO UPDATE
      SET diet_preference = EXCLUDED.diet_preference,
          diet_preferences = EXCLUDED.diet_preferences,
          updated_at = now();
  END IF;

  IF array_length(_prefs, 1) IS NULL THEN
    _prefs := ARRAY[_resolved_diet];
  END IF;

  _is_vegan      := _resolved_diet = 'vegan' OR 'vegan' = ANY(_prefs);
  _is_nonveg     := _resolved_diet = 'non_veg' OR 'non_veg' = ANY(_prefs);
  _is_eggitarian := (_resolved_diet = 'eggitarian' OR 'eggitarian' = ANY(_prefs)) AND NOT _is_nonveg;
  _is_veg        := (_is_vegan OR _resolved_diet IN ('veg','jain') OR 'veg' = ANY(_prefs) OR 'jain' = ANY(_prefs))
                    AND NOT _is_nonveg AND NOT _is_eggitarian;

  -- Broad diet filter for non-protein items
  IF _is_vegan THEN
    _diet_filter := ARRAY['vegan'];
  ELSIF _is_veg THEN
    _diet_filter := ARRAY['vegan','veg'];
  ELSIF _is_eggitarian THEN
    _diet_filter := ARRAY['vegan','veg','eggitarian'];
  ELSIF _is_nonveg THEN
    _diet_filter := ARRAY['vegan','veg','non_veg','eggitarian'];
  ELSE
    _diet_filter := ARRAY['vegan','veg'];
  END IF;

  -- Strict protein filter based on preference
  IF _is_vegan THEN
    _protein_filter := ARRAY['vegan'];
    _protein_food_filter := _f_protein_veg;
  ELSIF _is_veg THEN
    _protein_filter := ARRAY['vegan','veg'];
    _protein_food_filter := _f_protein_veg;
  ELSIF _is_eggitarian THEN
    _protein_filter := ARRAY['eggitarian'];
    _protein_food_filter := _f_protein_nv;
  ELSIF _is_nonveg THEN
    _protein_filter := ARRAY['non_veg'];
    _protein_food_filter := _f_protein_nv;
  ELSE
    _protein_filter := ARRAY['vegan','veg'];
    _protein_food_filter := _f_protein_veg;
  END IF;

  SELECT recs, allergen_ids, sub_prefs INTO _recs, _allergens, _sub
  FROM public.bbdo_user_diet_gating(_user_id);

  _recs := COALESCE(_recs, ARRAY['encourage','moderate']);
  _allergens := COALESCE(_allergens, ARRAY[]::uuid[]);
  _sub := COALESCE(_sub, ARRAY[]::text[]);
  _skip_dairy := _is_vegan OR ('dairy_free' = ANY(_sub));
  _skip_gluten := 'gluten_free' = ANY(_sub);
  _jain := _resolved_diet = 'jain' OR 'jain' = ANY(_prefs) OR 'jain' = ANY(_sub);

  DELETE FROM public.diet_platings
  WHERE user_id = _user_id AND plan_start_date = _start;

  FOR _d IN 0..29 LOOP
    FOREACH _slot IN ARRAY _slots LOOP
      _items := ARRAY[]::text[];
      _cal := CASE _slot WHEN 'first_meal' THEN 420 WHEN 'mid_bite' THEN 180 ELSE 480 END;

      IF _slot = 'first_meal' THEN
        -- Protein (strict by preference, fallback broad)
        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_protein_filter)
          AND filter_id = _protein_food_filter
          AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'fp') LIMIT 1;
        IF _candidate IS NULL AND _is_nonveg THEN
          SELECT name INTO _candidate FROM public.food_items
          WHERE is_active AND recommendation::text = ANY(_recs)
            AND diet_type::text = ANY(_diet_filter)
            AND filter_id = _f_protein_nv
            AND NOT (id = ANY(_allergens))
            AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
            AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          ORDER BY md5(id::text || _d::text || _seed || 'fpx') LIMIT 1;
        END IF;
        _items := _items || COALESCE(_candidate, CASE WHEN _is_nonveg THEN 'Eggs' WHEN _is_eggitarian THEN 'Eggs' ELSE 'Tofu' END);

        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_alt_grain AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'fg') LIMIT 1;
        _items := _items || COALESCE(_candidate, CASE WHEN _skip_gluten THEN 'Quinoa' ELSE 'Oats' END);

        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_fats AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'ff') LIMIT 1;
        _items := _items || COALESCE(_candidate, 'Olive Oil');

      ELSIF _slot = 'mid_bite' THEN
        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_nuts AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'mn') LIMIT 1;
        _items := _items || COALESCE(_candidate, 'Almonds');

        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_diet_filter)
          AND filter_id = CASE WHEN _skip_dairy THEN _f_fats ELSE _f_dairy END
          AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'md') LIMIT 1;
        _items := _items || COALESCE(_candidate, CASE WHEN _skip_dairy THEN 'Avocado' ELSE 'Greek Yogurt' END);

      ELSE
        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_protein_filter)
          AND filter_id = _protein_food_filter
          AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'lp') LIMIT 1;
        IF _candidate IS NULL AND _is_nonveg THEN
          SELECT name INTO _candidate FROM public.food_items
          WHERE is_active AND recommendation::text = ANY(_recs)
            AND diet_type::text = ANY(_diet_filter)
            AND filter_id = _f_protein_nv
            AND NOT (id = ANY(_allergens))
            AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
            AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          ORDER BY md5(id::text || _d::text || _seed || 'lpx') LIMIT 1;
        END IF;
        _items := _items || COALESCE(_candidate, CASE WHEN _is_nonveg THEN 'Chicken' WHEN _is_eggitarian THEN 'Egg Bhurji' ELSE 'Paneer' END);

        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_veg AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'lv') LIMIT 1;
        _items := _items || COALESCE(_candidate, 'Broccoli');

        SELECT name INTO _candidate FROM public.food_items
        WHERE is_active AND recommendation::text = ANY(_recs)
          AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_fats AND NOT (id = ANY(_allergens))
          AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
          AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
          AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
        ORDER BY md5(id::text || _d::text || _seed || 'lf') LIMIT 1;
        _items := _items || COALESCE(_candidate, 'Avocado');
      END IF;

      _title := array_to_string(_items, ' + ');
      _plate := jsonb_build_object('title', _title, 'items', to_jsonb(_items), 'diet', _resolved_diet);

      INSERT INTO public.diet_platings (user_id, plan_start_date, day_index, meal_slot, plate_data, calories)
      VALUES (_user_id, _start, _d, _slot, _plate, _cal);
      _count := _count + 1;
    END LOOP;
  END LOOP;

  RETURN _count;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_diet_plating(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_diet_plating(uuid, text) TO authenticated, service_role;

-- Update shuffle to use same strict-per-preference protein filter
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
  _protein_filter text[];
  _protein_food_filter uuid;
  _is_vegan boolean;
  _is_veg boolean;
  _is_nonveg boolean;
  _is_eggitarian boolean;
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
  SELECT id INTO _f_protein_nv  FROM public.food_filters WHERE name ILIKE 'Lean Proteins' LIMIT 1;
  SELECT id INTO _f_dairy       FROM public.food_filters WHERE name ILIKE 'Dairy/ Milk Alternatives' LIMIT 1;
  SELECT id INTO _f_fats        FROM public.food_filters WHERE name ILIKE 'Healthy Fats' LIMIT 1;
  SELECT id INTO _f_nuts        FROM public.food_filters WHERE name ILIKE 'Nuts & Seeds' LIMIT 1;
  SELECT id INTO _f_alt_grain   FROM public.food_filters WHERE name ILIKE 'Rice & Wheat Alternatives' LIMIT 1;
  SELECT id INTO _f_veg         FROM public.food_filters WHERE name ILIKE 'Vegetables' LIMIT 1;

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

  _is_vegan      := _resolved_diet = 'vegan' OR 'vegan' = ANY(_prefs);
  _is_nonveg     := _resolved_diet = 'non_veg' OR 'non_veg' = ANY(_prefs);
  _is_eggitarian := (_resolved_diet = 'eggitarian' OR 'eggitarian' = ANY(_prefs)) AND NOT _is_nonveg;
  _is_veg        := (_is_vegan OR _resolved_diet IN ('veg','jain') OR 'veg' = ANY(_prefs) OR 'jain' = ANY(_prefs))
                    AND NOT _is_nonveg AND NOT _is_eggitarian;

  IF _is_vegan THEN
    _diet_filter := ARRAY['vegan'];
    _protein_filter := ARRAY['vegan']; _protein_food_filter := _f_protein_veg;
  ELSIF _is_veg THEN
    _diet_filter := ARRAY['vegan','veg'];
    _protein_filter := ARRAY['vegan','veg']; _protein_food_filter := _f_protein_veg;
  ELSIF _is_eggitarian THEN
    _diet_filter := ARRAY['vegan','veg','eggitarian'];
    _protein_filter := ARRAY['eggitarian']; _protein_food_filter := _f_protein_nv;
  ELSIF _is_nonveg THEN
    _diet_filter := ARRAY['vegan','veg','non_veg','eggitarian'];
    _protein_filter := ARRAY['non_veg']; _protein_food_filter := _f_protein_nv;
  ELSE
    _diet_filter := ARRAY['vegan','veg'];
    _protein_filter := ARRAY['vegan','veg']; _protein_food_filter := _f_protein_veg;
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

  IF _row.meal_slot = 'first_meal' THEN
    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_protein_filter)
      AND filter_id = _protein_food_filter
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'fp') LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _is_nonveg OR _is_eggitarian THEN 'Eggs' ELSE 'Tofu' END);

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_alt_grain AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'fg') LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _skip_gluten THEN 'Quinoa' ELSE 'Oats' END);

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_fats AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'ff') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Olive Oil');
  ELSIF _row.meal_slot = 'mid_bite' THEN
    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_nuts AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'mn') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Almonds');

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = CASE WHEN _skip_dairy THEN _f_fats ELSE _f_dairy END
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'md') LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _skip_dairy THEN 'Avocado' ELSE 'Greek Yogurt' END);
  ELSE
    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_protein_filter)
      AND filter_id = _protein_food_filter
      AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'lp') LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _is_nonveg THEN 'Chicken' WHEN _is_eggitarian THEN 'Egg Bhurji' ELSE 'Paneer' END);

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_veg AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'lv') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Broccoli');

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation::text = ANY(_recs)
      AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_fats AND NOT (id = ANY(_allergens))
      AND (NOT _skip_dairy OR is_dairy_free IS NOT FALSE)
      AND (NOT _skip_gluten OR is_gluten_free IS NOT FALSE)
      AND (NOT _jain OR is_jain_friendly IS NOT FALSE)
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'lf') LIMIT 1;
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

-- Regenerate today's plates for every user who has one so the fix applies immediately
DO $$
DECLARE _uid uuid;
BEGIN
  FOR _uid IN
    SELECT DISTINCT user_id FROM public.diet_platings WHERE plan_start_date = current_date
  LOOP
    PERFORM public.generate_diet_plating(_uid, NULL);
  END LOOP;
END $$;