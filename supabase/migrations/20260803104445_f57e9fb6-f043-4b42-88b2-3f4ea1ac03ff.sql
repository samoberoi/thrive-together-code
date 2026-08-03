CREATE OR REPLACE FUNCTION public.materialize_supplement_reco_to_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_item jsonb;
  v_dose text;
  v_weeks int;
BEGIN
  IF NEW.items IS NULL OR jsonb_array_length(NEW.items) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_plan_id
  FROM public.user_supplement_plans
  WHERE user_id = NEW.user_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.user_supplement_plans (user_id, assigned_by, plan_name, notes, status)
    VALUES (NEW.user_id, NEW.coach_id, 'Coach Plan', NEW.note, 'active')
    RETURNING id INTO v_plan_id;
  ELSE
    UPDATE public.user_supplement_plans
    SET assigned_by = NEW.coach_id,
        notes = COALESCE(NEW.note, notes),
        updated_at = now()
    WHERE id = v_plan_id;

    UPDATE public.user_supplement_plan_items
    SET is_active = false
    WHERE plan_id = v_plan_id AND is_active = true;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
  LOOP
    CONTINUE WHEN NULLIF(v_item->>'supplement_id','') IS NULL;

    v_dose := NULLIF(TRIM(COALESCE(v_item->>'dose', v_item->>'dosage', '')), '');
    v_weeks := GREATEST(1, CEIL(COALESCE(NULLIF(v_item->>'duration_days','')::numeric, 30) / 7.0)::int);

    INSERT INTO public.user_supplement_plan_items
      (plan_id, supplement_id, dosage, timing, duration_weeks, is_active)
    VALUES (
      v_plan_id,
      (v_item->>'supplement_id')::uuid,
      COALESCE(v_dose, 'As directed'),
      COALESCE(NULLIF(TRIM(COALESCE(v_item->>'timing','')), ''), 'with meal'),
      v_weeks,
      true
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_materialize_supplement_reco ON public.coach_supplement_recommendations;
CREATE TRIGGER trg_materialize_supplement_reco
AFTER INSERT ON public.coach_supplement_recommendations
FOR EACH ROW EXECUTE FUNCTION public.materialize_supplement_reco_to_plan();

-- Backfill: materialize the latest recommendation per user that has no active plan items yet
DO $$
DECLARE
  r record;
  v_plan_id uuid;
  v_item jsonb;
  v_dose text;
  v_weeks int;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (user_id) id, user_id, coach_id, items, note
    FROM public.coach_supplement_recommendations
    WHERE jsonb_array_length(items) > 0
    ORDER BY user_id, created_at DESC
  LOOP
    SELECT id INTO v_plan_id
    FROM public.user_supplement_plans
    WHERE user_id = r.user_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_plan_id IS NULL THEN
      INSERT INTO public.user_supplement_plans (user_id, assigned_by, plan_name, notes, status)
      VALUES (r.user_id, r.coach_id, 'Coach Plan', r.note, 'active')
      RETURNING id INTO v_plan_id;
    ELSIF EXISTS (SELECT 1 FROM public.user_supplement_plan_items WHERE plan_id = v_plan_id AND is_active = true) THEN
      CONTINUE;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(r.items)
    LOOP
      CONTINUE WHEN NULLIF(v_item->>'supplement_id','') IS NULL;
      v_dose := NULLIF(TRIM(COALESCE(v_item->>'dose', v_item->>'dosage', '')), '');
      v_weeks := GREATEST(1, CEIL(COALESCE(NULLIF(v_item->>'duration_days','')::numeric, 30) / 7.0)::int);
      INSERT INTO public.user_supplement_plan_items
        (plan_id, supplement_id, dosage, timing, duration_weeks, is_active)
      VALUES (
        v_plan_id,
        (v_item->>'supplement_id')::uuid,
        COALESCE(v_dose, 'As directed'),
        COALESCE(NULLIF(TRIM(COALESCE(v_item->>'timing','')), ''), 'with meal'),
        v_weeks,
        true
      );
    END LOOP;
  END LOOP;
END;
$$;