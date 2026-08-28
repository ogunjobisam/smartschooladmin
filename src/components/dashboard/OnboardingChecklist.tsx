import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Circle, GraduationCap, Users, Receipt, FileText, Layers } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { canAccessPath, canManageStudents } from "@/lib/access";

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  icon: typeof GraduationCap;
  link: string;
  /** Extra gate beyond route access, e.g. write permission. */
  allowed?: boolean;
  linkLabel: string;
  done: boolean;
}

export function OnboardingChecklist() {
  const { schoolId, orgId, userRole } = useAuth();

  // Only show a setup step to someone whose role can actually complete it.
  const canSee = (path: string, extra = true) => extra && canAccessPath(userRole, path);
  const relevantSteps = ["/settings", "/students", "/staff", "/fees", "/invoices"].some((p) => canSee(p));

  const { data: checks, isLoading } = useQuery({
    queryKey: ["onboarding-checklist", schoolId, orgId],
    queryFn: async () => {
      if (!schoolId || !orgId) return null;

      const [classesRes, studentsRes, staffRes, feeSchedulesRes, invoicesRes] = await Promise.all([
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("fee_schedules").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      ]);

      return {
        hasClasses: (classesRes.count || 0) > 0,
        hasStudents: (studentsRes.count || 0) > 0,
        hasStaff: (staffRes.count || 0) > 0,
        hasFeeSchedules: (feeSchedulesRes.count || 0) > 0,
        hasInvoices: (invoicesRes.count || 0) > 0,
      };
    },
    enabled: !!schoolId && !!orgId && relevantSteps,
  });

  if (isLoading || !checks) return null;

  const allItems: ChecklistItem[] = [
    {
      key: "classes",
      label: "Set up classes",
      description: "Create classes/grades for your school.",
      icon: Layers,
      link: "/settings",
      linkLabel: "Go to Settings",
      done: checks.hasClasses,
    },
    {
      key: "students",
      label: "Add students",
      description: "Enrol your first students.",
      icon: GraduationCap,
      link: "/students",
      linkLabel: "Go to Students",
      done: checks.hasStudents,
      allowed: canManageStudents(userRole),
    },
    {
      key: "staff",
      label: "Add staff",
      description: "Register teachers and staff.",
      icon: Users,
      link: "/staff",
      linkLabel: "Go to Staff",
      done: checks.hasStaff,
    },
    {
      key: "fees",
      label: "Create fee schedule",
      description: "Set up tuition and other fees.",
      icon: Receipt,
      link: "/fees",
      linkLabel: "Go to Fees",
      done: checks.hasFeeSchedules,
    },
    {
      key: "invoices",
      label: "Generate invoices",
      description: "Bill students for the term.",
      icon: FileText,
      link: "/invoices",
      linkLabel: "Go to Invoices",
      done: checks.hasInvoices,
    },
  ];

  const items = allItems.filter((i) => canSee(i.link, i.allowed ?? true));
  if (items.length === 0) return null;

  const doneCount = items.filter(i => i.done).length;
  const progress = Math.round((doneCount / items.length) * 100);

  // Hide when all complete
  if (doneCount === items.length) return null;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Getting Started</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{doneCount} of {items.length} steps completed</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.done ? CheckCircle2 : Circle;
          return (
            <div key={item.key} className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${item.done ? "opacity-60" : "hover:bg-muted/50"}`}>
              <Icon className={`h-4 w-4 shrink-0 ${item.done ? "text-primary" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : "text-card-foreground"}`}>{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              {!item.done && (
                <Link to={item.link}>
                  <Button variant="ghost" size="sm" className="text-xs shrink-0">{item.linkLabel}</Button>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
