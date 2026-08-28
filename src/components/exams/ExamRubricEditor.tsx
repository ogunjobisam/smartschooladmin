import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_RUBRIC } from "@/lib/performance";
import { toast } from "sonner";

interface SubjectOption {
  id: string;
  name: string;
  short_code?: string | null;
}

interface SubjectRow {
  subjectId: string;
  included: boolean;
  maxScore: string;
  weight: string;
}

interface BandRow {
  label: string;
  minPercent: string;
  remark: string;
}

/**
 * Per-exam scoring configuration: which subjects the exam covers, each
 * subject's maximum score and weight, and the grade rubric used to turn
 * percentages into letter grades. Saved to exam_subjects / exam_grade_bands.
 */
export function ExamRubricEditor({
  examId,
  examMaxScore,
  subjects,
  canEdit,
}: {
  examId: string;
  examMaxScore: number;
  subjects: SubjectOption[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<SubjectRow[]>([]);
  const [bands, setBands] = useState<BandRow[]>([]);

  const { data: config = [] } = useQuery({
    queryKey: ["exam-subject-config", examId],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_subjects")
        .select("subject_id, max_score, weight")
        .eq("exam_id", examId);
      return data || [];
    },
    enabled: !!examId,
  });

  const { data: savedBands = [] } = useQuery({
    queryKey: ["exam-grade-bands", examId],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_grade_bands")
        .select("label, min_percent, remark")
        .eq("exam_id", examId)
        .order("min_percent", { ascending: false });
      return data || [];
    },
    enabled: !!examId,
  });

  const configMap = useMemo(
    () => new Map(config.map((c) => [c.subject_id, c])),
    [config]
  );

  // Seed the form from what is saved; unconfigured exams default to every
  // subject at the exam's own max score and equal weight.
  useEffect(() => {
    const noConfig = configMap.size === 0;
    setRows(
      subjects.map((s) => {
        const saved = configMap.get(s.id);
        return {
          subjectId: s.id,
          included: noConfig ? true : !!saved,
          maxScore: String(saved?.max_score ?? examMaxScore),
          weight: String(saved?.weight ?? 1),
        };
      })
    );
  }, [subjects, configMap, examMaxScore]);

  useEffect(() => {
    setBands(
      savedBands.length > 0
        ? savedBands.map((b) => ({
            label: b.label,
            minPercent: String(b.min_percent),
            remark: b.remark ?? "",
          }))
        : DEFAULT_RUBRIC.map((b) => ({
            label: b.label,
            minPercent: String(b.minPercent),
            remark: b.remark ?? "",
          }))
    );
  }, [savedBands]);

  const subjectName = (id: string) => {
    const s = subjects.find((x) => x.id === id);
    return s ? s.name : "Unknown subject";
  };

  const updateRow = (subjectId: string, patch: Partial<SubjectRow>) =>
    setRows((prev) => prev.map((r) => (r.subjectId === subjectId ? { ...r, ...patch } : r)));

  const updateBand = (index: number, patch: Partial<BandRow>) =>
    setBands((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  const handleSave = async () => {
    const included = rows.filter((r) => r.included);
    if (included.length === 0) {
      toast.error("Select at least one subject for this exam.");
      return;
    }
    for (const r of included) {
      const max = Number(r.maxScore);
      const weight = Number(r.weight);
      if (!Number.isFinite(max) || max <= 0) {
        toast.error(`${subjectName(r.subjectId)} needs a maximum score above 0.`);
        return;
      }
      if (!Number.isFinite(weight) || weight <= 0) {
        toast.error(`${subjectName(r.subjectId)} needs a weight above 0.`);
        return;
      }
    }

    const cleanBands = bands
      .map((b) => ({ label: b.label.trim(), min: Number(b.minPercent), remark: b.remark.trim() }))
      .filter((b) => b.label !== "");
    if (cleanBands.length === 0) {
      toast.error("Add at least one grade band.");
      return;
    }
    if (cleanBands.some((b) => !Number.isFinite(b.min) || b.min < 0 || b.min > 100)) {
      toast.error("Each grade band needs a minimum percentage between 0 and 100.");
      return;
    }
    if (new Set(cleanBands.map((b) => b.label.toLowerCase())).size !== cleanBands.length) {
      toast.error("Grade labels must be unique.");
      return;
    }

    setSaving(true);
    await supabase.from("exam_subjects").delete().eq("exam_id", examId);
    const { error: subjectError } = await supabase.from("exam_subjects").insert(
      included.map((r) => ({
        exam_id: examId,
        subject_id: r.subjectId,
        max_score: Math.round(Number(r.maxScore)),
        weight: Number(r.weight),
      }))
    );

    await supabase.from("exam_grade_bands").delete().eq("exam_id", examId);
    const { error: bandError } = await supabase.from("exam_grade_bands").insert(
      cleanBands.map((b) => ({
        exam_id: examId,
        label: b.label,
        min_percent: b.min,
        remark: b.remark || null,
      }))
    );

    setSaving(false);
    const error = subjectError || bandError;
    if (error) {
      toast.error("Could not save the scoring setup: " + error.message);
      return;
    }
    toast.success("Scoring setup saved.");
    queryClient.invalidateQueries({ queryKey: ["exam-subject-config", examId] });
    queryClient.invalidateQueries({ queryKey: ["exam-grade-bands", examId] });
  };

  const summary =
    configMap.size > 0
      ? `${configMap.size} subject${configMap.size === 1 ? "" : "s"} configured • ${
          savedBands.length > 0 ? `${savedBands.length}-band rubric` : "default rubric"
        }`
      : "Not configured yet — every subject scores out of the exam maximum on the default rubric.";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <SlidersHorizontal className="h-4 w-4" /> Subjects &amp; Rubric
          </CardTitle>
          <CardDescription>{summary}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : canEdit ? "Configure" : "View"}
        </Button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-6">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Subjects in this exam</Label>
            <div className="mt-2 overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Include</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-[130px]">Max score</TableHead>
                    <TableHead className="w-[130px]">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No subjects are assigned to this class yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.subjectId}>
                        <TableCell>
                          <Checkbox
                            checked={r.included}
                            disabled={!canEdit}
                            onCheckedChange={(v) => updateRow(r.subjectId, { included: v === true })}
                            aria-label={`Include ${subjectName(r.subjectId)}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{subjectName(r.subjectId)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            className="h-8"
                            disabled={!canEdit || !r.included}
                            value={r.maxScore}
                            onChange={(e) => updateRow(r.subjectId, { maxScore: e.target.value })}
                            aria-label={`Maximum score for ${subjectName(r.subjectId)}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            className="h-8"
                            disabled={!canEdit || !r.included}
                            value={r.weight}
                            onChange={(e) => updateRow(r.subjectId, { weight: e.target.value })}
                            aria-label={`Weight for ${subjectName(r.subjectId)}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">Grade rubric</Label>
            <div className="mt-2 space-y-2">
              {bands.map((b, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    className="h-8 sm:w-[90px]"
                    placeholder="Grade"
                    disabled={!canEdit}
                    value={b.label}
                    onChange={(e) => updateBand(i, { label: e.target.value })}
                    aria-label={`Grade label ${i + 1}`}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">from</span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-8 w-[90px]"
                      disabled={!canEdit}
                      value={b.minPercent}
                      onChange={(e) => updateBand(i, { minPercent: e.target.value })}
                      aria-label={`Minimum percentage for band ${i + 1}`}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <Input
                    className="h-8 flex-1"
                    placeholder="Remark (e.g. Excellent)"
                    disabled={!canEdit}
                    value={b.remark}
                    onChange={(e) => updateBand(i, { remark: e.target.value })}
                    aria-label={`Remark for band ${i + 1}`}
                  />
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => setBands((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove band ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBands((prev) => [...prev, { label: "", minPercent: "0", remark: "" }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add band
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setBands(
                      DEFAULT_RUBRIC.map((b) => ({
                        label: b.label,
                        minPercent: String(b.minPercent),
                        remark: b.remark ?? "",
                      }))
                    )
                  }
                >
                  Reset to default rubric
                </Button>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Save scoring setup
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
