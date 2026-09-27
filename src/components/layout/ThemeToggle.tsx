import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "@/hooks/use-theme-mode";

/**
 * Two states, not three. A tri-state control needs labels, and a topbar icon
 * has nowhere to put them — "Match system" lives in Settings → Branding, where
 * it can be spelled out.
 */
export function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  const dark = mode === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className="h-9 w-9 shrink-0 rounded-full bg-card"
    >
      {dark
        ? <Sun className="h-4 w-4 text-gold-ink" />
        : <Moon className="h-4 w-4 text-gold-ink" />}
    </Button>
  );
}
