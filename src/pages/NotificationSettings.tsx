import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, MessageSquare, Smartphone, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const NOTIFICATION_TYPES = [
  { type: "invoice_generated", label: "Invoice Generated", description: "When a new invoice is created for your student" },
  { type: "payment_received", label: "Payment Received", description: "Confirmation when a payment is recorded" },
  { type: "payment_confirmation", label: "Payment Confirmation", description: "Detailed payment confirmation with receipt info" },
  { type: "overdue_reminder", label: "Overdue Reminder", description: "Reminder for overdue fee payments" },
  { type: "fee_reminder", label: "Fee Reminder", description: "Periodic fee payment reminders" },
  { type: "guardian_invite", label: "Guardian Invite", description: "When you're invited to link as a guardian" },
  { type: "staff_invite", label: "Staff Invite", description: "Staff onboarding invitations" },
  { type: "payroll_pending", label: "Payroll Pending", description: "Payroll run awaiting approval" },
  { type: "approval_result", label: "Approval Result", description: "Results of your approval requests" },
  { type: "school_announcement", label: "School Announcement", description: "General school announcements and updates" },
] as const;

interface Preference {
  notification_type: string;
  channel_in_app: boolean;
  channel_email: boolean;
  channel_sms: boolean;
}

export default function NotificationSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Map<string, Preference>>(new Map());

  const { data: savedPrefs, isLoading } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id);
      return (data as any[]) || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const map = new Map<string, Preference>();
    // Initialize defaults
    for (const nt of NOTIFICATION_TYPES) {
      map.set(nt.type, {
        notification_type: nt.type,
        channel_in_app: true,
        channel_email: false,
        channel_sms: false,
      });
    }
    // Overlay saved prefs
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

    const rows = Array.from(prefs.values()).map((p) => ({
      user_id: user.id,
      notification_type: p.notification_type as any,
      channel_in_app: p.channel_in_app,
      channel_email: p.channel_email,
      channel_sms: p.channel_sms,
    }));

    // Upsert all preferences
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(rows, { onConflict: "user_id,notification_type" as any });

    setSaving(false);
    if (error) {
      toast.error("Failed to save preferences");
      console.error(error);
    } else {
      toast.success("Notification preferences saved");
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Notification Settings" description="Choose how you want to be notified for each event type.">
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Preferences
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Notification Channels</CardTitle>
          <CardDescription>Toggle which channels each notification type should use</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="divide-y">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 pb-3 text-xs font-semibold text-muted-foreground">
                <div className="col-span-6">Notification Type</div>
                <div className="col-span-2 text-center flex items-center justify-center gap-1">
                  <Bell className="h-3 w-3" /> In-App
                </div>
                <div className="col-span-2 text-center flex items-center justify-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                  <Badge variant="outline" className="text-[8px] px-1">Soon</Badge>
                </div>
                <div className="col-span-2 text-center flex items-center justify-center gap-1">
                  <Smartphone className="h-3 w-3" /> SMS
                  <Badge variant="outline" className="text-[8px] px-1">Soon</Badge>
                </div>
              </div>

              {NOTIFICATION_TYPES.map((nt) => {
                const pref = prefs.get(nt.type);
                if (!pref) return null;
                return (
                  <div key={nt.type} className="grid grid-cols-12 gap-2 py-3 items-center">
                    <div className="col-span-6">
                      <p className="text-sm font-medium">{nt.label}</p>
                      <p className="text-xs text-muted-foreground">{nt.description}</p>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Switch
                        checked={pref.channel_in_app}
                        onCheckedChange={() => togglePref(nt.type, "channel_in_app")}
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Switch
                        checked={pref.channel_email}
                        onCheckedChange={() => togglePref(nt.type, "channel_email")}
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Switch
                        checked={pref.channel_sms}
                        onCheckedChange={() => togglePref(nt.type, "channel_sms")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
