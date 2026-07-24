CREATE OR REPLACE FUNCTION public.get_coach_commission_summary(_coach_id uuid)
RETURNS TABLE (
  total_assigned integer,
  total_paying integer,
  total_monthly_revenue numeric,
  monthly_commission numeric,
  commission_percent numeric,
  commission_name text,
  payout_frequency text,
  plan_name text,
  plan_users integer,
  plan_monthly_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_coach AS (
    SELECT c.id, c.commission_model_id
    FROM public.coaches c
    WHERE c.id = _coach_id
      AND c.is_active = true
      AND (
        c.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
    LIMIT 1
  ),
  assigned_model AS (
    SELECT cm.name, cm.percent, cm.payout_frequency
    FROM current_coach cc
    JOIN public.commission_models cm ON cm.id = cc.commission_model_id
    WHERE cm.is_active = true
    LIMIT 1
  ),
  default_model AS (
    SELECT cm.name, cm.percent, cm.payout_frequency
    FROM current_coach cc
    CROSS JOIN public.commission_models cm
    WHERE cm.is_default = true
      AND cm.is_active = true
      AND NOT EXISTS (SELECT 1 FROM assigned_model)
    ORDER BY cm.percent ASC
    LIMIT 1
  ),
  selected_model AS (
    SELECT * FROM assigned_model
    UNION ALL
    SELECT * FROM default_model
    LIMIT 1
  ),
  assigned AS (
    SELECT ca.user_id
    FROM current_coach cc
    JOIN public.coach_assignments ca ON ca.coach_id = cc.id
    WHERE ca.is_active = true
  ),
  active_subs AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id,
      COALESCE(NULLIF(s.plan_name, ''), 'Unnamed plan') AS plan_name,
      COALESCE(s.plan_price, 0)::numeric AS plan_price,
      GREATEST(COALESCE(s.duration_months, 1), 1)::numeric AS duration_months
    FROM public.subscriptions s
    JOIN assigned a ON a.user_id = s.user_id
    WHERE s.status = 'active'
    ORDER BY s.user_id, COALESCE(s.plan_price, 0) DESC, s.created_at DESC
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*)::integer FROM assigned) AS total_assigned,
      COUNT(*)::integer AS total_paying,
      COALESCE(SUM(active_subs.plan_price / active_subs.duration_months), 0)::numeric AS total_monthly_revenue
    FROM active_subs
  ),
  grouped AS (
    SELECT
      active_subs.plan_name,
      COUNT(*)::integer AS plan_users,
      COALESCE(SUM(active_subs.plan_price / active_subs.duration_months), 0)::numeric AS plan_monthly_revenue
    FROM active_subs
    GROUP BY active_subs.plan_name
  )
  SELECT
    t.total_assigned,
    t.total_paying,
    t.total_monthly_revenue,
    (t.total_monthly_revenue * (COALESCE(m.percent, 0)::numeric / 100))::numeric AS monthly_commission,
    COALESCE(m.percent, 0)::numeric AS commission_percent,
    COALESCE(m.name, 'Standard')::text AS commission_name,
    COALESCE(m.payout_frequency, 'monthly')::text AS payout_frequency,
    g.plan_name::text,
    COALESCE(g.plan_users, 0)::integer AS plan_users,
    COALESCE(g.plan_monthly_revenue, 0)::numeric AS plan_monthly_revenue
  FROM current_coach cc
  CROSS JOIN totals t
  CROSS JOIN selected_model m
  LEFT JOIN grouped g ON true
  ORDER BY g.plan_monthly_revenue DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_coach_commission_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_commission_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_commission_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_commission_summary(uuid) TO service_role;