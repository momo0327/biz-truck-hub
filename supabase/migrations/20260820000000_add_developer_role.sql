-- Add developer value to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';

-- Assign developer role to the developer account
-- This runs after the enum is committed so the value is available
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'developer'
FROM auth.users
WHERE lower(email) = 'arriahmed673@gmail.com'
ON CONFLICT DO NOTHING;
