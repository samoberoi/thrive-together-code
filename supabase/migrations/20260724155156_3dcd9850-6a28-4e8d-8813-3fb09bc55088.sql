CREATE OR REPLACE FUNCTION public.bbdo_food_filter_id(_names text[])
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM public.food_filters
  WHERE lower(name) = ANY(SELECT lower(unnest(_names)))
  ORDER BY array_position(_names, name), name
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.generate_diet_plating(_user_id uuid, _diet text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _start date := current_date;
  _resolved_diet text;
  _profile_diet text;
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
  _diet_filter text[];
  _use_nonveg boolean;
  _seed text := extract(epoch from clock_timestamp())::text;

  _f_lean uuid := public.bbdo_food_filter_id(ARRAY['Lean Proteins']);
  _f_veg_protein uuid := public.bbdo_food_filter_id(ARRAY['Veg / Vegan Proteins']);
  _f_dairy uuid := public.bbdo_food_filter_id(ARRAY['Dairy/ Milk Alternatives','Milk & Milk Sugars']);
  _f_fats uuid := public.bbdo_food_filter_id(ARRAY['Healthy Fats']);
  _f_nuts uuid := public.bbdo_food_filter_id(ARRAY['Nuts & Seeds']);
  _f_grain uuid := public.bbdo_food_filter_id(ARRAY['Rice & Wheat Alternatives','High-Carb Staple Foods']);
  _f_veg uuid := public.bbdo_food_filter_id(ARRAY['Vegetables']);
  _f_fruit uuid := public.bbdo_food_filter_id(ARRAY['Fruits & Fruit Sugars']);
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.coach_owns_patient(_user_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT lifestyle->>'diet' INTO _profile_diet
  FROM public.profiles
  WHERE user_id = _user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF _diet IS NULL OR length(trim(_diet)) = 0 THEN
    SELECT
      public.bbdo_normalize_diet_preference(COALESCE(NULLIF(diet_preference, ''), _profile_diet, 'mixed')),
      COALESCE(ARRAY(SELECT public.bbdo_normalize_diet_preference(x) FROM unnest(COALESCE(diet_preferences, '{}'::text[])) AS x), ARRAY[]::text[])
    INTO _resolved_diet, _prefs
    FROM public.user_diet_profiles
    WHERE user_id = _user_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
    _resolved_diet := COALESCE(_resolved_diet, public.bbdo_normalize_diet_preference(_profile_diet), 'mixed');
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

  IF array_length(_prefs, 1) IS NULL THEN _prefs := ARRAY[_resolved_diet]; END IF;

  _is_vegan := _resolved_diet = 'vegan' OR 'vegan' = ANY(_prefs);
  _is_veg := _is_vegan OR _resolved_diet IN ('veg', 'jain') OR 'veg' = ANY(_prefs) OR 'jain' = ANY(_prefs);
  _is_nonveg := _resolved_diet = 'non_veg' OR 'non_veg' = ANY(_prefs) OR _resolved_diet = 'mixed';
  _is_eggitarian := _resolved_diet = 'eggitarian' OR 'eggitarian' = ANY(_prefs);

  IF _is_vegan THEN
    _diet_filter := ARRAY['vegan'];
  ELSIF _is_nonveg OR _resolved_diet = 'mixed' THEN
    _diet_filter := ARRAY['vegan','veg','non_veg','eggitarian'];
  ELSIF _is_eggitarian THEN
    _diet_filter := ARRAY['vegan','veg','eggitarian'];
  ELSE
    _diet_filter := ARRAY['vegan','veg'];
  END IF;

  DELETE FROM public.diet_platings
   WHERE user_id = _user_id AND plan_start_date = _start;

  FOR _d IN 0..29 LOOP
    _use_nonveg := CASE
      WHEN _is_vegan OR (_is_veg AND NOT _is_nonveg AND NOT _is_eggitarian) THEN false
      WHEN _is_nonveg THEN (_d % 2 = 0 OR _resolved_diet = 'non_veg')
      WHEN _is_eggitarian THEN (_d % 3 = 0)
      ELSE false
    END;

    FOREACH _slot IN ARRAY _slots LOOP
      _items := ARRAY[]::text[];

      IF _slot = 'first_meal' THEN
        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = CASE WHEN _use_nonveg AND NOT _is_vegan THEN _f_lean ELSE _f_veg_protein END
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'protein') LIMIT 1;
        _items := _items || COALESCE(_title, CASE WHEN _use_nonveg THEN 'Eggs' ELSE 'Tofu' END);

        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_grain
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'grain') LIMIT 1;
        _items := _items || COALESCE(_title, 'Oats');

        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_fats
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'fat') LIMIT 1;
        _items := _items || COALESCE(_title, 'Avocado');
        _cal := 420;
      ELSIF _slot = 'mid_bite' THEN
        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_nuts
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'nuts') LIMIT 1;
        _items := _items || COALESCE(_title, 'Almonds');

        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = CASE WHEN _is_vegan THEN COALESCE(_f_fruit, _f_fats) ELSE _f_dairy END
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'side') LIMIT 1;
        _items := _items || COALESCE(_title, CASE WHEN _is_vegan THEN 'Avocado' ELSE 'Greek Yogurt' END);
        _cal := 220;
      ELSE
        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = CASE WHEN _use_nonveg AND NOT _is_vegan THEN _f_lean ELSE _f_veg_protein END
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'protein') LIMIT 1;
        _items := _items || COALESCE(_title, CASE WHEN _use_nonveg THEN 'Chicken' ELSE 'Paneer' END);

        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_veg
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'veg') LIMIT 1;
        _items := _items || COALESCE(_title, 'Broccoli');

        SELECT name INTO _title FROM public.food_items
        WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
          AND filter_id = _f_fats
        ORDER BY md5(id::text || _seed || _d::text || _slot || 'fat') LIMIT 1;
        _items := _items || COALESCE(_title, 'Avocado');
        _cal := 520;
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

CREATE OR REPLACE FUNCTION public.swap_diet_plate(_plate_id uuid, _seed integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _row public.diet_platings%ROWTYPE;
  _resolved_diet text;
  _profile_diet text;
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
  _plate jsonb;
  _seed_txt text := COALESCE(_seed::text, floor(random() * 1000000000)::text) || extract(epoch from clock_timestamp())::text;
  _f_lean uuid := public.bbdo_food_filter_id(ARRAY['Lean Proteins']);
  _f_veg_protein uuid := public.bbdo_food_filter_id(ARRAY['Veg / Vegan Proteins']);
  _f_dairy uuid := public.bbdo_food_filter_id(ARRAY['Dairy/ Milk Alternatives','Milk & Milk Sugars']);
  _f_fats uuid := public.bbdo_food_filter_id(ARRAY['Healthy Fats']);
  _f_nuts uuid := public.bbdo_food_filter_id(ARRAY['Nuts & Seeds']);
  _f_grain uuid := public.bbdo_food_filter_id(ARRAY['Rice & Wheat Alternatives','High-Carb Staple Foods']);
  _f_veg uuid := public.bbdo_food_filter_id(ARRAY['Vegetables']);
  _f_fruit uuid := public.bbdo_food_filter_id(ARRAY['Fruits & Fruit Sugars']);
BEGIN
  SELECT * INTO _row FROM public.diet_platings WHERE id = _plate_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Plate not found'; END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> _row.user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.coach_owns_patient(_row.user_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT lifestyle->>'diet' INTO _profile_diet
  FROM public.profiles
  WHERE user_id = _row.user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  SELECT
    public.bbdo_normalize_diet_preference(COALESCE(NULLIF(diet_preference, ''), _profile_diet, 'mixed')),
    COALESCE(ARRAY(SELECT public.bbdo_normalize_diet_preference(x) FROM unnest(COALESCE(diet_preferences, '{}'::text[])) AS x), ARRAY[]::text[])
  INTO _resolved_diet, _prefs
  FROM public.user_diet_profiles
  WHERE user_id = _row.user_id
  ORDER BY updated_at DESC NULLS LAST LIMIT 1;

  _resolved_diet := COALESCE(_resolved_diet, public.bbdo_normalize_diet_preference(_profile_diet), 'mixed');
  IF array_length(_prefs, 1) IS NULL THEN _prefs := ARRAY[_resolved_diet]; END IF;

  _is_vegan := _resolved_diet = 'vegan' OR 'vegan' = ANY(_prefs);
  _is_veg := _is_vegan OR _resolved_diet IN ('veg', 'jain') OR 'veg' = ANY(_prefs) OR 'jain' = ANY(_prefs);
  _is_nonveg := _resolved_diet = 'non_veg' OR 'non_veg' = ANY(_prefs) OR _resolved_diet = 'mixed';
  _is_eggitarian := _resolved_diet = 'eggitarian' OR 'eggitarian' = ANY(_prefs);

  IF _is_vegan THEN
    _diet_filter := ARRAY['vegan'];
  ELSIF _is_nonveg OR _resolved_diet = 'mixed' THEN
    _diet_filter := ARRAY['vegan','veg','non_veg','eggitarian'];
  ELSIF _is_eggitarian THEN
    _diet_filter := ARRAY['vegan','veg','eggitarian'];
  ELSE
    _diet_filter := ARRAY['vegan','veg'];
  END IF;

  SELECT COALESCE(array_agg(value::text), ARRAY[]::text[]) INTO _old_items
  FROM jsonb_array_elements_text(COALESCE(_row.plate_data->'items', '[]'::jsonb)) AS value;

  _use_nonveg := CASE
    WHEN _is_vegan OR (_is_veg AND NOT _is_nonveg AND NOT _is_eggitarian) THEN false
    WHEN _is_nonveg THEN true
    WHEN _is_eggitarian THEN true
    ELSE (_row.day_index % 2 = 0)
  END;

  IF _row.meal_slot = 'first_meal' THEN
    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = CASE WHEN _use_nonveg AND NOT _is_vegan THEN _f_lean ELSE _f_veg_protein END
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'protein') LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _use_nonveg THEN 'Eggs' ELSE 'Tofu' END);

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_grain AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'grain') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Oats');

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_fats AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'fat') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Avocado');
  ELSIF _row.meal_slot = 'mid_bite' THEN
    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_nuts AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'nuts') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Almonds');

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = CASE WHEN _is_vegan THEN COALESCE(_f_fruit, _f_fats) ELSE _f_dairy END
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'side') LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _is_vegan THEN 'Avocado' ELSE 'Greek Yogurt' END);
  ELSE
    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = CASE WHEN _use_nonveg AND NOT _is_vegan THEN _f_lean ELSE _f_veg_protein END
      AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'protein') LIMIT 1;
    _items := _items || COALESCE(_candidate, CASE WHEN _use_nonveg THEN 'Chicken' ELSE 'Paneer' END);

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_veg AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'veg') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Broccoli');

    SELECT name INTO _candidate FROM public.food_items
    WHERE is_active AND recommendation IN ('encourage','moderate') AND diet_type::text = ANY(_diet_filter)
      AND filter_id = _f_fats AND NOT (name = ANY(_old_items))
    ORDER BY md5(id::text || _seed_txt || 'fat') LIMIT 1;
    _items := _items || COALESCE(_candidate, 'Avocado');
  END IF;

  _plate := jsonb_build_object('title', array_to_string(_items, ' + '), 'items', to_jsonb(_items), 'diet', _resolved_diet);
  UPDATE public.diet_platings SET plate_data = _plate WHERE id = _plate_id;
  RETURN _plate;
END;
$function$;

REVOKE ALL ON FUNCTION public.bbdo_food_filter_id(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bbdo_food_filter_id(text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_diet_plating(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_diet_plating(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.swap_diet_plate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_diet_plate(uuid, integer) TO authenticated, service_role;