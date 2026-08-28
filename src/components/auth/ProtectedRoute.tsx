import { Navigate, useLocation, Link } from "react-router-dom";
import { Loader2, Lock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { canAccessPath } from "@/lib/access";

/**
 * Shown when someone is signed in but the app cannot place them in a school.
 *
 * Both ways of ending up here used to be indistinguishable from a brand-new
 * user, so both sent people to the org-creation wizard — which offers to build
 * a second organisation on top of the one they already have, and `setup-
 * organisation` only refuses that when the existing role row carries an org.
 * Say what happened instead, and put anything diagnostic somewhere it can be
 * copied and passed on.
 */
function AccountNotReady({ title, explanation, cause, report, onRetry, onSignOut }: {
  title: string;
  explanation: string;
  cause?: string | null;
  report?: string | null;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-warning/10 p-3">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{explanation}</p>
          </div>
        </div>

        {cause && (
          <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            {cause}
          </p>
        )}

        {report && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Send this to whoever supports your system:
            </p>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs">
              <code>{report}</code>
            </pre>
          </div>
        )}

        <div className="flex justify-center gap-2">
          <Button size="sm" onClick={onRetry}>Try again</Button>
          <Button size="sm" variant="outline" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

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
  const { user, loading, orgId, userRole, roleError, retryRole, signOut } = useAuth();
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

  // The lookup failed, so "no organisation" is not a fact about this account —
  // we simply do not know. Onboarding would be the wrong answer and the wrong
  // offer; show what went wrong instead.
  if (roleError && !orgId) {
    return (
      <AccountNotReady
        title="We couldn’t load your account"
        explanation="You are signed in, but we could not read which school you belong to, so there is nothing we can safely show you yet."
        cause={roleError.likelyCause}
        report={roleError.report}
        onRetry={retryRole}
        onSignOut={signOut}
      />
    );
  }

  // A role with no organisation behind it. The lookup worked, so this is not a
  // new user with nothing set up — it is an existing account whose role row was
  // never attached to an organisation, and onboarding would quietly build them
  // a second one rather than repair the first.
  if (userRole && !orgId) {
    return (
      <AccountNotReady
        title="Your account isn’t attached to a school"
        explanation="You are signed in and your role is set, but it is not linked to any school or organisation. Whoever administers your school needs to reissue your access."
        cause={`Role on this account: ${userRole.replace(/_/g, " ")}, with no organisation.`}
        onRetry={retryRole}
        onSignOut={signOut}
      />
    );
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
