import {
  LayoutDashboard, Users, GraduationCap, UserCog, Receipt,
  FileText, CreditCard, AlertTriangle, Calculator, CheckSquare,
  ClipboardList, Settings, Shield, Building2, ChevronDown, LogOut, UserPlus, BarChart3, CalendarCheck, BookOpen,
  Megaphone, Bell, MessageSquareText, LineChart, CalendarDays, Bus, Inbox, Award, Medal, CalendarRange
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { navItemsForRole, portalPathForRole, profileLinkForRole, type NavGroup, type NavItem } from "@/lib/access";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

/** Icons live here; titles, urls and role access come from the shared access map. */
const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  admissions: Inbox,
  students: GraduationCap,
  guardians: Users,
  staff: UserCog,
  attendance: CalendarCheck,
  timetable: CalendarRange,
  "my-timetable": CalendarRange,
  exams: BookOpen,
  performance: LineChart,
  achievements: Award,
  wall: Medal,
  fees: Receipt,
  invoices: FileText,
  payments: CreditCard,
  arrears: AlertTriangle,
  events: CalendarDays,
  announcements: Megaphone,
  templates: MessageSquareText,
  preferences: Bell,
  transport: Bus,
  payroll: Calculator,
  approvals: CheckSquare,
  "group-overview": BarChart3,
  reports: ClipboardList,
  "audit-log": Shield,
  "school-profile": Building2,
  settings: Settings,
  users: UserPlus,
};

const GROUP_LABELS: Record<NavGroup, string> = {
  overview: "Overview",
  finance: "Finance",
  communications: "Communications",
  operations: "Operations",
  system: "System",
};

const GROUP_ORDER: NavGroup[] = ["overview", "finance", "communications", "operations", "system"];

// Parents and students land on their own portal rather than the school dashboard.


export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  // On a phone the sidebar is a full-width sheet, so labels must always show —
  // the desktop "collapsed" width has no meaning there.
  const collapsed = !isMobile && state === "collapsed";
  // Tapping a link on a phone should take you there, not leave the menu covering
  // the page you just asked for.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const location = useLocation();
  const { user, userRole, signOut } = useAuth();
  const { branding } = useSchoolBranding();
  const isActive = (path: string) => location.pathname === path;

  const navItems = navItemsForRole(userRole);

  const displayName = user?.user_metadata?.full_name || user?.email || 'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const portalPath = portalPathForRole(userRole);

  const resolveUrl = (url: string) => (url === "/dashboard" && portalPath ? portalPath : url);

  const renderGroup = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <SidebarGroup key={label}>
        <SidebarGroupLabel className="text-sidebar-muted text-[11px] font-semibold uppercase tracking-wider">
          {!collapsed && label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const url = resolveUrl(item.url);
              const Icon = NAV_ICONS[item.key] ?? LayoutDashboard;
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(url)}>
                    <NavLink
                      to={url}
                      end={url === "/"}
                      onClick={closeOnMobile}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <NavLink to={portalPath ?? "/dashboard"} onClick={closeOnMobile} className="flex min-w-0 items-center gap-2.5">
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
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">{branding.name}</span>
              <span className="truncate text-[11px] text-sidebar-muted capitalize">{branding.tagline || userRole?.replace("_", " ") || 'User'}</span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {GROUP_ORDER.map((group) =>
          renderGroup(GROUP_LABELS[group], navItems.filter((i) => i.group === group))
        )}
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
            <DropdownMenuItem asChild>
              <NavLink to={profileLinkForRole(userRole)} onClick={closeOnMobile} className="w-full">Profile &amp; Settings</NavLink>
            </DropdownMenuItem>
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
