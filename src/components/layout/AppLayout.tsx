import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { canAccessPath } from "@/lib/access";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { ViewAsBanner } from "./ViewAsBanner";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { orgId, userRole } = useAuth();
  const { branding } = useSchoolBranding();
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
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* The school's crest, ghosted into the bottom-right of the page
              ground. Decorative and non-interactive: pointer-events-none keeps
              it from swallowing clicks on whatever sits above it. */}
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt=""
              aria-hidden
              className="pointer-events-none fixed bottom-6 right-6 z-0 hidden w-56 select-none opacity-[0.045] lg:block"
            />
          )}

          <TopBar />

          <ViewAsBanner />

          <DemoBanner />

          <AnnouncementBanner />

          <InstallPrompt />

          {(pendingCount ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-warning/10 px-4 py-2 text-xs text-warning-foreground sm:text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span>
                You have <strong>{pendingCount} pending approvals</strong> requiring your review.
              </span>
              <Link to="/approvals" className="ml-auto text-xs font-medium text-accent underline-offset-2 hover:underline">
                Review now →
              </Link>
            </div>
          )}

          {/* One scroller only: an inner overflow-y-auto here fought the window
              scroll and gave phones two nested scrollbars. */}
          <main className="flex-1 overflow-x-hidden p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette />
    </SidebarProvider>
  );
}
