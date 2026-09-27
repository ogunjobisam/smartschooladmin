import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function TopBar() {
  const { schools, schoolId, setSchoolId, orgs, orgId, setOrgId } = useAuth();
  const { branding } = useSchoolBranding();

  const openCommandPalette = () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b-2 border-gold/45 bg-[hsl(var(--panel-band))] px-3 sm:gap-3 sm:px-4">
      <SidebarTrigger className="shrink-0 rounded-full border border-border bg-card" />

      {/* Each school's own crest, so the bar belongs to the school rather than
          to the product. Falls back to the initial when none is set. */}
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-contain ring-1 ring-gold/50"
        />
      ) : (
        <span
          aria-hidden
          className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tile text-sm font-bold text-gold-on-primary ring-1 ring-gold/50"
        >
          {(branding.name || "S").charAt(0)}
        </span>
      )}

      {orgs.length > 1 && (
        <Select value={orgId || ""} onValueChange={setOrgId}>
          <SelectTrigger className="h-9 w-[130px] rounded-full bg-card text-xs sm:w-[190px]">
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
          <SelectTrigger className="h-9 w-[150px] rounded-full bg-card text-xs sm:w-[220px]">
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
        <span className="font-display truncate text-sm font-semibold text-primary">
          {schools[0].name}
        </span>
      )}

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        className="hidden gap-2 rounded-full bg-card text-xs text-muted-foreground md:flex"
        onClick={openCommandPalette}
      >
        <Search className="h-3.5 w-3.5 text-gold-ink" />
        <span>Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>

      {/* Search has no room for its label on a phone, but still needs reaching. */}
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 rounded-full bg-card md:hidden"
        onClick={openCommandPalette}
        aria-label="Search"
      >
        <Search className="h-4 w-4 text-gold-ink" />
      </Button>

      <ThemeToggle />

      <NotificationBell />
    </header>
  );
}
