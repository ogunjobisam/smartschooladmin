import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { dashboardStats } from "@/lib/mock-data";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />

          {dashboardStats.pendingApprovals > 0 && (
            <div className="flex items-center gap-2 border-b bg-warning/10 px-4 py-2 text-sm text-warning-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span>
                You have <strong>{dashboardStats.pendingApprovals} pending approvals</strong> requiring your review.
              </span>
              <Link to="/approvals" className="ml-auto text-xs font-medium text-accent underline-offset-2 hover:underline">
                Review now →
              </Link>
            </div>
          )}

          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
