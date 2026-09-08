CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
