import { Building2, Check, School } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";

/**
 * Sign-in step for accounts that span more than one organisation or school.
 *
 * Picking the wrong workspace is easy to do and hard to notice — every figure
 * on screen quietly belongs to another school — so the choice is made once, up
 * front, and remembered. It stays changeable from the top bar afterwards.
 */
export function WorkspacePicker() {
  const { orgs, orgId, setOrgId, schools, schoolId, setSchoolId, confirmWorkspace, userRole, signOut } = useAuth();

  const multipleOrgs = orgs.length > 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Where are you working today?</h1>
          <p className="text-sm text-muted-foreground">
            Your account has access to more than one place. Choose one to continue — you can switch
            at any time from the top of the screen.
          </p>
        </div>

        {multipleOrgs && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Organisation</p>
            <div className="grid gap-2">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => setOrgId(org.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-accent",
                    org.id === orgId && "border-accent ring-1 ring-accent",
                  )}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{org.name}</span>
                  {org.id === orgId && <Check className="h-4 w-4 text-accent" />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">School</p>
          {schools.length === 0 ? (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                No schools in this organisation yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {schools.map((school) => (
                <button
                  key={school.id}
                  type="button"
                  onClick={() => setSchoolId(school.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-accent",
                    school.id === schoolId && "border-accent ring-1 ring-accent",
                  )}
                >
                  <School className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{school.name}</span>
                  {school.id === schoolId && <Check className="h-4 w-4 text-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {userRole && (
          <p className="text-center text-xs text-muted-foreground">
            You will sign in as {roleLabel(userRole)}.
          </p>
        )}

        <div className="flex justify-center gap-2">
          <Button onClick={confirmWorkspace} disabled={!orgId}>Continue</Button>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
