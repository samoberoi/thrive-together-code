GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_push_tokens TO authenticated;
GRANT ALL ON public.device_push_tokens TO service_role;

DROP POLICY IF EXISTS "Users can view own device tokens" ON public.device_push_tokens;
DROP POLICY IF EXISTS "Users can insert own device tokens" ON public.device_push_tokens;
DROP POLICY IF EXISTS "Users can update own device tokens" ON public.device_push_tokens;
DROP POLICY IF EXISTS "Users can delete own device tokens" ON public.device_push_tokens;
DROP POLICY IF EXISTS "Users can manage own device tokens" ON public.device_push_tokens;

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own device tokens"
ON public.device_push_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own device tokens"
ON public.device_push_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own device tokens"
ON public.device_push_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own device tokens"
ON public.device_push_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);