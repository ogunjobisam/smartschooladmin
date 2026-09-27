import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { DEFAULT_TRAITS, RATING_SCALE, traitKey, type RatingDomain } from "@/lib/term-report";

const DOMAINS: { value: RatingDomain; title: string; hint: string }[] = [
  { value: "affective", title: "Affective", hint: "Character and conduct: punctuality, neatness, honesty…" },
  { value: "psychomotor", title: "Psychomotor", hint: "Practical skills: handwriting, sports, crafts…" },
];

interface TraitRow {
  id: string;
  domain: string;
  key: string;
  label: string;
  position: number;
}

/**
 * The traits a school rates pupils on, on every report card. A school that
 * never opens this keeps the standard list; the first edit copies the standard
 * list in so there is something to change. Ratings refer to a trait by key, so
 * renaming one keeps every rating already given against it, and a report card
 * already released keeps the names it was released with.
 */
export function ReportTraitsCard({ schoolId, canManage }: { schoolId: string | null; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState<Record<RatingDomain, string>>({ affective: "", psychomotor: "" });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-traits", schoolId, "settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("report_traits")
        .select("id, domain, key, label, position")
        .eq("school_id", schoolId!)
        .order("position");
      return (data || []) as TraitRow[];
    },
    enabled: !!schoolId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["report-traits", schoolId] });

  const run = async (work: () => Promise<{ error: unknown }>, failure: string) => {
    setBusy(true);
    const { error } = await work();
    setBusy(false);
    if (error) toast.error(getErrorMessage(error, failure));
    refresh();
  };

  const customise = (domain: RatingDomain) =>
    run(
      async () => supabase.from("report_traits").insert(
        DEFAULT_TRAITS[domain].map((t, i) => ({ school_id: schoolId!, domain, key: t.key, label: t.label, position: i }))
      ),
      "Could not copy the standard list."
    );

  const add = (domain: RatingDomain, own: TraitRow[]) => {
    const label = newLabel[domain].trim();
    if (!label) return;
    setNewLabel((prev) => ({ ...prev, [domain]: "" }));
    return run(
      async () => supabase.from("report_traits").insert({
        school_id: schoolId!,
        domain,
        key: traitKey(label, own.map((t) => t.key)),
        label,
        position: (own.at(-1)?.position ?? -1) + 1,
      }),
      "Could not add the trait."
    );
  };

  const rename = (row: TraitRow, label: string) => {
    const next = label.trim();
    if (!next || next === row.label) return;
    return run(async () => supabase.from("report_traits").update({ label: next }).eq("id", row.id), "Could not rename the trait.");
  };

  const remove = (row: TraitRow) =>
    run(async () => supabase.from("report_traits").delete().eq("id", row.id), "Could not remove the trait.");

  // Positions are swapped rather than renumbered, so a move is two writes.
  const move = (own: TraitRow[], index: number, by: -1 | 1) => {
    const a = own[index];
    const b = own[index + by];
    if (!a || !b) return;
    return run(async () => {
      const first = await supabase.from("report_traits").update({ position: b.position }).eq("id", a.id);
      if (first.error) return first;
      return supabase.from("report_traits").update({ position: a.position }).eq("id", b.id);
    }, "Could not reorder the traits.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" /> Report card traits</CardTitle>
        <CardDescription>
          What pupils are rated on each term, from {RATING_SCALE.at(-1)?.value} ({RATING_SCALE.at(-1)?.label}) to{" "}
          {RATING_SCALE[0].value} ({RATING_SCALE[0].label}). Renaming a trait keeps the ratings already given.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {DOMAINS.map(({ value: domain, title, hint }) => {
          const own = rows.filter((r) => r.domain === domain).sort((a, b) => a.position - b.position);
          const customised = own.length > 0;
          return (
            <div key={domain} className="space-y-2">
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>

              {isLoading ? null : !customised ? (
                <>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {DEFAULT_TRAITS[domain].map((t) => <li key={t.key}>{t.label}</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground">Using the standard list.</p>
                  {canManage && (
                    <Button variant="outline" size="sm" onClick={() => customise(domain)} disabled={busy}>
                      Customise this list
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {own.map((row, i) => (
                    <div key={row.id} className="flex items-center gap-1">
                      {canManage ? (
                        <>
                          <Input
                            key={`${row.id}-${row.label}`}
                            defaultValue={row.label}
                            maxLength={60}
                            aria-label={`${title} trait ${i + 1}`}
                            className="h-8 text-sm"
                            onBlur={(e) => rename(row, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(own, i, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" disabled={busy || i === own.length - 1} onClick={() => move(own, i, 1)}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Remove ${row.label}`} disabled={busy} onClick={() => remove(row)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-sm">{row.label}</span>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        placeholder="Add a trait"
                        maxLength={60}
                        value={newLabel[domain]}
                        onChange={(e) => setNewLabel((prev) => ({ ...prev, [domain]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") add(domain, own); }}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" variant="secondary" onClick={() => add(domain, own)} disabled={busy || !newLabel[domain].trim()}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
