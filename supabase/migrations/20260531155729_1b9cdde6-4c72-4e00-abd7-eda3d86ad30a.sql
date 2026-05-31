
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_phone_number text,
  ADD COLUMN IF NOT EXISTS elks_webrtc_uri text,
  ADD COLUMN IF NOT EXISTS elks_webrtc_username text,
  ADD COLUMN IF NOT EXISTS elks_webrtc_password text;
