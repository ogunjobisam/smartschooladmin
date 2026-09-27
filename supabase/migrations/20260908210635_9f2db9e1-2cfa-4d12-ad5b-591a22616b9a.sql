DO $mig$
DECLARE _src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc WHERE proname = 'create_demo_org_large';
  _src := replace(_src,
    'CASE WHEN i % 97 = 0 THEN ''withdrawn'' ELSE ''active'' END,',
    '(CASE WHEN i % 97 = 0 THEN ''withdrawn'' ELSE ''active'' END)::student_status,');
  EXECUTE _src;
END $mig$;