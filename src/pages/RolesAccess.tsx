import { useMemo } from "react";
import { Shield, Eye, EyeOff, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ROLES, ROLE_RANK, ROLE_DESCRIPTIONS, roleBadgeClass, roleLabel,
  previewableRoles, canPreviewRoles,
} from "@/lib/roles";
import { navItemsForRole } from "@/lib/access";

export default function RolesAccess() {
  const { orgId, realRole, viewAsRole, setViewAsRole } = useAuth();
  const canPreview = canPreviewRoles(realRole);
  const previewable = useMemo(() => previewableRoles(realRole), [realRole]);

  const { data: counts, isLoading } = useQuery({
    queryKey: ["role-counts", orgId],
    queryFn: async () => {
      if (!orgId) return {} as Record<string, number>;
      const { data } = await supabase.from("user_roles").select("role").eq("org_id", orgId);
      const tally: Record<string, number> = {};
      for (const row of data || []) tally[row.role] = (tally[row.role] || 0) + 1;
      return tally;
    },
    enabled: !!orgId,
  });

  const startPreview = (role: string) => {
    setViewAsRole(role);
    toast.success(`Now viewing the app as a ${roleLabel(role)}.`, {
      description: "Menus and pages follow that role. Your own data permissions are unchanged.",
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Access"
        description="Every role in the app, what it can reach, and how many people hold it."
      />

      {viewAsRole && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <Eye className="h-4 w-4 text-warning" />
            <span>
              You are viewing the app as a <strong>{roleLabel(viewAsRole)}</strong>. You are still signed
              in as yourself, so the records you see are your own.
            </span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setViewAsRole(null)}>
              <EyeOff className="mr-2 h-4 w-4" /> Stop
            </Button>
          </CardContent>
        </Card>
      )}

      {!canPreview && (
        <p className="text-sm text-muted-foreground">
          Viewing the app as another role is available to school and group leadership only.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((role) => {
          const screens = navItemsForRole(role.value);
          const isMine = role.value === realRole;
          const canTry = previewable.includes(role.value);
          return (
            <Card key={role.value} className={isMine ? "border-primary/40" : undefined}>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{role.label}</CardTitle>
                  <Badge variant="outline" className={roleBadgeClass[role.value]}>
                    Level {ROLE_RANK[role.value]}
                  </Badge>
                  {isMine && <Badge variant="outline" className="border-primary/30 text-primary">You</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role.value]}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {isLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    <span>{counts?.[role.value] ?? 0} in this organisation</span>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Can open {screens.length} screens
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {screens.map((s) => (
                      <span key={s.key} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {s.title}
                      </span>
                    ))}
                  </div>
                </div>

                {canTry && (
                  <Button
                    size="sm"
                    variant={viewAsRole === role.value ? "secondary" : "outline"}
                    className="w-full"
                    onClick={() => (viewAsRole === role.value ? setViewAsRole(null) : startPreview(role.value))}
                  >
                    {viewAsRole === role.value ? (
                      <><EyeOff className="mr-2 h-4 w-4" /> Stop viewing as {role.label}</>
                    ) : (
                      <><Eye className="mr-2 h-4 w-4" /> View app as {role.label}</>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> How the levels work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A lower level number means more seniority. Nobody can grant, change or preview a role at or
            above their own level, so a bursar can never create a super admin.
          </p>
          <p>
            Previewing a role changes the menus and pages you see, which is the quickest way to check what
            a teacher or parent experiences. It does not borrow their records — the data you see is still
            everything your own account is allowed to see.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
