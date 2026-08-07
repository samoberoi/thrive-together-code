ALTER TABLE public.thyrocare_tests ALTER COLUMN is_active SET DEFAULT false;

UPDATE public.thyrocare_tests
SET is_active = false, coach_assignable = false
WHERE product_code NOT IN ('PROJ1062518','PROJ1062519','PROJ1062521');

UPDATE public.thyrocare_tests
SET is_active = true, coach_assignable = true
WHERE product_code IN ('PROJ1062518','PROJ1062519','PROJ1062521');