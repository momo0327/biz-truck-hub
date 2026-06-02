ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

GRANT SELECT (first_name, last_name) ON public.profiles TO authenticated;
GRANT UPDATE (first_name, last_name) ON public.profiles TO authenticated;
