-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by owner" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Status enum
CREATE TYPE public.company_status AS ENUM ('new','called_no_answer','follow_up','in_negotiation','deal_made','not_interested');

-- Companies
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_number TEXT,
  website TEXT,
  address TEXT,
  phones TEXT[] NOT NULL DEFAULT '{}',
  contact_person TEXT,
  trucks_info TEXT,
  fleet_size TEXT,
  status public.company_status NOT NULL DEFAULT 'new',
  notes TEXT,
  last_contact TIMESTAMPTZ,
  researched_at TIMESTAMPTZ,
  research_raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner select companies" ON public.companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert companies" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update companies" ON public.companies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete companies" ON public.companies FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_companies_user ON public.companies(user_id);
CREATE INDEX idx_companies_status ON public.companies(user_id, status);

-- Call logs
CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner select calls" ON public.call_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert calls" ON public.call_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner delete calls" ON public.call_logs FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_calls_company ON public.call_logs(company_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();