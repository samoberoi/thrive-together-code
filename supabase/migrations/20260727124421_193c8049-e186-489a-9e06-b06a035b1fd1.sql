
UPDATE public.onboarding_grade_bands SET closing_line = NULL, cta_label = 'So what can I do?' WHERE slug = 'severe';
UPDATE public.onboarding_grade_bands SET closing_line = NULL, cta_label = 'So what can I do?' WHERE slug = 'moderate';
UPDATE public.onboarding_grade_bands SET closing_line = 'You''re doing well. Let''s help you stay there – and becoming even healthier.', cta_label = 'So what can I do?' WHERE slug = 'normal';

DELETE FROM public.onboarding_grade_band_cards
WHERE band_id IN (SELECT id FROM public.onboarding_grade_bands WHERE slug IN ('moderate','normal'));

INSERT INTO public.onboarding_grade_band_cards (band_id, title, description, icon, sort_order, is_active)
SELECT b.id, v.title, v.description, v.icon, v.sort_order, true
FROM public.onboarding_grade_bands b
JOIN (VALUES
  ('moderate','Early Insulin Resistance','Your cells are becoming less responsive to insulin—but this can improve.','Shield',1),
  ('moderate','Growing Visceral Fat','Extra fat around your organs may increase future metabolic risk.','Flame',2),
  ('moderate','Lifestyle Habits','Small improvements in food, movement and sleep can make a big difference.','Sunrise',3),
  ('normal','Healthy Insulin Function','Your body is responding well to insulin. Keep it that way with consistent choices.','ShieldCheck',1),
  ('normal','Healthy Fat Distribution','Maintaining a healthy waist helps protect your organs and supports long-term health.','Activity',2),
  ('normal','Lifestyle Advantage','Consistent habits today help prevent tomorrow''s metabolic disease and keep you feeling your best.','Leaf',3)
) AS v(slug,title,description,icon,sort_order) ON v.slug = b.slug;
