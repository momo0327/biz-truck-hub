
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS elks_call_id text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS duration integer,
  ADD COLUMN IF NOT EXISTS to_number text,
  ADD COLUMN IF NOT EXISTS direction text;

ALTER TABLE public.call_logs ALTER COLUMN note SET DEFAULT '';
ALTER TABLE public.call_logs ALTER COLUMN note DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS call_logs_elks_call_id_idx ON public.call_logs(elks_call_id) WHERE elks_call_id IS NOT NULL;

DO $$ BEGIN
  CREATE POLICY "Owner update calls" ON public.call_logs FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
