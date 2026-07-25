-- 1) Reference table
CREATE TABLE IF NOT EXISTS public.bmi_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  min_value numeric(5,2),   -- inclusive; NULL = -infinity
  max_value numeric(5,2),   -- exclusive; NULL = +infinity
  color text,
  sort_order int NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bmi_categories TO anon, authenticated;
GRANT ALL ON public.bmi_categories TO service_role;

ALTER TABLE public.bmi_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bmi_categories_read" ON public.bmi_categories;
CREATE POLICY "bmi_categories_read" ON public.bmi_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "bmi_categories_admin_write" ON public.bmi_categories;
CREATE POLICY "bmi_categories_admin_write" ON public.bmi_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Seed WHO adult bands
INSERT INTO public.bmi_categories (code, label, min_value, max_value, color, sort_order, description) VALUES
  ('underweight',      'Underweight',       NULL,  18.50, '#3B82F6', 1, 'BMI less than 18.5 kg/m²'),
  ('normal',           'Normal weight',    18.50, 25.00, '#10B981', 2, 'BMI 18.5 to 24.9 kg/m²'),
  ('overweight',       'Overweight',       25.00, 30.00, '#F59E0B', 3, 'BMI 25.0 to 29.9 kg/m²'),
  ('obesity_class_1',  'Obesity Class I',  30.00, 35.00, '#F97316', 4, 'BMI 30.0 to 34.9 kg/m²'),
  ('obesity_class_2',  'Obesity Class II', 35.00, 40.00, '#EF4444', 5, 'BMI 35.0 to 39.9 kg/m²'),
  ('obesity_class_3',  'Obesity Class III',40.00,  NULL, '#B91C1C', 6, 'BMI 40.0 kg/m² or higher')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  updated_at = now();

-- 3) Category lookup function
CREATE OR REPLACE FUNCTION public.get_bmi_category(_bmi numeric)
RETURNS TABLE(code text, label text, color text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.code, c.label, c.color
  FROM public.bmi_categories c
  WHERE _bmi IS NOT NULL
    AND (c.min_value IS NULL OR _bmi >= c.min_value)
    AND (c.max_value IS NULL OR _bmi <  c.max_value)
  ORDER BY c.sort_order
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_bmi_category(numeric) TO anon, authenticated;

-- 4) Backfill existing profiles using the WHO bands
UPDATE public.profiles p
SET bmi_category = c.label,
    updated_at = now()
FROM public.bmi_categories c
WHERE p.bmi IS NOT NULL
  AND (c.min_value IS NULL OR p.bmi >= c.min_value)
  AND (c.max_value IS NULL OR p.bmi <  c.max_value)
  AND (p.bmi_category IS DISTINCT FROM c.label);
