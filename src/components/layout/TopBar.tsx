import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function TopBar() {
  const { schools, schoolId, setSchoolId, orgs, orgId, setOrgId } = useAuth();

  const openCommandPalette = () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:gap-3 sm:px-4">
      <SidebarTrigger className="shrink-0" />

      {orgs.length > 1 && (
        <Select value={orgId || ""} onValueChange={setOrgId}>
          <SelectTrigger className="h-8 w-[130px] text-xs sm:w-[190px]">
            <SelectValue placeholder="Select organisation" />
          </SelectTrigger>
          <SelectContent>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {schools.length > 1 && (
        <Select value={schoolId || ""} onValueChange={setSchoolId}>
          <SelectTrigger className="h-8 w-[150px] text-xs sm:w-[220px]">
            <SelectValue placeholder="Select School" />
          </SelectTrigger>
          <SelectContent>
            {schools.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {schools.length === 1 && (
        <span className="truncate text-xs font-medium text-muted-foreground">{schools[0].name}</span>
      )}

      <div className="flex-1" />

      <Button variant="outline" size="sm" className="hidden gap-2 text-xs text-muted-foreground md:flex" onClick={openCommandPalette}>
        <Search className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>

      <NotificationBell />
    </header>
  );
}
