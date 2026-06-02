
-- 1) Protect elks_webrtc_password: revoke column-level SELECT from authenticated/anon
REVOKE SELECT (elks_webrtc_password) ON public.profiles FROM authenticated;
REVOKE SELECT (elks_webrtc_password) ON public.profiles FROM anon;
-- Re-grant the other columns explicitly to authenticated (RLS still applies)
GRANT SELECT (id, user_id, display_name, phone_number, display_phone_number,
              elks_webrtc_uri, elks_webrtc_username, created_at, updated_at)
  ON public.profiles TO authenticated;
GRANT UPDATE (display_name, phone_number, display_phone_number,
              elks_webrtc_uri, elks_webrtc_username, elks_webrtc_password)
  ON public.profiles TO authenticated;
-- service_role retains full access for server-side reads of the password.

-- 2) Block self-promotion on user_roles with an explicit RESTRICTIVE policy
DROP POLICY IF EXISTS "Block non-admin role inserts" ON public.user_roles;
CREATE POLICY "Block non-admin role inserts"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_companies(text, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_companies(text, uuid, uuid[]) TO authenticated;
