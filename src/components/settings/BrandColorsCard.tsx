import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import {
  BRAND_PRESETS,
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  contrastRatio,
  hsl,
  hexToHsl,
  isBrandColor,
  schoolThemeVars,
} from "@/lib/theme";

interface BrandColorsCardProps {
  /** Persist the pair. Resolves once saved; rejects to keep the card dirty. */
  onSave: (primary: string, accent: string) => Promise<void>;
}

/**
 * Choosing the school's two colours.
 *
 * Two things make this work rather than merely exist. The app repaints *live*
 * as the colours change, because two hex values tell nobody what their school
 * will look like — and the preview is reverted on unmount, so leaving without
 * saving leaves nothing behind. And the fields hydrate from the saved colours
 * once they arrive rather than from whatever was there at first render, which
 * is what used to let a reload straight into Settings save the defaults over a
 * school's real branding.
 */
export function BrandColorsCard({ onSave }: BrandColorsCardProps) {
  const { branding, loading, previewColors } = useSchoolBranding();

  const [primary, setPrimary] = useState(branding.primaryColor);
  const [accent, setAccent] = useState(branding.accentColor);
  const [saving, setSaving] = useState(false);

  // Hydrate once, when the school's real colours land. Not on every change to
  // `branding`, which would throw away an edit in progress the moment
  // something else refetched.
  const hydrated = useRef(false);
  useEffect(() => {
    if (loading || hydrated.current) return;
    hydrated.current = true;
    setPrimary(branding.primaryColor);
    setAccent(branding.accentColor);
  }, [loading, branding.primaryColor, branding.accentColor]);

  const valid = isBrandColor(primary) && isBrandColor(accent);

  // Show the candidate on the whole app, and take it away again on the way
  // out. Half-typed hex is ignored rather than flashing a fallback theme.
  useEffect(() => {
    previewColors(valid ? { primaryColor: primary, accentColor: accent } : null);
  }, [primary, accent, valid, previewColors]);
  useEffect(() => () => previewColors(null), [previewColors]);

  const dirty = primary !== branding.primaryColor || accent !== branding.accentColor;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(primary, accent);
    } catch {
      // The caller has already told the user. Swallowing it here keeps the
      // click handler from rejecting into nothing, and leaving the fields
      // untouched is what lets them press Save again.
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPrimary(DEFAULT_PRIMARY);
    setAccent(DEFAULT_ACCENT);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">School Colours</CardTitle>
        <CardDescription>
          The whole app follows these. Changes show immediately and are only kept when you save.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Ready-made pairs</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BRAND_PRESETS.map((preset) => {
              const active =
                preset.primary.toLowerCase() === primary.toLowerCase() &&
                preset.accent.toLowerCase() === accent.toLowerCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setPrimary(preset.primary);
                    setAccent(preset.accent);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                    active ? "border-gold bg-gold-soft/40" : "border-border hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
                    style={{ backgroundColor: preset.primary }}
                  >
                    <span
                      className="block h-3 w-3 rounded-full"
                      style={{ backgroundColor: preset.accent }}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{preset.name}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-gold-ink" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ColorField
            label="Primary"
            hint="Ink, the sidebar, navy tiles"
            value={primary}
            onChange={setPrimary}
          />
          <ColorField
            label="Accent"
            hint="Gold rules, edge bars, highlights"
            value={accent}
            onChange={setAccent}
          />
        </div>

        <ContrastNote primary={primary} accent={accent} valid={valid} />

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={saving || !valid || !dirty}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save colours
          </Button>
          <Button variant="outline" onClick={reset} disabled={saving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to navy and gold
          </Button>
          {dirty && valid && (
            <span className="text-xs text-muted-foreground">Previewing — not saved yet.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = isBrandColor(value);
  return (
    <div className="space-y-2">
      <Label htmlFor={`brand-${label}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          // The native picker cannot represent a half-typed value, so feed it
          // the last good one rather than letting it snap the field to black.
          value={valid ? value : DEFAULT_PRIMARY}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input"
        />
        <Input
          id={`brand-${label}`}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!valid}
          className={cn("flex-1 font-mono text-sm", !valid && "border-destructive")}
        />
      </div>
      <p className={cn("text-xs", valid ? "text-muted-foreground" : "text-destructive")}>
        {valid ? hint : "Needs a six-digit hex colour, like #15255b."}
      </p>
    </div>
  );
}

/**
 * Says what the pair will actually do, rather than leaving someone to find out
 * after saving.
 *
 * The derivation guarantees legibility whatever is chosen — it lifts and
 * darkens until every pairing clears WCAG — but it cannot invent contrast
 * between the two colours *as picked*. A navy and a midnight blue both work
 * and look like one colour, and that is worth saying out loud.
 */
function ContrastNote({
  primary,
  accent,
  valid,
}: {
  primary: string;
  accent: string;
  valid: boolean;
}) {
  if (!valid) return null;

  const vars = schoolThemeVars(primary, accent);
  const p = hexToHsl(primary);
  const a = hexToHsl(accent);
  const separation = contrastRatio(hsl(p.h, p.s, p.l), hsl(a.h, a.s, a.l));

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Swatch token={vars["--primary"]} label="Ink" />
        <Swatch token={vars["--gold"]} label="Rules" />
        <Swatch token={vars["--gold-ink"]} label="Labels" />
        <Swatch token={vars["--background"]} label="Page" ring />
        <Swatch token={vars["--sidebar-background"]} label="Sidebar" />
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        {separation < 2
          ? "These two are close in tone, so gold details will be quiet against the ink. A lighter or warmer accent will show up more."
          : "Text and rules are adjusted automatically to stay legible on both colours."}
      </p>
    </div>
  );
}

function Swatch({ token, label, ring }: { token: string; label: string; ring?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        aria-hidden
        className={cn("block h-4 w-4 rounded", ring && "ring-1 ring-inset ring-border")}
        style={{ backgroundColor: `hsl(${token})` }}
      />
      {label}
    </span>
  );
}
