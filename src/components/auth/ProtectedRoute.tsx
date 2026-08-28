import { Navigate, useLocation, Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { canAccessPath } from "@/lib/access";

function NoAccess({ role }: { role: string | null }) {
  const roleLabel = role ? role.replace(/_/g, " ") : "your account";
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-muted p-3">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">You don't have access to this page</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This area isn't available to <span className="capitalize">{roleLabel}</span> accounts.
          If you think you should have access, ask an administrator to update your role.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, orgId } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Redirect to onboarding if user has no org (and isn't already on onboarding)
  if (!orgId && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

/**
 * Role check for pages inside the app shell. Sits inside AppLayout so someone
 * who lands somewhere they shouldn't still has the sidebar to navigate away.
 *
 * Hiding a nav link is not access control: without this, any signed-in user
 * could open /payroll, /settings or /audit-log by typing the URL.
 */
export function RequireAccess({ children }: { children: React.ReactNode }) {
  const { userRole, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!canAccessPath(userRole, location.pathname)) return <NoAccess role={userRole} />;
  return <>{children}</>;
}
