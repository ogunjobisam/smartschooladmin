ALTER TABLE public.outbound_message_queue
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS outbound_queue_ready_idx
  ON public.outbound_message_queue (status, scheduled_for);
