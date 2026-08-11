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

  RETURN jsonb_build_object('title', _title, 'items', to_jsonb(_items), 'diet', _diet, 'kcal', _kcal, 'v', 2);
END;
$function$;

DELETE FROM public.diet_platings d
WHERE d.plan_start_date < (
  SELECT max(plan_start_date) FROM public.diet_platings x WHERE x.user_id = d.user_id
);