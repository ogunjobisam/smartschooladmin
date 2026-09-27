import { Monitor, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useThemeMode, type ThemeSetting } from "@/hooks/use-theme-mode";

const OPTIONS: { value: ThemeSetting; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Monitor },
];

/**
 * Where "Match system" can be spelled out, unlike the topbar's two-state icon.
 *
 * Says out loud that this is per-device: it is the question everyone asks of a
 * setting that lives on a page otherwise full of school-wide ones.
 */
export function AppearanceCard() {
  const { setting, setSetting } = useThemeMode();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>
          Light or dark, on this device only — it does not change what anyone else at the
          school sees. Your school's colours are the same either way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Appearance" className="flex flex-wrap gap-2">
          {OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = setting === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSetting(value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                  active
                    ? "border-gold bg-gold-soft/40 font-medium text-primary"
                    : "border-border hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 text-gold-ink" />
                {label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
