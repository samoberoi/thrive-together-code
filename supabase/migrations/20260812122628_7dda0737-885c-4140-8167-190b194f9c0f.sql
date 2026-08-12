CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _amount numeric, _plan_key text DEFAULT NULL, _billing_cycle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.coupons;
  camp public.coupon_campaigns;
  disc numeric;
  used_total integer;
  norm text;
BEGIN
  norm := upper(regexp_replace(coalesce(_code,''), '[^A-Za-z0-9]', '', 'g'));
  IF norm = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid coupon code');
  END IF;

  SELECT * INTO c FROM public.coupons
   WHERE upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')) = norm
   ORDER BY active DESC, created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    -- fall back to matching the campaign name (single-coupon campaigns)
    SELECT co.* INTO c
      FROM public.coupons co
      JOIN public.coupon_campaigns cc ON cc.id = co.campaign_id
     WHERE upper(regexp_replace(cc.name, '[^A-Za-z0-9]', '', 'g')) = norm
     ORDER BY co.active DESC, co.created_at ASC LIMIT 1;
  END IF;

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
$fn$;