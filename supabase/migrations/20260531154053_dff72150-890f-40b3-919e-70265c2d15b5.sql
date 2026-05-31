CREATE OR REPLACE FUNCTION public.archive_companies(_folder_name text, _folder_id uuid, _company_ids uuid[])
RETURNS TABLE(folder_id uuid, archived_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _target_folder_id uuid := _folder_id;
  _updated_count integer := 0;
  _requested_count integer := 0;
  _clean_name text := nullif(btrim(_folder_name), '');
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(DISTINCT id)::integer
  INTO _requested_count
  FROM unnest(_company_ids) AS id
  WHERE id IS NOT NULL;

  IF _requested_count = 0 THEN
    RAISE EXCEPTION 'No companies selected';
  END IF;

  IF _target_folder_id IS NULL THEN
    IF _clean_name IS NULL THEN
      RAISE EXCEPTION 'Folder name is required';
    END IF;

    INSERT INTO public.archive_folders (user_id, name)
    VALUES (_user_id, _clean_name)
    RETURNING id INTO _target_folder_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.archive_folders
      WHERE id = _target_folder_id
        AND user_id = _user_id
    ) THEN
      RAISE EXCEPTION 'Archive folder not found';
    END IF;
  END IF;

  UPDATE public.companies
  SET archived_folder_id = _target_folder_id,
      archived_at = now()
  WHERE user_id = _user_id
    AND id = ANY(_company_ids)
    AND archived_folder_id IS NULL;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  IF _updated_count <> _requested_count THEN
    RAISE EXCEPTION 'Only % of % companies could be archived', _updated_count, _requested_count;
  END IF;

  folder_id := _target_folder_id;
  archived_count := _updated_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_companies(text, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_companies(text, uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_companies(text, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_companies(text, uuid, uuid[]) TO service_role;