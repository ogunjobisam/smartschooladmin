import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { canAccessPath } from "@/lib/access";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { orgId, userRole } = useAuth();
  // Only people who can actually action an approval should be nagged about one.
  const canReviewApprovals = canAccessPath(userRole, "/approvals");

  const { data: pendingCount } = useQuery({
    queryKey: ["pending-approvals-count", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from("approval_requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "pending");
      return count || 0;
    },
    enabled: !!orgId && canReviewApprovals,
  });

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />

          <InstallPrompt />

          {(pendingCount ?? 0) > 0 && (
            <div className="flex items-center gap-2 border-b bg-warning/10 px-4 py-2 text-sm text-warning-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span>
                You have <strong>{pendingCount} pending approvals</strong> requiring your review.
              </span>
              <Link to="/approvals" className="ml-auto text-xs font-medium text-accent underline-offset-2 hover:underline">
                Review now →
              </Link>
            </div>
          )}

          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette />
    </SidebarProvider>
  );
}
