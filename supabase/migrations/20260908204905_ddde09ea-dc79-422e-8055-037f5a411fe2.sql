CREATE OR REPLACE FUNCTION public.stamp_recognition_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _is_demo boolean;
BEGIN
  SELECT COALESCE(og.is_demo, false) INTO _is_demo
  FROM organisation_groups og WHERE og.id = NEW.org_id;

  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    -- Demo sandboxes seed their own published wall items; real schools still
    -- require a manager to publish.
    IF NOT COALESCE(_is_demo, false) AND NOT public.is_school_manager(auth.uid()) THEN
      RAISE EXCEPTION 'Only a school manager can publish a recognition'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.published_by := auth.uid();
    NEW.published_at := COALESCE(NEW.published_at, now());
  ELSIF NEW.status <> 'published' THEN
    NEW.published_by := NULL;
    NEW.published_at := NULL;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$function$;