import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { DEFAULT_ID_FORMAT, defaultPrefix, previewId, type IdFormat, type YearPosition } from "@/lib/id-numbers";

type Entity = "student" | "staff";

interface Props {
  schoolId: string | null;
  schoolName: string | null;
  orgId?: string | null;
  canManage: boolean;
}

const SEPARATORS: { value: string; label: string }[] = [
  { value: "/", label: "Slash  /" },
  { value: "-", label: "Hyphen  -" },
  { value: ".", label: "Dot  ." },
  { value: "", label: "None" },
];

const YEAR_LABELS: Record<YearPosition, string> = {
  before: "before the number",
  after: "after the number",
  none: "not included",
};

function describeFormat(format: IdFormat, fallback: string): string {
  const sep = format.separator === "" ? "no separator" : `"${format.separator}"`;
  return `prefix ${format.prefix.trim() || `${fallback} (school initials)`}, year ${YEAR_LABELS[format.year_position]}, ${format.padding} digits, ${sep}`;
}

export function IdFormatCard({ schoolId, schoolName, orgId, canManage }: Props) {
  const queryClient = useQueryClient();

  const { data: formats, isLoading } = useQuery({
    queryKey: ["school-id-formats", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_id_formats")
        .select("entity, prefix, year_position, padding, separator")
        .eq("school_id", schoolId!);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["id-number-counts", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const blankStudents = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .or("student_id_number.is.null,student_id_number.eq.");
      const totalStudents = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!);
      const blankStaff = await supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .or("staff_id_number.is.null,staff_id_number.eq.");
      const totalStaff = await supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!);
      return {
        student: { blank: blankStudents.count || 0, total: totalStudents.count || 0 },
        staff: { blank: blankStaff.count || 0, total: totalStaff.count || 0 },
      };
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4" /> ID Numbering
        </CardTitle>
        <CardDescription>
          Choose how student and staff ID numbers are built. Changing the format only affects records that do not have an ID yet —
          IDs already issued are never rewritten, so printed cards, receipts and registers stay correct.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
          </div>
        ) : (
          <>
            <EntityFormat
              entity="student"
              schoolId={schoolId}
              schoolName={schoolName}
              orgId={orgId}
              canManage={canManage}
              saved={formats?.find((f) => f.entity === "student")}
              counts={counts?.student ?? { blank: 0, total: 0 }}
              queryClient={queryClient}
            />
            <Separator />
            <EntityFormat
              entity="staff"
              schoolId={schoolId}
              schoolName={schoolName}
              orgId={orgId}
              canManage={canManage}
              saved={formats?.find((f) => f.entity === "staff")}
              counts={counts?.staff ?? { blank: 0, total: 0 }}
              queryClient={queryClient}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface EntityProps extends Props {
  entity: Entity;
  saved?: { prefix: string | null; year_position: string; padding: number; separator: string };
  counts: { blank: number; total: number };
  queryClient: ReturnType<typeof useQueryClient>;
}

function EntityFormat({ entity, schoolId, schoolName, orgId, canManage, saved, counts, queryClient }: EntityProps) {
  const [form, setForm] = useState<IdFormat>(DEFAULT_ID_FORMAT);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alsoBackfill, setAlsoBackfill] = useState(false);

  const savedFormat: IdFormat = saved
    ? {
        prefix: saved.prefix || "",
        year_position: (saved.year_position as YearPosition) || "before",
        padding: saved.padding ?? 4,
        separator: saved.separator ?? "/",
      }
    : DEFAULT_ID_FORMAT;

  useEffect(() => {
    setForm(savedFormat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const fallback = defaultPrefix(schoolName, entity);
  const label = entity === "student" ? "Student IDs" : "Staff IDs";
  const noun = entity === "student" ? "student" : "staff member";
  const plural = entity === "student" ? "students" : "staff";
  const changed = JSON.stringify(form) !== JSON.stringify(savedFormat);
  const keptCount = Math.max(counts.total - counts.blank, 0);

  const validate = () => {
    if (form.prefix && !/^[A-Za-z0-9-]{1,12}$/.test(form.prefix.trim())) {
      toast.error("The prefix can only contain letters, numbers and hyphens (up to 12 characters).");
      return false;
    }
    return true;
  };

  const runBackfill = async (silent = false) => {
    if (!schoolId) return 0;
    const fn = entity === "student" ? "backfill_student_id_numbers" : "backfill_staff_id_numbers";
    const { data, error } = await supabase.rpc(fn, { _school_id: schoolId });
    if (error) {
      toast.error(getErrorMessage(error, "Could not generate the missing IDs."));
      return 0;
    }
    const count = Number(data ?? 0);
    if (orgId && count > 0) {
      await logAudit({
        orgId,
        action: "id_numbers_backfilled",
        entityType: entity === "student" ? "student_id_number" : "staff_id_number",
        entityId: schoolId,
        detail: `Generated ${count} missing ${plural} ID${count === 1 ? "" : "s"} using ${describeFormat(form, fallback)}. Existing IDs were left unchanged.`,
        newValues: { generated: count, format: form },
      });
    }
    if (!silent) {
      toast.success(count === 0 ? `Every ${noun} already has an ID.` : `Generated ${count} ${plural} ID${count === 1 ? "" : "s"}.`);
    }
    queryClient.invalidateQueries({ queryKey: ["id-number-counts", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
    queryClient.invalidateQueries({ queryKey: ["staff"] });
    return count;
  };

  const applyChange = async () => {
    if (!schoolId) return;
    setSaving(true);
    const { error } = await supabase.from("school_id_formats").upsert(
      {
        school_id: schoolId,
        entity,
        prefix: form.prefix.trim() || null,
        year_position: form.year_position,
        padding: form.padding,
        separator: form.separator,
      },
      { onConflict: "school_id,entity" },
    );
    if (error) {
      setSaving(false);
      toast.error(getErrorMessage(error, "Could not save the ID format."));
      return;
    }

    if (orgId) {
      await logAudit({
        orgId,
        action: "id_format_changed",
        entityType: entity === "student" ? "student_id_format" : "staff_id_format",
        entityId: schoolId,
        detail: `${label} format changed from "${describeFormat(savedFormat, fallback)}" to "${describeFormat(form, fallback)}". Applies to new and blank IDs only; ${keptCount} existing ID${keptCount === 1 ? "" : "s"} left unchanged.`,
        oldValues: savedFormat,
        newValues: form,
      });
    }

    let generated = 0;
    if (alsoBackfill && counts.blank > 0) generated = await runBackfill(true);

    setSaving(false);
    setConfirmOpen(false);
    setAlsoBackfill(false);
    toast.success(
      `${label} format saved. New IDs look like ${previewId(form, fallback)}.` +
        (generated > 0 ? ` ${generated} blank ID${generated === 1 ? "" : "s"} filled in.` : ""),
    );
    queryClient.invalidateQueries({ queryKey: ["school-id-formats", schoolId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            Next number will look like <span className="font-mono">{previewId(form, fallback)}</span>
          </p>
        </div>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setBackfilling(true);
              await runBackfill();
              setBackfilling(false);
            }}
            disabled={backfilling || counts.blank === 0}
          >
            {backfilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {counts.blank === 0 ? "No missing IDs" : `Generate ${counts.blank} missing ID${counts.blank === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label>Prefix</Label>
          <Input
            value={form.prefix}
            placeholder={fallback}
            onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))}
            disabled={!canManage}
            className="font-mono"
            maxLength={12}
          />
          <p className="text-[11px] text-muted-foreground">Blank uses the school initials.</p>
        </div>
        <div className="space-y-2">
          <Label>Year</Label>
          <Select
            value={form.year_position}
            onValueChange={(v) => setForm((f) => ({ ...f, year_position: v as YearPosition }))}
            disabled={!canManage}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="before">Before the number</SelectItem>
              <SelectItem value="after">After the number</SelectItem>
              <SelectItem value="none">Do not include</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Digits</Label>
          <Select
            value={String(form.padding)}
            onValueChange={(v) => setForm((f) => ({ ...f, padding: Number(v) }))}
            disabled={!canManage}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} digits</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Separator</Label>
          <Select value={form.separator} onValueChange={(v) => setForm((f) => ({ ...f, separator: v }))} disabled={!canManage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEPARATORS.map((s) => (
                <SelectItem key={s.label} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={saving || !changed}
            onClick={() => {
              if (!validate()) return;
              setAlsoBackfill(counts.blank > 0);
              setConfirmOpen(true);
            }}
          >
            Review and save {label.toLowerCase()} format
          </Button>
          {!changed && <span className="text-xs text-muted-foreground">No unsaved changes.</span>}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !saving && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Confirm the new {label.toLowerCase()} format
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground">Current</p>
                  <p className="font-mono">{previewId(savedFormat, fallback)}</p>
                  <p className="mt-2 text-muted-foreground">New</p>
                  <p className="font-mono">{previewId(form, fallback)}</p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>
                    <strong>{keptCount}</strong> {plural} already have an ID — these keep exactly the ID they have today.
                  </li>
                  <li>
                    <strong>{counts.blank}</strong> {plural} have no ID yet — these, and everyone added from now on, will use the new
                    format.
                  </li>
                  <li>Numbering continues in sequence, so no two {plural} can ever share an ID.</li>
                  <li>The change is written to the audit log with your name, the old settings and the new ones.</li>
                </ul>
                {counts.blank > 0 && (
                  <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={alsoBackfill}
                      onCheckedChange={(v) => setAlsoBackfill(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Also generate the {counts.blank} missing ID{counts.blank === 1 ? "" : "s"} now using the new format.
                    </span>
                  </label>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void applyChange();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save format
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
