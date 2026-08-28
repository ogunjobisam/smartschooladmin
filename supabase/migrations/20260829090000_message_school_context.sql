-- Carry the school on each queued message.
--
-- One domain, verified once by whoever runs the platform, sends for every
-- school: a message goes out as "Grace Academy <notifications@platform>" with
-- Reply-To set to that school's own address. Adding a school then needs no DNS
-- work at all.
--
-- That needs the school to travel with the message. The queue has only org_id,
-- so in a group of two schools an announcement from one is indistinguishable
-- from the other's, and there is nothing to put on the From line.

ALTER TABLE public.outbound_message_queue
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

-- Resolved when the message is queued, because the sender is not always the
-- school's own address and the school row may change afterwards.
ALTER TABLE public.outbound_message_queue
  ADD COLUMN IF NOT EXISTS reply_to text;

COMMENT ON COLUMN public.outbound_message_queue.school_id IS
  'The school this message is from. NULL for organisation-level messages and for rows queued before this column existed; the sender then falls back to a bare platform address.';
COMMENT ON COLUMN public.outbound_message_queue.reply_to IS
  'Where a reply should go — normally the school''s own address. NULL omits the header, which is better than sending replies somewhere wrong.';

-- Both columns are nullable and no policy references them, so the existing
-- org-scoped INSERT and SELECT policies keep working unchanged.
