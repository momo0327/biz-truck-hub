-- Add status_changed_at to track when the status last changed
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- Backfill existing rows with updated_at as a best approximation
UPDATE public.companies
  SET status_changed_at = updated_at
  WHERE status_changed_at IS NULL;

-- Trigger function: update status_changed_at whenever status changes
CREATE OR REPLACE FUNCTION public.set_status_changed_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_status_changed_at ON public.companies;
CREATE TRIGGER trg_status_changed_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_status_changed_at();
