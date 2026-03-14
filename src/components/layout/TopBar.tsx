import { Bell, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function TopBar() {
  const { schools, schoolId, setSchoolId } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger className="shrink-0" />

      {schools.length > 1 && (
        <Select value={schoolId || ""} onValueChange={setSchoolId}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
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
        <span className="text-xs font-medium text-muted-foreground">{schools[0].name}</span>
      )}

      <div className="flex-1" />

      <Button variant="outline" size="sm" className="hidden gap-2 text-xs text-muted-foreground md:flex">
        <Search className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
      </Button>
    </header>
  );
}
