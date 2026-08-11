CREATE OR REPLACE FUNCTION public.bbdo_diet_pools(_user_id uuid, _diet text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _resolved_diet text;
  _prefs text[] := ARRAY[]::text[];
  _is_vegan boolean; _is_veg boolean; _is_nonveg boolean; _is_eggitarian boolean;
  _diet_filter text[];
  _recs text[]; _allergens uuid[]; _sub text[];
  _skip_dairy boolean; _skip_gluten boolean; _jain boolean;
  _pools jsonb;
BEGIN
  IF _diet IS NULL OR length(btrim(_diet)) = 0 THEN
    SELECT public.bbdo_normalize_diet_preference(COALESCE(diet_preference,'mixed')),
           COALESCE(ARRAY(SELECT public.bbdo_normalize_diet_preference(x) FROM unnest(COALESCE(diet_preferences,'{}'::text[])) x), ARRAY[]::text[])
      INTO _resolved_diet, _prefs
    FROM public.user_diet_profiles WHERE user_id = _user_id
    ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    _resolved_diet := COALESCE(_resolved_diet,'veg');
  ELSE
    _resolved_diet := public.bbdo_normalize_diet_preference(_diet);
    _prefs := ARRAY[_resolved_diet];
  END IF;
  IF array_length(_prefs,1) IS NULL THEN _prefs := ARRAY[_resolved_diet]; END IF;

  _is_vegan      := _resolved_diet = 'vegan' OR 'vegan' = ANY(_prefs);
  _is_nonveg     := _resolved_diet = 'non_veg' OR 'non_veg' = ANY(_prefs);
  _is_eggitarian := (_resolved_diet = 'eggitarian' OR 'eggitarian' = ANY(_prefs)) AND NOT _is_nonveg;
  _is_veg        := (_is_vegan OR _resolved_diet IN ('veg','jain') OR 'veg' = ANY(_prefs) OR 'jain' = ANY(_prefs))
                    AND NOT _is_nonveg AND NOT _is_eggitarian;

  IF _is_vegan THEN _diet_filter := ARRAY['vegan'];
  ELSIF _is_veg THEN _diet_filter := ARRAY['vegan','veg'];
  ELSIF _is_eggitarian THEN _diet_filter := ARRAY['vegan','veg','eggitarian'];
  ELSIF _is_nonveg THEN _diet_filter := ARRAY['vegan','veg','non_veg','eggitarian'];
  ELSE _diet_filter := ARRAY['vegan','veg'];
  END IF;

  SELECT recs, allergen_ids, sub_prefs INTO _recs, _allergens, _sub
  FROM public.bbdo_user_diet_gating(_user_id);
  _recs := COALESCE(_recs, ARRAY['encourage','moderate']);
  _allergens := COALESCE(_allergens, ARRAY[]::uuid[]);
  _sub := COALESCE(_sub, ARRAY[]::text[]);
  _skip_dairy  := _is_vegan OR ('dairy_free' = ANY(_sub));
  _skip_gluten := 'gluten_free' = ANY(_sub);
  _jain        := _resolved_diet = 'jain' OR 'jain' = ANY(_prefs) OR 'jain' = ANY(_sub);

  SELECT COALESCE(jsonb_object_agg(k, arr), '{}'::jsonb) INTO _pools
  FROM (
    SELECT k, jsonb_agg(entry ORDER BY ord) AS arr
    FROM (
      SELECT
        CASE
          WHEN f.name ILIKE 'Lean Proteins' AND i.diet_type::text IN ('non_veg','eggitarian') THEN 'animal'
          WHEN f.name ILIKE 'Lean Proteins' OR f.name ILIKE 'Veg / Vegan Proteins' OR f.name ILIKE 'Pulses & Legumes' THEN 'plant'
          WHEN f.name ILIKE 'Vegetables' THEN 'veg'
          WHEN f.name ILIKE 'Healthy Fats' THEN 'fats'
          WHEN f.name ILIKE 'Nuts & Seeds' THEN 'nuts'
          WHEN f.name ILIKE 'Dairy/ Milk Alternatives' THEN 'dairy'
          WHEN f.name ILIKE 'Rice & Wheat Alternatives' THEN 'grain'
        END AS k,
        jsonb_build_object(
          'name', i.name,
          'portion', COALESCE(NULLIF(btrim(i.household_measure),''), NULLIF(btrim(i.serving_label),''), '1 katori'),
          'kcal', COALESCE(i.calories_kcal, 0)::int
        ) AS entry,
        md5(i.id::text || _user_id::text) AS ord
      FROM public.food_items i
      JOIN public.food_filters f ON f.id = i.filter_id
      WHERE i.is_active
        AND i.recommendation::text = ANY(_recs)
        AND i.diet_type::text = ANY(_diet_filter)
        AND NOT (i.id = ANY(_allergens))
        AND (NOT _skip_dairy  OR i.is_dairy_free  IS NOT FALSE)
        AND (NOT _skip_gluten OR i.is_gluten_free IS NOT FALSE)
        AND (NOT _jain        OR i.is_jain_friendly IS NOT FALSE)
    ) s
    WHERE k IS NOT NULL
    GROUP BY k
  ) t;

  IF _skip_dairy THEN _pools := _pools - 'dairy'; END IF;

  RETURN jsonb_build_object('diet', _resolved_diet, 'pools', _pools);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bbdo_pick(_arr jsonb, _i integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _arr IS NULL OR jsonb_typeof(_arr) <> 'array' OR jsonb_array_length(_arr) = 0 THEN NULL
    ELSE _arr -> (mod(abs(_i), jsonb_array_length(_arr)))
  END
$$;

CREATE OR REPLACE FUNCTION public.bbdo_plate_from_pools(_pools jsonb, _diet text, _slot text, _idx integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _animal jsonb := _pools->'animal';
  _plant  jsonb := _pools->'plant';
  _veg    jsonb := _pools->'veg';
  _fats   jsonb := _pools->'fats';
  _nuts   jsonb := _pools->'nuts';
  _dairy  jsonb := _pools->'dairy';
  _grain  jsonb := _pools->'grain';
  _has_animal boolean := _animal IS NOT NULL AND jsonb_array_length(_animal) > 0;
  _has_plant  boolean := _plant  IS NOT NULL AND jsonb_array_length(_plant)  > 0;
  _prot jsonb;
  _picks jsonb[] := ARRAY[]::jsonb[];
  _p jsonb;
  _items text[] := ARRAY[]::text[];
  _names text[] := ARRAY[]::text[];
  _kcal int := 0;
  _title text;
BEGIN
  IF _slot = 'first_meal' THEN
    _prot := CASE WHEN _has_animal AND mod(_idx, 2) = 0 THEN _animal
                  WHEN _has_plant THEN _plant ELSE _animal END;
    _picks := ARRAY[
      public.bbdo_pick(_prot, _idx),
      public.bbdo_pick(_veg,  _idx),
      public.bbdo_pick(_grain, _idx),
      public.bbdo_pick(_fats, _idx)
    ];
  ELSIF _slot = 'mid_bite' THEN
    _picks := ARRAY[
      public.bbdo_pick(_nuts, _idx),
      COALESCE(public.bbdo_pick(_dairy, _idx), public.bbdo_pick(_fats, _idx + 3))
    ];
  ELSE
    _prot := CASE WHEN _has_animal AND mod(_idx, 2) = 1 THEN _animal
                  WHEN _has_plant THEN _plant ELSE _animal END;
    _picks := ARRAY[
      public.bbdo_pick(_prot, _idx + 1),
      public.bbdo_pick(_veg,  _idx + 2),
      public.bbdo_pick(_veg,  _idx + 5),
      public.bbdo_pick(_fats, _idx + 1)
    ];
  END IF;

  FOREACH _p IN ARRAY _picks LOOP
    IF _p IS NOT NULL AND NOT ((_p->>'name') = ANY(_names)) THEN
      _names := _names || (_p->>'name');
      _items := _items || ((_p->>'name') || ' · ' || COALESCE(NULLIF(_p->>'portion',''), '1 katori'));
      _kcal := _kcal + COALESCE((_p->>'kcal')::int, 0);
    END IF;
  END LOOP;

  IF array_length(_items, 1) IS NULL THEN
    _items := ARRAY['Balanced plate · 1 katori'];
  END IF;
  IF _kcal <= 0 THEN
    _kcal := CASE _slot WHEN 'first_meal' THEN 420 WHEN 'mid_bite' THEN 180 ELSE 480 END;
  END IF;

  _title := array_to_string(ARRAY(SELECT split_part(x, ' · ', 1) FROM unnest(_items) x), ' + ');

  RETURN jsonb_build_object('title', _title, 'items', to_jsonb(_items), 'diet', _diet, 'kcal', _kcal);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_diet_plating(_user_id uuid, _diet text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _start date := current_date;
  _bundle jsonb;
  _pools jsonb;
  _resolved_diet text;
  _d integer;
  _slot text;
  _plate jsonb;
  _count integer := 0;
  _slots text[] := ARRAY['first_meal','mid_bite','last_meal'];
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.coach_owns_patient(_user_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF _diet IS NOT NULL AND length(btrim(_diet)) > 0 THEN
    INSERT INTO public.user_diet_profiles (user_id, diet_preference, diet_preferences)
    VALUES (_user_id, public.bbdo_normalize_diet_preference(_diet), ARRAY[public.bbdo_normalize_diet_preference(_diet)])
    ON CONFLICT (user_id) DO UPDATE
      SET diet_preference = EXCLUDED.diet_preference,
          diet_preferences = EXCLUDED.diet_preferences,
          updated_at = now();
  END IF;

  _bundle := public.bbdo_diet_pools(_user_id, _diet);
  _pools := _bundle->'pools';
  _resolved_diet := _bundle->>'diet';

  DELETE FROM public.diet_platings
  WHERE user_id = _user_id AND plan_start_date = _start;

  FOR _d IN 0..29 LOOP
    FOREACH _slot IN ARRAY _slots LOOP
      _plate := public.bbdo_plate_from_pools(_pools, _resolved_diet, _slot, _d);
      INSERT INTO public.diet_platings (user_id, plan_start_date, day_index, meal_slot, plate_data, calories)
      VALUES (_user_id, _start, _d, _slot, _plate, (_plate->>'kcal')::int);
      _count := _count + 1;
    END LOOP;
  END LOOP;

  RETURN _count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.swap_diet_plate(_plate_id uuid, _seed integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.diet_platings%ROWTYPE;
  _bundle jsonb;
  _pools jsonb;
  _diet text;
  _plate jsonb;
  _idx integer;
  _try integer := 0;
  _old_title text;
BEGIN
  SELECT * INTO _row FROM public.diet_platings WHERE id = _plate_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Plate not found'; END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> _row.user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.coach_owns_patient(_row.user_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  _bundle := public.bbdo_diet_pools(_row.user_id, NULL);
  _pools := _bundle->'pools';
  _diet := _bundle->>'diet';
  _old_title := COALESCE(_row.plate_data->>'title', '');

  _idx := COALESCE(_seed, floor(random() * 100000)::int);
  LOOP
    _plate := public.bbdo_plate_from_pools(_pools, _diet, _row.meal_slot, _idx + _try);
    EXIT WHEN COALESCE(_plate->>'title','') <> _old_title OR _try >= 8;
    _try := _try + 1;
  END LOOP;

  _plate := _plate || jsonb_build_object('shuffled_at', now());

  UPDATE public.diet_platings
  SET plate_data = _plate, calories = (_plate->>'kcal')::int
  WHERE id = _plate_id;

  RETURN _plate;
END;
$function$;