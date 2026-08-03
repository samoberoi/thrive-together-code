ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS change_type text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS credit_applied integer NOT NULL DEFAULT 0;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'scheduled'::text, 'expired'::text, 'cancelled'::text]));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_change_type_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_change_type_check
  CHECK (change_type = ANY (ARRAY['new'::text, 'upgrade'::text, 'downgrade'::text, 'renewal'::text]));

-- Activate any scheduled subscription whose start date has arrived (and retire the finished one)
CREATE OR REPLACE FUNCTION public.activate_due_subscriptions(_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at <= now()
    AND (_user_id IS NULL OR user_id = _user_id);

  UPDATE public.subscriptions s
  SET status = 'active'
  WHERE s.status = 'scheduled'
    AND s.started_at <= now()
    AND (_user_id IS NULL OR s.user_id = _user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions a
      WHERE a.user_id = s.user_id AND a.status = 'active' AND a.expires_at > now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_due_subscriptions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_due_subscriptions(uuid) TO authenticated, service_role;

-- Preview what a plan change would cost / when it would start
CREATE OR REPLACE FUNCTION public.preview_plan_change(_plan_price integer, _duration_months integer, _mode text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cur public.subscriptions;
  _credit integer := 0;
  _starts timestamptz := now();
  _total_secs numeric;
  _left_secs numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;

  SELECT * INTO _cur FROM public.subscriptions
  WHERE user_id = _uid AND status = 'active' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF _cur.id IS NOT NULL THEN
    IF _mode = 'downgrade' THEN
      _starts := _cur.expires_at;
    ELSIF _mode = 'upgrade' THEN
      _total_secs := GREATEST(1, EXTRACT(EPOCH FROM (_cur.expires_at - _cur.started_at)));
      _left_secs := GREATEST(0, EXTRACT(EPOCH FROM (_cur.expires_at - now())));
      _credit := LEAST(_plan_price, FLOOR(_cur.plan_price * (_left_secs / _total_secs))::int);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'mode', _mode,
    'credit', _credit,
    'amount_due', GREATEST(0, _plan_price - _credit),
    'starts_at', _starts,
    'expires_at', _starts + make_interval(months => _duration_months),
    'current_expires_at', _cur.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_plan_change(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_plan_change(integer, integer, text) TO authenticated, service_role;

-- Perform the plan change
CREATE OR REPLACE FUNCTION public.change_subscription_plan(
  _plan_id text,
  _plan_name text,
  _plan_price integer,
  _duration_months integer,
  _mode text
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cur public.subscriptions;
  _sub public.subscriptions;
  _credit integer := 0;
  _starts timestamptz := now();
  _total_secs numeric;
  _left_secs numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'You must be signed in to complete payment'; END IF;
  IF _plan_id IS NULL OR length(trim(_plan_id)) = 0 THEN RAISE EXCEPTION 'A package must be selected before payment'; END IF;
  IF _plan_name IS NULL OR length(trim(_plan_name)) = 0 THEN RAISE EXCEPTION 'Package name is required'; END IF;
  IF _plan_price IS NULL OR _plan_price < 0 THEN RAISE EXCEPTION 'Package price is invalid'; END IF;
  IF _duration_months IS NULL OR _duration_months < 1 THEN RAISE EXCEPTION 'Package duration is invalid'; END IF;
  IF _mode IS NULL OR _mode NOT IN ('new','upgrade','downgrade','renewal') THEN RAISE EXCEPTION 'Invalid plan change type'; END IF;

  SELECT * INTO _cur FROM public.subscriptions
  WHERE user_id = _uid AND status = 'active' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF _mode = 'downgrade' AND _cur.id IS NULL THEN
    _mode := 'new';
  END IF;

  IF _mode = 'downgrade' THEN
    -- Starts when the current plan ends; current plan stays untouched.
    _starts := _cur.expires_at;
    DELETE FROM public.subscriptions WHERE user_id = _uid AND status = 'scheduled';
  ELSE
    IF _cur.id IS NOT NULL AND _mode = 'upgrade' THEN
      _total_secs := GREATEST(1, EXTRACT(EPOCH FROM (_cur.expires_at - _cur.started_at)));
      _left_secs := GREATEST(0, EXTRACT(EPOCH FROM (_cur.expires_at - now())));
      _credit := LEAST(_plan_price, FLOOR(_cur.plan_price * (_left_secs / _total_secs))::int);
    END IF;
    UPDATE public.subscriptions SET status = 'cancelled'
    WHERE user_id = _uid AND status IN ('active','scheduled');
  END IF;

  INSERT INTO public.subscriptions (
    user_id, plan_id, plan_name, plan_price, duration_months,
    started_at, expires_at, status, change_type, credit_applied
  ) VALUES (
    _uid, trim(_plan_id), trim(_plan_name),
    GREATEST(0, _plan_price - _credit), _duration_months,
    _starts, _starts + make_interval(months => _duration_months),
    CASE WHEN _mode = 'downgrade' THEN 'scheduled' ELSE 'active' END,
    _mode, _credit
  )
  RETURNING * INTO _sub;

  RETURN _sub;
END;
$$;

REVOKE ALL ON FUNCTION public.change_subscription_plan(text, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_subscription_plan(text, text, integer, integer, text) TO authenticated, service_role;