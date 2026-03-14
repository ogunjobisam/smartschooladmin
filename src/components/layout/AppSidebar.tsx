import {
  LayoutDashboard, Users, GraduationCap, UserCog, Receipt,
  FileText, CreditCard, AlertTriangle, Calculator, CheckSquare,
  ClipboardList, Settings, Shield, Building2, ChevronDown, LogOut, UserPlus, BarChart3, CalendarCheck, BookOpen,
  Megaphone, Bell, MessageSquareText
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard };

const allNav = {
  overview: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Students", url: "/students", icon: GraduationCap },
    { title: "Guardians", url: "/guardians", icon: Users },
    { title: "Staff", url: "/staff", icon: UserCog },
    { title: "Attendance", url: "/attendance", icon: CalendarCheck },
    { title: "Exams", url: "/exams", icon: BookOpen },
  ] as NavItem[],
  finance: [
    { title: "Fee Schedules", url: "/fees", icon: Receipt },
    { title: "Invoices", url: "/invoices", icon: FileText },
    { title: "Payments", url: "/payments", icon: CreditCard },
    { title: "Arrears", url: "/arrears", icon: AlertTriangle },
  ] as NavItem[],
  operations: [
    { title: "Payroll", url: "/payroll", icon: Calculator },
    { title: "Approvals", url: "/approvals", icon: CheckSquare },
    { title: "Group Overview", url: "/group-overview", icon: BarChart3 },
    { title: "Reports", url: "/reports", icon: ClipboardList },
    { title: "Audit Log", url: "/audit-log", icon: Shield },
  ] as NavItem[],
  system: [
    { title: "Settings", url: "/settings", icon: Settings },
    { title: "Users", url: "/users", icon: UserPlus },
  ] as NavItem[],
};

// Role-based visibility rules
const roleNavAccess: Record<string, { overview: string[]; finance: string[]; operations: string[]; system: string[] }> = {
  super_admin: {
    overview: ["Dashboard", "Students", "Guardians", "Staff", "Attendance", "Exams"],
    finance: ["Fee Schedules", "Invoices", "Payments", "Arrears"],
    operations: ["Payroll", "Approvals", "Group Overview", "Reports", "Audit Log"],
    system: ["Settings", "Users"],
  },
  proprietor: {
    overview: ["Dashboard", "Students", "Guardians", "Staff", "Attendance", "Exams"],
    finance: ["Fee Schedules", "Invoices", "Payments", "Arrears"],
    operations: ["Payroll", "Approvals", "Group Overview", "Reports", "Audit Log"],
    system: ["Settings", "Users"],
  },
  group_admin: {
    overview: ["Dashboard", "Students", "Guardians", "Staff", "Attendance", "Exams"],
    finance: ["Fee Schedules", "Invoices", "Payments", "Arrears"],
    operations: ["Payroll", "Approvals", "Group Overview", "Reports", "Audit Log"],
    system: ["Settings"],
  },
  principal: {
    overview: ["Dashboard", "Students", "Guardians", "Staff", "Attendance", "Exams"],
    finance: ["Invoices", "Arrears"],
    operations: ["Approvals", "Reports"],
    system: [],
  },
  bursar: {
    overview: ["Dashboard", "Students", "Guardians"],
    finance: ["Fee Schedules", "Invoices", "Payments", "Arrears"],
    operations: ["Payroll", "Reports"],
    system: [],
  },
  finance_officer: {
    overview: ["Dashboard", "Students"],
    finance: ["Invoices", "Payments", "Arrears"],
    operations: ["Reports"],
    system: [],
  },
  hr_admin: {
    overview: ["Dashboard", "Staff"],
    finance: [],
    operations: ["Payroll", "Reports"],
    system: [],
  },
  teacher: {
    overview: ["Dashboard", "Students", "Attendance", "Exams"],
    finance: [],
    operations: [],
    system: [],
  },
  parent: {
    overview: ["Dashboard"],
    finance: ["Invoices", "Payments"],
    operations: [],
    system: [],
  },
};

function filterNav(items: NavItem[], allowedTitles: string[]): NavItem[] {
  return items.filter(item => allowedTitles.includes(item.title));
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, userRole, signOut } = useAuth();
  const { branding } = useSchoolBranding();
  const isActive = (path: string) => location.pathname === path;

  const access = roleNavAccess[userRole || "teacher"];
  const overviewNav = filterNav(allNav.overview, access.overview);
  const financeNav = filterNav(allNav.finance, access.finance);
  const operationsNav = filterNav(allNav.operations, access.operations);
  const systemNav = filterNav(allNav.system, access.system);

  const displayName = user?.user_metadata?.full_name || user?.email || 'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const renderGroup = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-muted text-[11px] font-semibold uppercase tracking-wider">
          {!collapsed && label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <NavLink to="/dashboard" className="flex items-center gap-2.5">
          {branding.logoUrl ? (
            <Avatar className="h-8 w-8 shrink-0 rounded-lg">
              <AvatarImage src={branding.logoUrl} alt={branding.name} />
              <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {branding.name[0]}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
              <Building2 className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-accent-foreground">{branding.name}</span>
              <span className="text-[11px] text-sidebar-muted capitalize">{branding.tagline || userRole?.replace("_", " ") || 'User'}</span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {renderGroup("Overview", overviewNav)}
        {renderGroup("Finance", financeNav)}
        {renderGroup("Operations", operationsNav)}
        {renderGroup("System", systemNav)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium text-sidebar-accent-foreground">{displayName}</span>
                    <span className="truncate text-[11px] text-sidebar-muted">{user?.email}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-sidebar-muted" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Switch School</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
