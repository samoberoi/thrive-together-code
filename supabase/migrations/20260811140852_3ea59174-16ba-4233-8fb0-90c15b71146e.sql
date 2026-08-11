CREATE TABLE public.coupon_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric NOT NULL DEFAULT 0,
  is_limited boolean NOT NULL DEFAULT true,
  coupon_count integer NOT NULL DEFAULT 0,
  max_redemptions_per_coupon integer NOT NULL DEFAULT 1,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_campaigns TO authenticated;
GRANT ALL ON public.coupon_campaigns TO service_role;
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coupon campaigns" ON public.coupon_campaigns FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.coupon_campaigns(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  max_redemptions integer,
  redeemed_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupons_campaign ON public.coupons(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coupons" ON public.coupons FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.coupon_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  code text NOT NULL,
  plan_key text,
  original_amount numeric,
  discount_amount numeric,
  final_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupon_redemptions_campaign ON public.coupon_redemptions(campaign_id);
CREATE INDEX idx_coupon_redemptions_user ON public.coupon_redemptions(user_id);

GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view all redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view own redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_coupon_campaigns_updated_at BEFORE UPDATE ON public.coupon_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bulk generate unique coupon codes for a campaign (admin only)
CREATE OR REPLACE FUNCTION public.generate_coupons(_campaign_id uuid, _count integer, _prefix text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  camp public.coupon_campaigns;
  made integer := 0;
  attempts integer := 0;
  pfx text;
  newcode text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT * INTO camp FROM public.coupon_campaigns WHERE id = _campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF _count IS NULL OR _count < 1 OR _count > 5000 THEN
    RAISE EXCEPTION 'Count must be between 1 and 5000';
  END IF;

  pfx := upper(regexp_replace(coalesce(_prefix, split_part(camp.name, ' ', 1)), '[^A-Za-z0-9]', '', 'g'));
  pfx := left(coalesce(nullif(pfx, ''), 'BBDO'), 8);

  WHILE made < _count AND attempts < _count * 20 LOOP
    attempts := attempts + 1;
    newcode := pfx || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    BEGIN
      INSERT INTO public.coupons (campaign_id, code, max_redemptions)
      VALUES (_campaign_id, newcode, camp.max_redemptions_per_coupon);
      made := made + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  UPDATE public.coupon_campaigns
  SET coupon_count = (SELECT count(*) FROM public.coupons WHERE campaign_id = _campaign_id)
  WHERE id = _campaign_id;

  RETURN made;
END;
$$;

-- Validate a coupon code against an amount; returns json
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.coupons;
  camp public.coupon_campaigns;
  disc numeric;
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
$$;

-- Redeem a coupon for the signed-in user
CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text, _amount numeric, _plan_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  c public.coupons;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'You must be signed in');
  END IF;

  v := public.validate_coupon(_code, _amount);
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
$$;