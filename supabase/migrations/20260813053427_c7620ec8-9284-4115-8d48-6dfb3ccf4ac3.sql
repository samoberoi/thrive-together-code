-- 1. Safe public-facing partner directory (no bank / contact / commission columns)
CREATE OR REPLACE VIEW public.partner_directory AS
SELECT id, partner_type, name, bio, avatar_url, headline, experience_years,
       certifications, languages, service_locations, instagram_url, website_url,
       city, state, is_active, user_id
FROM public.channel_partners
WHERE is_active = true;

GRANT SELECT ON public.partner_directory TO authenticated;

-- 2. Lock the base table down: only the partner themselves or an admin may read full rows
DROP POLICY IF EXISTS "Anyone signed in can view active partners" ON public.channel_partners;
CREATE POLICY "Partner or admin can view partner rows"
ON public.channel_partners FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 3. app_settings: remove the blanket read policy that overrode admin-only intent
DROP POLICY IF EXISTS "Authenticated can read app settings" ON public.app_settings;
CREATE POLICY "Authenticated can read non sensitive app settings"
ON public.app_settings FOR SELECT TO authenticated
USING (key NOT LIKE '%secret%' AND key NOT LIKE '%key%' AND key NOT LIKE '%token%' AND key NOT LIKE '%password%');

-- 4. Re-scope user-data policies from the public role to authenticated only
DROP POLICY IF EXISTS "Users manage their own video progress" ON public.video_progress;
CREATE POLICY "Users manage their own video progress" ON public.video_progress
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage their own plates" ON public.user_plates;
CREATE POLICY "Users manage their own plates" ON public.user_plates
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage their own breath sessions" ON public.user_breath_sessions;
CREATE POLICY "Users manage their own breath sessions" ON public.user_breath_sessions
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own health snapshots" ON public.apple_health_snapshots;
CREATE POLICY "Users manage own health snapshots" ON public.apple_health_snapshots
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
