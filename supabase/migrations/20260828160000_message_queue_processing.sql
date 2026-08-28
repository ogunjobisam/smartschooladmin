-- Support draining the outbound message queue.
--
-- Nothing has ever sent these messages: rows were written by the notification
-- dispatcher and left in place. The `process-message-queue` edge function now
-- drains them, which needs an index for the claim query and a slightly wider
-- read policy so the admins who send announcements can also see what happened
-- to them.

-- The drain query is: status = 'queued' AND attempts < N ORDER BY created_at.
CREATE INDEX IF NOT EXISTS idx_outbound_queue_pending
  ON public.outbound_message_queue (status, created_at)
  WHERE status = 'queued';

-- Previously proprietor and principal only, which left the school admins and
-- group admins who actually send announcements unable to see a delivery failure.
DROP POLICY IF EXISTS "Admins can view message queue" ON public.outbound_message_queue;

CREATE POLICY "Admins can view message queue"
ON public.outbound_message_queue FOR SELECT TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
    OR public.has_role(auth.uid(), 'principal')
  )
);

-- Counts by status for the outbox panel, without exposing recipients or bodies
-- to a plain org-wide select.
CREATE OR REPLACE FUNCTION public.my_outbox_summary()
RETURNS TABLE(status text, count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.status, COUNT(*)::integer
  FROM public.outbound_message_queue q
  WHERE q.org_id = public.get_user_org_id(auth.uid())
  GROUP BY q.status
$$;
