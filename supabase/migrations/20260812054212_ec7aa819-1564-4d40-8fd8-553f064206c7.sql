ALTER TABLE public.coupon_campaigns
  ADD COLUMN IF NOT EXISTS applicable_cycles text[],
  ADD COLUMN IF NOT EXISTS applicable_plan_keys text[],
  ADD COLUMN IF NOT EXISTS total_redemption_limit integer;

DROP FUNCTION IF EXISTS public.redeem_coupon(text, numeric, text);
DROP FUNCTION IF EXISTS public.validate_coupon(text, numeric);

CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _amount numeric, _plan_key text DEFAULT NULL, _billing_cycle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.coupons;
  camp public.coupon_campaigns;
  disc numeric;
  used_total integer;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(trim(_code));
  IF NOT FOUND OR NOT c.active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid coupon code');
  END IF;
  SELECT * INTO camp FROM public.coupon_campaigns WHERE id = c.campaign_id;
  IF NOT camp.active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is no longer active');
  END IF;
  IF camp.start_date > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is not active yet');
  END IF;
  IF camp.end_date IS NOT NULL AND camp.end_date < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon has expired');
  END IF;
  IF c.max_redemptions IS NOT NULL AND c.redeemed_count >= c.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon has already been used');
  END IF;

  IF camp.total_redemption_limit IS NOT NULL THEN
    SELECT count(*) INTO used_total FROM public.coupon_redemptions WHERE campaign_id = camp.id;
    IF used_total >= camp.total_redemption_limit THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'This offer has reached its usage limit');
    END IF;
  END IF;

  IF camp.applicable_cycles IS NOT NULL AND array_length(camp.applicable_cycles, 1) > 0 THEN
    IF _billing_cycle IS NULL OR NOT (_billing_cycle = ANY (camp.applicable_cycles)) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is not valid for the selected duration');
    END IF;
  END IF;

  IF camp.applicable_plan_keys IS NOT NULL AND array_length(camp.applicable_plan_keys, 1) > 0 THEN
    IF _plan_key IS NULL OR NOT (_plan_key = ANY (camp.applicable_plan_keys)) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is not valid for the selected package');
    END IF;
  END IF;

  IF camp.discount_type = 'percent' THEN
    disc := round(coalesce(_amount, 0) * camp.discount_value / 100.0);
  ELSE
    disc := least(camp.discount_value, coalesce(_amount, 0));
  END IF;
  IF disc < 0 THEN disc := 0; END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'campaign_id', camp.id,
    'code', c.code,
    'name', camp.name,
    'discount_type', camp.discount_type,
    'discount_value', camp.discount_value,
    'discount_amount', disc,
    'final_amount', greatest(coalesce(_amount, 0) - disc, 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text, _amount numeric, _plan_key text DEFAULT NULL, _billing_cycle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  c public.coupons;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'You must be signed in');
  END IF;

  v := public.validate_coupon(_code, _amount, _plan_key, _billing_cycle);
  IF NOT (v->>'valid')::boolean THEN RETURN v; END IF;

  SELECT * INTO c FROM public.coupons WHERE id = (v->>'coupon_id')::uuid FOR UPDATE;
  IF c.max_redemptions IS NOT NULL AND c.redeemed_count >= c.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon has already been used');
  END IF;

  UPDATE public.coupons SET redeemed_count = redeemed_count + 1 WHERE id = c.id;

  INSERT INTO public.coupon_redemptions (coupon_id, campaign_id, user_id, code, plan_key, original_amount, discount_amount, final_amount)
  VALUES (c.id, c.campaign_id, auth.uid(), c.code, _plan_key, _amount, (v->>'discount_amount')::numeric, (v->>'final_amount')::numeric);

  RETURN v;
END;
$function$;