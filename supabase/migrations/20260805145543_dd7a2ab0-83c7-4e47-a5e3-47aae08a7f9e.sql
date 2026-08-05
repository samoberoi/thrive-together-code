WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY recommended_at DESC, created_at DESC) AS rn
  FROM public.thyrocare_recommendations
  WHERE COALESCE(status,'pending') IN ('pending','viewed','booked')
)
UPDATE public.thyrocare_recommendations r
SET status = 'dismissed', updated_at = now()
FROM ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS thyrocare_recommendations_one_open_per_user
ON public.thyrocare_recommendations (user_id)
WHERE COALESCE(status,'pending') IN ('pending','viewed','booked');