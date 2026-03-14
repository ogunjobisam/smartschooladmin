import { Bell, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { currentUser, dashboardStats, schools } from "@/lib/mock-data";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger className="shrink-0" />

      <Select defaultValue="all">
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="All Schools" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Schools</SelectItem>
          {schools.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name} — {s.campus}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex-1" />

      <Button variant="outline" size="sm" className="hidden gap-2 text-xs text-muted-foreground md:flex">
        <Search className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
        {dashboardStats.pendingApprovals > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {dashboardStats.pendingApprovals}
          </span>
        )}
      </Button>
    </header>
  );
}
