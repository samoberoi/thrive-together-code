
-- =========================================================================
-- 1. COACH ASSIGNMENT NOTIFICATION (patient gets notified when coach assigned)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_patient_on_coach_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coach_name TEXT;
BEGIN
  IF NEW.is_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'your coach') INTO _coach_name
  FROM public.coaches WHERE user_id = NEW.coach_id LIMIT 1;

  PERFORM public.create_notification(
    NEW.user_id,
    'Coach assigned 👋',
    _coach_name || ' is now your coach. Say hi and share your goals.',
    'coach_assignment',
    '🧑‍⚕️',
    '/coach'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_patient_on_coach_assigned() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_patient_on_coach_assigned() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_patient_on_coach_assigned ON public.coach_assignments;
CREATE TRIGGER trg_notify_patient_on_coach_assigned
AFTER INSERT ON public.coach_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_patient_on_coach_assigned();

-- =========================================================================
-- 2. COACH VIDEO ASSIGNMENT (yoga / exercise / movement / fasting / stress)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_patient_on_video_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _module_label TEXT;
  _icon TEXT;
  _url TEXT;
BEGIN
  _module_label := COALESCE(NULLIF(NEW.module, ''), 'session');
  CASE NEW.module
    WHEN 'yoga'      THEN _icon := '🧘'; _url := '/home?tab=yoga';
    WHEN 'exercise'  THEN _icon := '🏋️'; _url := '/home?tab=exercise';
    WHEN 'training'  THEN _icon := '🏋️'; _url := '/home?tab=exercise';
    WHEN 'movement'  THEN _icon := '🚶'; _url := '/home?tab=movement';
    WHEN 'fasting'   THEN _icon := '⏱️'; _url := '/home?tab=fasting';
    WHEN 'stress'    THEN _icon := '🌬️'; _url := '/home?tab=stress';
    ELSE _icon := '📺'; _url := '/home';
  END CASE;

  PERFORM public.create_notification(
    NEW.patient_user_id,
    'Your coach assigned a ' || _module_label || ' session',
    'A new ' || _module_label || ' item is waiting in your plan. Tap to start.',
    'coach_assignment',
    _icon,
    _url
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_patient_on_video_assignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_patient_on_video_assignment() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_patient_on_video_assignment ON public.coach_video_assignments;
CREATE TRIGGER trg_notify_patient_on_video_assignment
AFTER INSERT ON public.coach_video_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_patient_on_video_assignment();

-- =========================================================================
-- 3. COACH SUPPLEMENT RECOMMENDATION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_patient_on_supplement_reco()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification(
    NEW.user_id,
    'Coach recommended supplements 💊',
    'Your coach shared a new supplement plan. Tap to review.',
    'coach_assignment',
    '💊',
    '/home?tab=supplements'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_patient_on_supplement_reco() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_patient_on_supplement_reco() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_patient_on_supplement_reco ON public.coach_supplement_recommendations;
CREATE TRIGGER trg_notify_patient_on_supplement_reco
AFTER INSERT ON public.coach_supplement_recommendations
FOR EACH ROW EXECUTE FUNCTION public.notify_patient_on_supplement_reco();

-- =========================================================================
-- 4. COACH TEST / LAB RECOMMENDATION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_patient_on_test_reco()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification(
    NEW.user_id,
    'Coach recommended a lab test 🧪',
    'Your coach shared a new lab test recommendation. Tap to view.',
    'coach_assignment',
    '🧪',
    '/lab-tests'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_patient_on_test_reco() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_patient_on_test_reco() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_patient_on_test_reco ON public.coach_test_recommendations;
CREATE TRIGGER trg_notify_patient_on_test_reco
AFTER INSERT ON public.coach_test_recommendations
FOR EACH ROW EXECUTE FUNCTION public.notify_patient_on_test_reco();

-- =========================================================================
-- 5. NEW SCHEDULED TEMPLATES
--    (water 3x, soleus 3x, yoga morning + afternoon, glucose evening)
-- =========================================================================
INSERT INTO public.notification_templates
  (key, title, trigger_type, category_id, icon, action_url,
   send_time_local, send_days, cooldown_hours, timezone,
   audience_filter, message_variants, is_active)
VALUES
  -- ── Water 3× ────────────────────────────────────────────────────────
  ('water_morning', 'Stay hydrated 💧', 'reminder',
   (SELECT id FROM public.notification_categories WHERE key='health'),
   '💧', '/home?log=water', '09:30:00', ARRAY[1,2,3,4,5,6,7], 4, 'Asia/Kolkata',
   '{"patient_users": true, "missed_water_today": true}'::jsonb,
   to_jsonb(ARRAY[
     'Start the day right — sip a glass of water now.',
     'Hydration check! Grab a glass of water.',
     'Your body woke up thirsty. A glass of water goes a long way.'
   ]), TRUE),
  ('water_afternoon', 'Time for water 💧', 'reminder',
   (SELECT id FROM public.notification_categories WHERE key='health'),
   '💧', '/home?log=water', '14:00:00', ARRAY[1,2,3,4,5,6,7], 4, 'Asia/Kolkata',
   '{"patient_users": true, "missed_water_today": true}'::jsonb,
   to_jsonb(ARRAY[
     'Midday hydration nudge — one more glass, please.',
     'Feeling sluggish? Water first, coffee later.',
     'Log a glass of water and keep the streak going.'
   ]), TRUE),
  ('water_evening', 'Wrap up hydrated 💧', 'reminder',
   (SELECT id FROM public.notification_categories WHERE key='health'),
   '💧', '/home?log=water', '19:30:00', ARRAY[1,2,3,4,5,6,7], 4, 'Asia/Kolkata',
   '{"patient_users": true, "missed_water_today": true}'::jsonb,
   to_jsonb(ARRAY[
     'Evening reminder — top up your water for the day.',
     'Almost there. A last glass to close your hydration goal.',
     'Have a glass of water. Sleep better tonight.'
   ]), TRUE),

  -- ── Soleus push-ups 3× ─────────────────────────────────────────────
  ('soleus_morning', 'Soleus push-ups ✅', 'reminder',
   (SELECT id FROM public.notification_categories WHERE key='movement'),
   '🦵', '/home?tab=movement', '10:00:00', ARRAY[1,2,3,4,5,6,7], 5, 'Asia/Kolkata',
   '{"patient_users": true, "missed_soleus_today": true}'::jsonb,
   to_jsonb(ARRAY[
     '2 minutes of soleus push-ups now — sugars will thank you.',
     'Seated for a while? Do a quick soleus set.',
     'Small heels-up moves, big glucose wins. Log one set.'
   ]), TRUE),
  ('soleus_afternoon', 'Post-lunch soleus set 🦵', 'reminder',
   (SELECT id FROM public.notification_categories WHERE key='movement'),
   '🦵', '/home?tab=movement', '14:30:00', ARRAY[1,2,3,4,5,6,7], 5, 'Asia/Kolkata',
   '{"patient_users": true, "missed_soleus_today": true}'::jsonb,
   to_jsonb(ARRAY[
     'Right after lunch = best soleus window. Go!',
     'Blunt the post-meal spike — do soleus push-ups now.',
     'Sit tall, heels up. Two minutes. Done.'
   ]), TRUE),
  ('soleus_evening', 'Evening soleus 🦵', 'reminder',
   (SELECT id FROM public.notification_categories WHERE key='movement'),
   '🦵', '/home?tab=movement', '19:00:00', ARRAY[1,2,3,4,5,6,7], 5, 'Asia/Kolkata',
   '{"patient_users": true, "missed_soleus_today": true}'::jsonb,
   to_jsonb(ARRAY[
     'Finish strong — squeeze in one more soleus set.',
     'Close the day with a quick soleus push-up round.',
     'Two minutes of heel raises. Then relax.'
   ]), TRUE),

  -- ── Yoga morning + afternoon (evening already exists) ──────────────
  ('yoga_morning', 'Morning yoga 🧘', 'missed_action',
   (SELECT id FROM public.notification_categories WHERE key='stress'),
   '🧘', '/home?tab=yoga', '07:00:00', ARRAY[1,2,3,4,5,6,7], 6, 'Asia/Kolkata',
   '{"patient_users": true, "missed_yoga_today": true}'::jsonb,
   to_jsonb(ARRAY[
     'Start the day grounded — 10 minutes of yoga.',
     'Roll out the mat. Your morning yoga is waiting.',
     'A calm start beats a rushed one. Try a quick flow.'
   ]), TRUE),
  ('yoga_afternoon', 'Afternoon stretch 🧘', 'missed_action',
   (SELECT id FROM public.notification_categories WHERE key='stress'),
   '🧘', '/home?tab=yoga', '15:30:00', ARRAY[1,2,3,4,5,6,7], 6, 'Asia/Kolkata',
   '{"patient_users": true, "missed_yoga_today": true}'::jsonb,
   to_jsonb(ARRAY[
     'Midday tension check — 5 minutes of stretching.',
     'Reset with a short yoga session between meetings.',
     'A brief flow now = calmer evening.'
   ]), TRUE),

  -- ── Evening glucose reminder ───────────────────────────────────────
  ('log_glucose_evening', 'Log evening glucose 🩸', 'reminder',
   (SELECT id FROM public.notification_categories WHERE key='health'),
   '🩸', '/home?log=diabetes', '20:00:00', ARRAY[1,2,3,4,5,6,7], 6, 'Asia/Kolkata',
   '{"patient_users": true, "missed_glucose_evening": true}'::jsonb,
   to_jsonb(ARRAY[
     'Time for your evening blood sugar reading.',
     'Quick prick — log tonight''s glucose.',
     'Close the loop on today''s numbers. Log your glucose.'
   ]), TRUE)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  action_url = EXCLUDED.action_url,
  audience_filter = EXCLUDED.audience_filter,
  message_variants = EXCLUDED.message_variants,
  send_time_local = EXCLUDED.send_time_local,
  is_active = TRUE,
  updated_at = now();
