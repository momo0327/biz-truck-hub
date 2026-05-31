
-- Scheduled calls
CREATE TABLE public.scheduled_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL DEFAULT 'Call',
  note TEXT,
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_calls TO authenticated;
GRANT ALL ON public.scheduled_calls TO service_role;

ALTER TABLE public.scheduled_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select scheduled_calls" ON public.scheduled_calls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert scheduled_calls" ON public.scheduled_calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update scheduled_calls" ON public.scheduled_calls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete scheduled_calls" ON public.scheduled_calls FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all scheduled_calls" ON public.scheduled_calls FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_scheduled_calls_user_time ON public.scheduled_calls(user_id, scheduled_at);
CREATE INDEX idx_scheduled_calls_company ON public.scheduled_calls(company_id);

CREATE TRIGGER update_scheduled_calls_updated_at
  BEFORE UPDATE ON public.scheduled_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Archive folders
CREATE TABLE public.archive_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_folders TO authenticated;
GRANT ALL ON public.archive_folders TO service_role;

ALTER TABLE public.archive_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select archive_folders" ON public.archive_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert archive_folders" ON public.archive_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update archive_folders" ON public.archive_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete archive_folders" ON public.archive_folders FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all archive_folders" ON public.archive_folders FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Add archive folder ref to companies
ALTER TABLE public.companies
  ADD COLUMN archived_folder_id UUID REFERENCES public.archive_folders(id) ON DELETE SET NULL,
  ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX idx_companies_archived_folder ON public.companies(archived_folder_id);
