import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { liveNotices } from "@/lib/notices";

/**
 * The school's current notices, as a strip. Same content the public page shows,
 * so a parent is not told one thing on the website and another in the portal.
 */
export function NoticeBoard() {
  const { schoolId } = useAuth();

  const { data: notices = [] } = useQuery({
    queryKey: ["school-notices-live", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_notices")
        .select("id, title, body, is_published, starts_on, ends_on, display_order")
        .eq("school_id", schoolId!)
        .eq("is_published", true)
        .order("display_order");
      if (error) throw error;
      return liveNotices(data || []);
    },
    enabled: !!schoolId,
  });

  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((notice) => (
        <div key={notice.id} className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {notice.title}
          </p>
          {notice.body && (
            <p className="mt-1 whitespace-pre-wrap pl-6 text-sm text-muted-foreground">{notice.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}
