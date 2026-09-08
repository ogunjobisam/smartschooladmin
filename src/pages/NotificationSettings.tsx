import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, Smartphone, Loader2, Info, Moon, Eye } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoUpload } from "@/components/common/PhotoUpload";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { accountPhotoPath, initialsFrom } from "@/lib/photos";
import type { Enums } from "@/integrations/supabase/types";

type Audience = "family" | "finance" | "staff" | "everyone";
type Channel = "in_app" | "email" | "sms";
type Frequency = "immediate" | "daily" | "weekly" | "off";

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
  { type: "school_event", label: "School events", description: "New events on the calendar, plus a reminder before each one", audience: "everyone", group: "school" },
] as const;

const GROUPS: { key: string; title: string; description: string }[] = [
  { key: "fees", title: "Fees and payments", description: "Invoices, receipts and reminders" },
  { key: "operations", title: "Payroll and approvals", description: "Requests that need a decision" },
  { key: "school", title: "School news", description: "Announcements from the school" },
  { key: "account", title: "Your account", description: "Invitations and account activity" },
];

const FREQUENCIES: { value: Frequency; label: string; blurb: string }[] = [
  { value: "immediate", label: "As it happens", blurb: "sent straight away" },
  { value: "daily", label: "Daily summary", blurb: "bundled into one message a day" },
  { value: "weekly", label: "Weekly summary", blurb: "bundled into one message a week" },
  { value: "off", label: "Off", blurb: "nothing is sent" },
];

const TIMEZONES = [
  "Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg",
  "Africa/Cairo", "Europe/London", "UTC",
];

const CHANNEL_META: { key: Channel; label: string; icon: typeof Bell; live: boolean }[] = [
  { key: "in_app", label: "In-app", icon: Bell, live: true },
  { key: "email", label: "Email", icon: Mail, live: false },
  { key: "sms", label: "SMS", icon: Smartphone, live: false },
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

interface Delivery {
  in_app_frequency: Frequency;
  email_frequency: Frequency;
  sms_frequency: Frequency;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
  event_reminders_enabled: boolean;
  event_reminder_lead_minutes: number;
}

const DEFAULT_DELIVERY: Delivery = {
  in_app_frequency: "immediate",
  email_frequency: "daily",
  sms_frequency: "off",
  quiet_hours_enabled: false,
  quiet_start: "21:00",
  quiet_end: "07:00",
  timezone: "Africa/Lagos",
  event_reminders_enabled: true,
  event_reminder_lead_minutes: 1440,
};

const REMINDER_LEADS: { value: number; label: string }[] = [
  { value: 60, label: "1 hour before" },
  { value: 180, label: "3 hours before" },
  { value: 720, label: "12 hours before" },
  { value: 1440, label: "A day before" },
  { value: 4320, label: "3 days before" },
  { value: 10080, label: "A week before" },
];

const FREQ_KEY: Record<Channel, keyof Delivery> = {
  in_app: "in_app_frequency",
  email: "email_frequency",
  sms: "sms_frequency",
};

const PREF_KEY: Record<Channel, keyof Preference> = {
  in_app: "channel_in_app",
  email: "channel_email",
  sms: "channel_sms",
};

const trimTime = (v: string) => v.slice(0, 5);

export default function NotificationSettings() {
  const { user, userRole, userRoles, orgId } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Map<string, Preference>>(new Map());
  const [delivery, setDelivery] = useState<Delivery>(DEFAULT_DELIVERY);

  const roleNames = userRoles ?? [];

  const relevant = useMemo(
    () => NOTIFICATION_TYPES.filter((nt) => audienceMatchesRole(nt.audience as Audience, userRole, roleNames)),
    [userRole, roleNames.join(",")],
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

  const { data: savedDelivery } = useQuery({
    queryKey: ["notification-settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
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

  useEffect(() => {
    if (!savedDelivery) return;
    setDelivery({
      in_app_frequency: savedDelivery.in_app_frequency as Frequency,
      email_frequency: savedDelivery.email_frequency as Frequency,
      sms_frequency: savedDelivery.sms_frequency as Frequency,
      quiet_hours_enabled: savedDelivery.quiet_hours_enabled,
      quiet_start: trimTime(savedDelivery.quiet_start),
      quiet_end: trimTime(savedDelivery.quiet_end),
      timezone: savedDelivery.timezone,
      event_reminders_enabled: savedDelivery.event_reminders_enabled,
      event_reminder_lead_minutes: savedDelivery.event_reminder_lead_minutes,
    });
  }, [savedDelivery]);

  const togglePref = (type: string, channel: "channel_in_app" | "channel_email" | "channel_sms") => {
    setPrefs((prev) => {
      const next = new Map(prev);
      const current = next.get(type)!;
      next.set(type, { ...current, [channel]: !current[channel] });
      return next;
    });
  };

  /** What the current, unsaved choices actually mean, channel by channel. */
  const preview = CHANNEL_META.map((channel) => {
    const frequency = delivery[FREQ_KEY[channel.key]] as Frequency;
    const enabled = relevant.filter((nt) => prefs.get(nt.type)?.[PREF_KEY[channel.key]]);
    return {
      ...channel,
      frequency,
      titles: frequency === "off" ? [] : enabled.map((nt) => nt.label),
    };
  });

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

    if (error) {
      setSaving(false);
      toast.error("Could not save your preferences");
      console.error(error);
      return;
    }

    const { error: deliveryError } = await supabase
      .from("notification_settings")
      .upsert({ user_id: user.id, ...delivery }, { onConflict: "user_id" });

    if (deliveryError) {
      setSaving(false);
      toast.error("Could not save your delivery settings");
      console.error(deliveryError);
      return;
    }

    // Audit trail: who changed their own notification settings, and to what.
    if (orgId) {
      const before = {
        delivery: savedDelivery
          ? {
              in_app_frequency: savedDelivery.in_app_frequency,
              email_frequency: savedDelivery.email_frequency,
              sms_frequency: savedDelivery.sms_frequency,
              quiet_hours_enabled: savedDelivery.quiet_hours_enabled,
              quiet_start: trimTime(savedDelivery.quiet_start),
              quiet_end: trimTime(savedDelivery.quiet_end),
              timezone: savedDelivery.timezone,
              event_reminders_enabled: savedDelivery.event_reminders_enabled,
              event_reminder_lead_minutes: savedDelivery.event_reminder_lead_minutes,
            }
          : null,
        channels: (savedPrefs || []).map((p) => ({
          notification_type: p.notification_type,
          channel_in_app: p.channel_in_app,
          channel_email: p.channel_email,
          channel_sms: p.channel_sms,
        })),
      };
      const after = { delivery, channels: rows.map(({ user_id, ...rest }) => rest) };

      const { error: auditError } = await supabase.from("audit_logs").insert({
        org_id: orgId,
        user_id: user.id,
        action: "preferences_updated",
        entity_type: "notification_preferences",
        entity_id: user.id,
        detail: `Updated notification preferences — in-app: ${delivery.in_app_frequency}, email: ${delivery.email_frequency}, SMS: ${delivery.sms_frequency}${delivery.quiet_hours_enabled ? `, quiet hours ${delivery.quiet_start}–${delivery.quiet_end} (${delivery.timezone})` : ""}`,
        old_values: before,
        new_values: after,
      } as never);
      // A missing audit row must not look like a failed save to the user.
      if (auditError) console.error(auditError);
    }

    setSaving(false);
    toast.success("Preferences saved");
    queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
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

      {/* Sign-in methods: password and Google on one account */}
      <SignInMethods accountEmail={user?.email} />


      {/* Delivery frequency and quiet hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Moon className="h-4 w-4" /> How often, and when
          </CardTitle>
          <CardDescription>Limit how much reaches you, and keep messages out of the night.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {CHANNEL_META.map((channel) => {
              const Icon = channel.icon;
              const key = FREQ_KEY[channel.key];
              return (
                <div key={channel.key} className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-xs">
                    <Icon className="h-3.5 w-3.5" /> {channel.label}
                    {!channel.live && <Badge variant="outline" className="px-1 text-[9px]">Soon</Badge>}
                  </Label>
                  <Select
                    value={delivery[key] as string}
                    onValueChange={(value) => setDelivery((d) => ({ ...d, [key]: value as Frequency }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Quiet hours</p>
                <p className="text-xs text-muted-foreground">
                  Email and SMS are held back during these hours and sent afterwards. Urgent in-app
                  alerts still appear when you open the app.
                </p>
              </div>
              <Switch
                checked={delivery.quiet_hours_enabled}
                onCheckedChange={(checked) => setDelivery((d) => ({ ...d, quiet_hours_enabled: checked }))}
              />
            </div>

            {delivery.quiet_hours_enabled && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="time"
                    value={delivery.quiet_start}
                    onChange={(e) => setDelivery((d) => ({ ...d, quiet_start: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Until</Label>
                  <Input
                    type="time"
                    value={delivery.quiet_end}
                    onChange={(e) => setDelivery((d) => ({ ...d, quiet_end: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Time zone</Label>
                  <Select
                    value={delivery.timezone}
                    onValueChange={(value) => setDelivery((d) => ({ ...d, timezone: value }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Event reminders */}
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Remind me about events</p>
                <p className="text-xs text-muted-foreground">
                  A single reminder before each event you are invited to, on the channels you ticked
                  below. Turn this off to hear about an event only when it is first added.
                </p>
              </div>
              <Switch
                checked={delivery.event_reminders_enabled}
                onCheckedChange={(checked) => setDelivery((d) => ({ ...d, event_reminders_enabled: checked }))}
              />
            </div>

            {delivery.event_reminders_enabled && (
              <div className="space-y-1.5 sm:max-w-xs">
                <Label className="text-xs">Send the reminder</Label>
                <Select
                  value={String(delivery.event_reminder_lead_minutes)}
                  onValueChange={(value) =>
                    setDelivery((d) => ({ ...d, event_reminder_lead_minutes: Number(value) }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REMINDER_LEADS.map((lead) => (
                      <SelectItem key={lead.value} value={String(lead.value)}>{lead.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* What you will actually get */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" /> What you will receive
          </CardTitle>
          <CardDescription>A summary of your current choices, before you save them.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {preview.map((channel) => {
            const Icon = channel.icon;
            const freq = FREQUENCIES.find((f) => f.value === channel.frequency)!;
            return (
              <div key={channel.key} className="rounded-lg border p-3 space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-3.5 w-3.5" /> {channel.label}
                  {!channel.live && <Badge variant="outline" className="px-1 text-[9px]">Soon</Badge>}
                </p>
                {channel.frequency === "off" || channel.titles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {channel.frequency === "off"
                      ? `Nothing — ${channel.label} delivery is switched off.`
                      : `Nothing — no alerts are set to use ${channel.label.toLowerCase()}.`}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {channel.titles.length} alert{channel.titles.length === 1 ? "" : "s"}, {freq.blurb}
                      {channel.key !== "in_app" && delivery.quiet_hours_enabled
                        ? `, held between ${delivery.quiet_start} and ${delivery.quiet_end}`
                        : ""}
                      .
                    </p>
                    <ul className="space-y-0.5 text-xs">
                      {channel.titles.map((t) => (
                        <li key={t} className="text-card-foreground">• {t}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
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
                            {CHANNEL_META.map((channel) => {
                              const Icon = channel.icon;
                              const field = PREF_KEY[channel.key] as "channel_in_app" | "channel_email" | "channel_sms";
                              return (
                                <label key={channel.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Icon className="h-3.5 w-3.5" /> {channel.label}
                                  {!channel.live && <Badge variant="outline" className="px-1 text-[9px]">Soon</Badge>}
                                  <Switch
                                    checked={pref[field]}
                                    onCheckedChange={() => togglePref(nt.type, field)}
                                  />
                                </label>
                              );
                            })}
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
