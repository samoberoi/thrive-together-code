
UPDATE public.onboarding_grade_band_cards c
SET icon = CASE c.sort_order WHEN 1 THEN 'Lock' WHEN 2 THEN 'Heart' ELSE 'RefreshCw' END
FROM public.onboarding_grade_bands b
WHERE b.id = c.band_id AND b.slug IN ('severe','moderate','normal');
