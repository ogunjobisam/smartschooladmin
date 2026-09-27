import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  LayoutDashboard, GraduationCap, Users, UserCog, Receipt, FileText, CreditCard,
  Building2, Calculator, Settings, CalendarCheck, BookOpen, Megaphone, ClipboardList, Shield,
  CheckSquare, AlertTriangle, BarChart3, Bell, UserPlus, Download, Loader2, Layers, Library,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessPath } from "@/lib/access";
import {
  HEADING_BY_KIND, pageMatches, searchRecords, searchTerms,
  type SearchClient, type SearchHit, type SearchKind,
} from "@/lib/global-search";

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
  { title: "Data Export", url: "/settings/data-export", icon: Download },
  { title: "Group Overview", url: "/group-overview", icon: BarChart3 },
  { title: "School Profile", url: "/school-profile", icon: Building2 },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Users", url: "/users", icon: UserPlus },
  { title: "Notification Settings", url: "/notification-settings", icon: Bell },
];

const ICON_BY_KIND: Record<SearchKind, LucideIcon> = {
  student: GraduationCap,
  staff: UserCog,
  guardian: Users,
  invoice: FileText,
  exam: BookOpen,
  subject: Library,
  class: Layers,
};

/** The query once typing has paused, so each keystroke is not a round trip. */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { userRole, schoolId, orgId } = useAuth();

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

  // A fresh search each time the palette opens.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleSelect = useCallback((url: string) => {
    setOpen(false);
    navigate(url);
  }, [navigate]);

  const debounced = useDebounced(query, 250);
  const terms = useMemo(() => searchTerms(debounced), [debounced]);

  // Only the pages this role can open, as in the sidebar.
  const visiblePages = useMemo(() => {
    const allowed = pages.filter((p) => canAccessPath(userRole, p.url));
    const typed = query.trim().split(/\s+/).filter(Boolean);
    return typed.length ? allowed.filter((p) => pageMatches(p.title, typed)) : allowed;
  }, [userRole, query]);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["global-search", debounced, userRole, schoolId, orgId],
    queryFn: () =>
      searchRecords(supabase as unknown as SearchClient, debounced, { role: userRole, schoolId, orgId }),
    enabled: open && terms.length > 0,
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const byKind = new Map<SearchKind, SearchHit[]>();
    for (const hit of hits) byKind.set(hit.kind, [...(byKind.get(hit.kind) ?? []), hit]);
    return [...byKind.entries()];
  }, [hits]);

  const searching = terms.length > 0 && (isFetching || debounced !== query);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Search pupils, staff, guardians, subjects, pages…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {searching && hits.length === 0 && visiblePages.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        ) : (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {groups.map(([kind, items]) => {
          const Icon = ICON_BY_KIND[kind];
          return (
            <CommandGroup key={kind} heading={HEADING_BY_KIND[kind]}>
              {items.map((hit) => (
                <CommandItem
                  key={`${hit.kind}:${hit.id}`}
                  value={`${hit.kind}:${hit.id}`}
                  onSelect={() => handleSelect(hit.url)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {visiblePages.length > 0 && (
          <CommandGroup heading="Pages">
            {visiblePages.map((page) => (
              <CommandItem
                key={page.url}
                value={`page:${page.url}`}
                onSelect={() => handleSelect(page.url)}
                className="gap-2"
              >
                <page.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{page.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [, setOpen] = useState(false);
  return { open: () => setOpen(true) };
}
