import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { DEFAULT_ID_FORMAT, defaultPrefix, previewId, type IdFormat, type YearPosition } from "@/lib/id-numbers";

type Entity = "student" | "staff";

interface Props {
  schoolId: string | null;
  schoolName: string | null;
  canManage: boolean;
}

const SEPARATORS: { value: string; label: string }[] = [
  { value: "/", label: "Slash  /" },
  { value: "-", label: "Hyphen  -" },
  { value: ".", label: "Dot  ." },
  { value: "", label: "None" },
];

export function IdFormatCard({ schoolId, schoolName, canManage }: Props) {
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

  const { data: missing } = useQuery({
    queryKey: ["missing-id-counts", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const students = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .or("student_id_number.is.null,student_id_number.eq.");
      const staff = await supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .or("staff_id_number.is.null,staff_id_number.eq.");
      return { student: students.count || 0, staff: staff.count || 0 };
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4" /> ID Numbering
        </CardTitle>
        <CardDescription>
          Choose how student and staff ID numbers are built. Numbers are issued in order and can never repeat within this school.
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
              canManage={canManage}
              saved={formats?.find((f) => f.entity === "student")}
              missingCount={missing?.student ?? 0}
              queryClient={queryClient}
            />
            <Separator />
            <EntityFormat
              entity="staff"
              schoolId={schoolId}
              schoolName={schoolName}
              canManage={canManage}
              saved={formats?.find((f) => f.entity === "staff")}
              missingCount={missing?.staff ?? 0}
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
  missingCount: number;
  queryClient: ReturnType<typeof useQueryClient>;
}

function EntityFormat({ entity, schoolId, schoolName, canManage, saved, missingCount, queryClient }: EntityProps) {
  const [form, setForm] = useState<IdFormat>(DEFAULT_ID_FORMAT);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    setForm(
      saved
        ? {
            prefix: saved.prefix || "",
            year_position: (saved.year_position as YearPosition) || "before",
            padding: saved.padding ?? 4,
            separator: saved.separator ?? "/",
          }
        : DEFAULT_ID_FORMAT,
    );
  }, [saved]);

  const fallback = defaultPrefix(schoolName, entity);
  const label = entity === "student" ? "Student IDs" : "Staff IDs";

  const save = async () => {
    if (!schoolId) return;
    if (form.prefix && !/^[A-Za-z0-9-]{1,12}$/.test(form.prefix.trim())) {
      toast.error("The prefix can only contain letters, numbers and hyphens (up to 12 characters).");
      return;
    }
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
    setSaving(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not save the ID format."));
      return;
    }
    toast.success(`${label} format saved. New records will use ${previewId(form, fallback)}.`);
    queryClient.invalidateQueries({ queryKey: ["school-id-formats", schoolId] });
  };

  const backfill = async () => {
    if (!schoolId) return;
    setBackfilling(true);
    const fn = entity === "student" ? "backfill_student_id_numbers" : "backfill_staff_id_numbers";
    const { data, error } = await supabase.rpc(fn, { _school_id: schoolId });
    setBackfilling(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not generate the missing IDs."));
      return;
    }
    const count = Number(data ?? 0);
    toast.success(count === 0 ? `Every ${entity} already has an ID.` : `Generated ${count} ${entity} ID${count === 1 ? "" : "s"}.`);
    queryClient.invalidateQueries({ queryKey: ["missing-id-counts", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
    queryClient.invalidateQueries({ queryKey: ["staff"] });
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
          <Button variant="outline" size="sm" onClick={backfill} disabled={backfilling || missingCount === 0}>
            {backfilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {missingCount === 0 ? "No missing IDs" : `Generate ${missingCount} missing ID${missingCount === 1 ? "" : "s"}`}
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
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save {label.toLowerCase()} format
        </Button>
      )}
    </div>
  );
}
