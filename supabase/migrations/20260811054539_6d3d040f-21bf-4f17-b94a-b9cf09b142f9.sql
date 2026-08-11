ALTER TABLE public.coaches RENAME COLUMN years_experience TO bbdo_community_exp;

DROP VIEW IF EXISTS public.coaches_public;
CREATE VIEW public.coaches_public AS
SELECT id, name, bio, description, specialization, coach_type,
       bbdo_community_exp, total_consultations, avg_rating, total_ratings,
       avatar_url, languages, qualification, city, is_active
FROM public.coaches
WHERE is_active = true;

GRANT SELECT ON public.coaches_public TO anon, authenticated;
GRANT ALL ON public.coaches_public TO service_role;