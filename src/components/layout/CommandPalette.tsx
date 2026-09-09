import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  LayoutDashboard, GraduationCap, Users, UserCog, Receipt, FileText, CreditCard,
  Building2, Calculator, Settings, CalendarCheck, BookOpen, Megaphone, ClipboardList, Shield,
  CheckSquare, AlertTriangle, BarChart3, Bell, UserPlus,
} from "lucide-react";

const pages = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Students", url: "/students", icon: GraduationCap },
  { title: "Guardians", url: "/guardians", icon: Users },
  { title: "Staff", url: "/staff", icon: UserCog },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck },
  { title: "Timetable", url: "/timetable", icon: CalendarCheck },
  { title: "My Timetable", url: "/student/timetable", icon: CalendarCheck },
  { title: "Exams", url: "/exams", icon: BookOpen },
  { title: "Fee Schedules", url: "/fees", icon: Receipt },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Arrears", url: "/arrears", icon: AlertTriangle },
  { title: "Payroll", url: "/payroll", icon: Calculator },
  { title: "Approvals", url: "/approvals", icon: CheckSquare },
  { title: "Announcements", url: "/announcements", icon: Megaphone },
  { title: "Reports", url: "/reports", icon: ClipboardList },
  { title: "Audit Log", url: "/audit-log", icon: Shield },
  { title: "Group Overview", url: "/group-overview", icon: BarChart3 },
  { title: "School Profile", url: "/school-profile", icon: Building2 },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Users", url: "/users", icon: UserPlus },
  { title: "Notification Settings", url: "/notification-settings", icon: Bell },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((url: string) => {
    setOpen(false);
    navigate(url);
  }, [navigate]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map((page) => (
            <CommandItem key={page.url} onSelect={() => handleSelect(page.url)} className="gap-2">
              <page.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{page.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [, setOpen] = useState(false);
  return { open: () => setOpen(true) };
}
