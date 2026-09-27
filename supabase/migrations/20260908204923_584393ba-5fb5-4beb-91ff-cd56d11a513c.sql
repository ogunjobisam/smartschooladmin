CREATE OR REPLACE FUNCTION public.demo_fix_placeholder() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
DROP FUNCTION public.demo_fix_placeholder();
DO $mig$
DECLARE _src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc WHERE proname = 'create_demo_org';
  _src := replace(_src, '''sent'', ''timed''', '''sent'', ''scheduled''');
  EXECUTE _src;
END $mig$;