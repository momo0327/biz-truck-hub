-- Allow admins to read all call_logs so realtime subscriptions work in the admin dashboard.
CREATE POLICY "Admin select all calls"
  ON public.call_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );
