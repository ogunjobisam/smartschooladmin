import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const DISMISS_KEY = "dismissed-announcement-banners";

const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
  } catch {
    return [];
  }
};

/**
 * Pinned announcements shown as a banner under the top bar, for whoever the
 * announcement was addressed to. Dismissal is per-person and per-announcement.
 */
export function AnnouncementBanner() {
  const { orgId, userRoles } = useAuth();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const { data: pinned = [] } = useQuery({
    queryKey: ["pinned-announcements", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("school_announcements")
        .select("id, title, body, audience, starts_at, ends_at, is_active")
        .eq("org_id", orgId)
        .eq("is_pinned", true)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const isParent = userRoles.includes("parent") || userRoles.includes("student");
  const isStaff = userRoles.some((r) => r !== "parent" && r !== "student");
  const now = Date.now();

  const visible = pinned.filter((a) => {
    if (dismissed.includes(a.id)) return false;
    if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
    if (a.ends_at && new Date(a.ends_at).getTime() < now) return false;
    if (a.audience === "parents") return isParent;
    if (a.audience === "staff") return isStaff;
    return true;
  });

  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* private browsing — the banner simply returns next reload */
    }
  };

  return (
    <div className="border-b">
      {visible.map((a) => (
        <div key={a.id} className="flex items-start gap-2 bg-accent/10 px-4 py-2 text-sm">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{a.title}</span>
            <span className="ml-2 text-muted-foreground">{a.body}</span>
          </div>
          <button
            type="button"
            onClick={() => dismiss(a.id)}
            aria-label={`Dismiss ${a.title}`}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
