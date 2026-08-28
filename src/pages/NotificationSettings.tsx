import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, Smartphone, Loader2, Info } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhotoUpload } from "@/components/common/PhotoUpload";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { accountPhotoPath, initialsFrom } from "@/lib/photos";
import type { Enums } from "@/integrations/supabase/types";

type Audience = "family" | "finance" | "staff" | "everyone";

/**
 * Which people a notification can actually reach. A parent never receives a
 * payroll alert and a teacher never receives a guardian invitation, so showing
 * those switches only invites people to configure something that will never fire.
 */
const NOTIFICATION_TYPES = [
  { type: "invoice_generated", label: "New invoice issued", description: "When a new invoice is raised for your child", audience: "family", group: "fees" },
  { type: "payment_confirmation", label: "Payment confirmation", description: "Your receipt once a payment is recorded", audience: "family", group: "fees" },
  { type: "overdue_reminder", label: "Overdue fee reminder", description: "When fees pass their due date", audience: "family", group: "fees" },
  { type: "fee_reminder", label: "Fee reminder", description: "Reminders before fees fall due", audience: "family", group: "fees" },
  { type: "guardian_invite", label: "Guardian invitation", description: "When you are invited to link to a child's record", audience: "family", group: "account" },

  { type: "payment_received", label: "Payment received", description: "When a parent's payment lands against an invoice", audience: "finance", group: "fees" },
  { type: "payroll_pending", label: "Payroll awaiting approval", description: "When a payroll run needs a decision", audience: "finance", group: "operations" },
  { type: "approval_result", label: "Approval decisions", description: "Outcomes of requests you submitted or review", audience: "finance", group: "operations" },

  { type: "staff_invite", label: "Staff invitation", description: "Onboarding invitations for colleagues", audience: "staff", group: "account" },

  { type: "school_announcement", label: "School announcements", description: "General news and updates from the school", audience: "everyone", group: "school" },
] as const;

const GROUPS: { key: string; title: string; description: string }[] = [
  { key: "fees", title: "Fees and payments", description: "Invoices, receipts and reminders" },
  { key: "operations", title: "Payroll and approvals", description: "Requests that need a decision" },
  { key: "school", title: "School news", description: "Announcements from the school" },
  { key: "account", title: "Your account", description: "Invitations and account activity" },
];

const FAMILY_ROLES = ["parent", "student"];
const FINANCE_ROLES = [
  "super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar", "finance_officer", "hr_admin",
];

function audienceMatchesRole(audience: Audience, role: string | null, roles: string[]): boolean {
  const held = roles.length ? roles : role ? [role] : [];
  switch (audience) {
    case "everyone":
      return true;
    case "family":
      return held.some((r) => FAMILY_ROLES.includes(r));
    case "finance":
      return held.some((r) => FINANCE_ROLES.includes(r));
    case "staff":
      return held.some((r) => !FAMILY_ROLES.includes(r));
  }
}

interface Preference {
  notification_type: string;
  channel_in_app: boolean;
  channel_email: boolean;
  channel_sms: boolean;
}

export default function NotificationSettings() {
  const { user, userRole, userRoles } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Map<string, Preference>>(new Map());

  const roleNames = (userRoles ?? []).map((r) => (typeof r === "string" ? r : r.role));

  const relevant = NOTIFICATION_TYPES.filter((nt) =>
    audienceMatchesRole(nt.audience as Audience, userRole, roleNames),
  );

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: savedPrefs, isLoading } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const map = new Map<string, Preference>();
    for (const nt of NOTIFICATION_TYPES) {
      map.set(nt.type, {
        notification_type: nt.type,
        channel_in_app: true,
        channel_email: false,
        channel_sms: false,
      });
    }
    if (savedPrefs) {
      for (const sp of savedPrefs) {
        map.set(sp.notification_type, {
          notification_type: sp.notification_type,
          channel_in_app: sp.channel_in_app,
          channel_email: sp.channel_email,
          channel_sms: sp.channel_sms,
        });
      }
    }
    setPrefs(map);
  }, [savedPrefs]);

  const togglePref = (type: string, channel: "channel_in_app" | "channel_email" | "channel_sms") => {
    setPrefs((prev) => {
      const next = new Map(prev);
      const current = next.get(type)!;
      next.set(type, { ...current, [channel]: !current[channel] });
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // Save only what this person can actually receive; untouched types keep
    // whatever they were, rather than being written back as noise.
    const rows = relevant
      .map((nt) => prefs.get(nt.type))
      .filter((p): p is Preference => !!p)
      .map((p) => ({
        user_id: user.id,
        notification_type: p.notification_type as Enums<"notification_type">,
        channel_in_app: p.channel_in_app,
        channel_email: p.channel_email,
        channel_sms: p.channel_sms,
      }));

    const { error } = await supabase
      .from("notification_preferences")
      .upsert(rows, { onConflict: "user_id,notification_type" });

    setSaving(false);
    if (error) {
      toast.error("Could not save your preferences");
      console.error(error);
    } else {
      toast.success("Preferences saved");
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    }
  };

  const groupsToShow = GROUPS.filter((g) => relevant.some((nt) => nt.group === g.key));

  return (
    <div className="space-y-6">
      <PageHeader title="My Preferences" description="Your photo and how the school reaches you.">
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save preferences
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your photo</CardTitle>
          <CardDescription>
            Shown beside your name in the app. Staff and student photos are also used on records,
            documents and ID cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUpload
            value={profile?.avatar_url}
            fallback={initialsFrom(profile?.full_name?.split(" ")[0], profile?.full_name?.split(" ")[1] ?? user?.email)}
            label="Photo"
            pathFor={(file) => accountPhotoPath(user!.id, file)}
            onSaved={async (path) => {
              const { error } = await supabase
                .from("profiles")
                .update({ avatar_url: path })
                .eq("user_id", user!.id);
              if (error) throw new Error(error.message);
              await queryClient.invalidateQueries({ queryKey: ["my-profile", user?.id] });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </CardTitle>
          <CardDescription>
            Only the alerts your role can receive are listed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              In-app alerts are live now. Email and SMS delivery is being connected — your choices
              are saved and will apply as soon as it is switched on.
            </AlertDescription>
          </Alert>

          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : groupsToShow.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              You have no notification settings to manage yet.
            </p>
          ) : (
            groupsToShow.map((group) => (
              <div key={group.key} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-card-foreground">{group.title}</h3>
                  <span className="text-xs text-muted-foreground">{group.description}</span>
                </div>

                <div className="divide-y border-t">
                  {relevant
                    .filter((nt) => nt.group === group.key)
                    .map((nt) => {
                      const pref = prefs.get(nt.type);
                      if (!pref) return null;
                      return (
                        <div
                          key={nt.type}
                          className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 sm:pr-4">
                            <p className="text-sm font-medium">{nt.label}</p>
                            <p className="text-xs text-muted-foreground">{nt.description}</p>
                          </div>

                          <div className="flex shrink-0 items-center gap-5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Bell className="h-3.5 w-3.5" /> In-app
                              <Switch
                                checked={pref.channel_in_app}
                                onCheckedChange={() => togglePref(nt.type, "channel_in_app")}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" /> Email
                              <Badge variant="outline" className="px-1 text-[9px]">Soon</Badge>
                              <Switch
                                checked={pref.channel_email}
                                onCheckedChange={() => togglePref(nt.type, "channel_email")}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Smartphone className="h-3.5 w-3.5" /> SMS
                              <Badge variant="outline" className="px-1 text-[9px]">Soon</Badge>
                              <Switch
                                checked={pref.channel_sms}
                                onCheckedChange={() => togglePref(nt.type, "channel_sms")}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
