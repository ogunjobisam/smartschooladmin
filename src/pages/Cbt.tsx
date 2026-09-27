import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, FileUp, MonitorCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CBT_CSV_TEMPLATE, importQuestionsCsv, type ImportedOption, type ImportResult } from "@/lib/cbt";
import { getErrorMessage } from "@/lib/errors";
import { displayClassName } from "@/lib/sections";

const NO_EXAM = "none";
const LETTERS = ["a", "b", "c", "d", "e"];

interface Option {
  id: string;
  name: string;
}

function useSchoolOptions(schoolId: string | null) {
  const classes = useQuery({
    queryKey: ["cbt-classes", schoolId],
    queryFn: async (): Promise<Option[]> => {
      const { data } = await supabase
        .from("classes")
        .select("id, name, level_order")
        .eq("school_id", schoolId!)
        .order("level_order", { nullsFirst: false });
      return (data ?? []).map((c) => ({ id: c.id, name: displayClassName(c.name) || "Unnamed class" }));
    },
    enabled: !!schoolId,
  });
  const subjects = useQuery({
    queryKey: ["cbt-subjects", schoolId],
    queryFn: async (): Promise<Option[]> => {
      const { data } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
    enabled: !!schoolId,
  });
  return { classes: classes.data ?? [], subjects: subjects.data ?? [] };
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "published") return "default";
  if (status === "closed") return "secondary";
  return "outline";
}

/**
 * Computer-based testing for staff: the school's question bank and the tests
 * built from it. Pupils sit the tests from their portal; marking happens in
 * the database, and a graded test linked to an exam fills that exam's marks.
 */
export default function Cbt() {
  const { schoolId } = useAuth();
  const { classes, subjects } = useSchoolOptions(schoolId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Computer-based tests"
        description="Build a question bank, set tests for a class, and let the marks flow into exams."
      />
      <Tabs defaultValue="tests">
        <TabsList>
          <TabsTrigger value="tests">Tests</TabsTrigger>
          <TabsTrigger value="bank">Question bank</TabsTrigger>
        </TabsList>
        <TabsContent value="tests" className="mt-4">
          <TestsTab schoolId={schoolId} classes={classes} subjects={subjects} />
        </TabsContent>
        <TabsContent value="bank" className="mt-4">
          <QuestionBankTab schoolId={schoolId} subjects={subjects} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Tests ------------------------------------------------------------------

function TestsTab({ schoolId, classes, subjects }: { schoolId: string | null; classes: Option[]; subjects: Option[] }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["cbt-tests", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cbt_tests")
        .select("id, title, mode, status, duration_minutes, opens_at, closes_at, class_id, subject_id, cbt_test_questions(count)")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schoolId,
  });

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)} disabled={!schoolId}>
          <Plus className="h-3.5 w-3.5" /> New test
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : tests.length === 0 ? (
        <EmptyState
          icon={MonitorCheck}
          title="No tests yet"
          description="Add questions to the bank, then create a test for a class."
          actionLabel="New test"
          onAction={() => setCreating(true)}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="hidden sm:table-cell">Subject</TableHead>
                  <TableHead className="hidden md:table-cell">Window</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((t) => {
                  const count = (t.cbt_test_questions as unknown as { count: number }[])?.[0]?.count ?? 0;
                  return (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/cbt/${t.id}`)}>
                      <TableCell>
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.mode === "practice" ? "Practice" : "Graded"} · {count} question{count === 1 ? "" : "s"} ·{" "}
                          {t.duration_minutes} min
                        </div>
                      </TableCell>
                      <TableCell>{className(t.class_id)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{subjectName(t.subject_id)}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {t.opens_at ? format(new Date(t.opens_at), "d MMM, HH:mm") : "Any time"}
                        {t.closes_at ? ` – ${format(new Date(t.closes_at), "d MMM, HH:mm")}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(t.status)} className="capitalize">{t.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <CreateTestDialog
        open={creating}
        onOpenChange={setCreating}
        schoolId={schoolId}
        classes={classes}
        subjects={subjects}
        onCreated={(id) => navigate(`/cbt/${id}`)}
      />
    </div>
  );
}

function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

function CreateTestDialog({
  open, onOpenChange, schoolId, classes, subjects, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  classes: Option[];
  subjects: Option[];
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [mode, setMode] = useState<"graded" | "practice">("graded");
  const [examId, setExamId] = useState(NO_EXAM);
  const [duration, setDuration] = useState("30");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [attempts, setAttempts] = useState("1");
  const [instructions, setInstructions] = useState("");
  const [showScore, setShowScore] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: exams = [] } = useQuery({
    queryKey: ["cbt-exam-options", schoolId, classId],
    queryFn: async () => {
      let q = supabase
        .from("exams")
        .select("id, name, class_id, academic_periods(name)")
        .eq("school_id", schoolId!)
        .neq("status", "closed")
        .order("created_at", { ascending: false });
      q = classId ? q.or(`class_id.is.null,class_id.eq.${classId}`) : q.is("class_id", null);
      const { data } = await q;
      return data ?? [];
    },
    enabled: open && !!schoolId && mode === "graded",
  });

  const save = async () => {
    if (!schoolId || !title.trim() || !classId || !subjectId) {
      toast.error("Give the test a title, a class and a subject.");
      return;
    }
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
      toast.error("Duration must be between 1 and 600 minutes.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("cbt_tests")
        .insert({
          school_id: schoolId,
          class_id: classId,
          subject_id: subjectId,
          title: title.trim(),
          instructions: instructions.trim() || null,
          mode,
          exam_id: mode === "graded" && examId !== NO_EXAM ? examId : null,
          duration_minutes: minutes,
          opens_at: toIso(opensAt),
          closes_at: toIso(closesAt),
          max_attempts: attempts === "unlimited" ? null : Number(attempts),
          show_score_after: mode === "practice" ? true : showScore,
        })
        .select("id")
        .single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["cbt-tests"] });
      toast.success("Test created. Now add its questions.");
      onOpenChange(false);
      onCreated(data.id);
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not create the test"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New test</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cbt-title">Title</Label>
            <Input id="cbt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="JSS1 Maths mid-term" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setExamId(NO_EXAM); }}>
                <SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Choose a subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "graded" | "practice")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="graded">Graded</SelectItem>
                  <SelectItem value="practice">Practice (score shown, not recorded)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cbt-duration">Duration (minutes)</Label>
              <Input id="cbt-duration" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          {mode === "graded" && (
            <div className="grid gap-1.5">
              <Label>Record marks in exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EXAM}>Don't record — results stay on this page</SelectItem>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}{e.academic_periods?.name ? ` (${e.academic_periods.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Each pupil's best sitting is scaled to the exam's maximum for this subject and written as their mark.
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cbt-opens">Opens</Label>
              <Input id="cbt-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cbt-closes">Closes</Label>
              <Input id="cbt-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Attempts allowed</Label>
              <Select value={attempts} onValueChange={setAttempts}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "5"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "graded" && (
              <div className="flex items-center gap-2 pt-6">
                <Switch id="cbt-show" checked={showScore} onCheckedChange={setShowScore} />
                <Label htmlFor="cbt-show">Show pupils their score</Label>
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cbt-instructions">Instructions (optional)</Label>
            <Textarea id="cbt-instructions" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create test"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Question bank ----------------------------------------------------------

function QuestionBankTab({ schoolId, subjects }: { schoolId: string | null; subjects: Option[] }) {
  const queryClient = useQueryClient();
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["cbt-questions", schoolId, subjectFilter],
    queryFn: async () => {
      let q = supabase
        .from("cbt_questions")
        .select("id, subject_id, prompt, question_type, options, correct_option, marks, topic")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (subjectFilter !== "all") q = q.eq("subject_id", subjectFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schoolId,
  });

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "—";

  const remove = async (id: string) => {
    const { error } = await supabase.from("cbt_questions").delete().eq("id", id);
    if (error) toast.error(getErrorMessage(error, "Could not delete the question"));
    else {
      toast.success("Question deleted");
      queryClient.invalidateQueries({ queryKey: ["cbt-questions"] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImporting(true)} disabled={!schoolId}>
            <FileUp className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)} disabled={!schoolId}>
            <Plus className="h-3.5 w-3.5" /> Add question
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={MonitorCheck}
          title="The question bank is empty"
          description="Add questions one by one, or import a whole paper from a spreadsheet."
          actionLabel="Import CSV"
          onAction={() => setImporting(true)}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead className="hidden sm:table-cell">Subject</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => {
                  const options = (q.options as unknown as ImportedOption[]) ?? [];
                  const answer = options.find((o) => o.id === q.correct_option);
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="max-w-md">
                        <div className="line-clamp-2 whitespace-pre-wrap">{q.prompt}</div>
                        {q.topic && <div className="text-xs text-muted-foreground">{q.topic}</div>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{subjectName(q.subject_id)}</TableCell>
                      <TableCell className="text-sm">
                        {q.correct_option.toUpperCase()}. {answer?.text}
                      </TableCell>
                      <TableCell className="text-right">{Number(q.marks)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Delete question" onClick={() => remove(q.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <AddQuestionDialog open={adding} onOpenChange={setAdding} schoolId={schoolId} subjects={subjects}
        defaultSubject={subjectFilter === "all" ? "" : subjectFilter} />
      <ImportQuestionsDialog open={importing} onOpenChange={setImporting} schoolId={schoolId} subjects={subjects}
        defaultSubject={subjectFilter === "all" ? "" : subjectFilter} />
    </div>
  );
}

function AddQuestionDialog({
  open, onOpenChange, schoolId, subjects, defaultSubject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  subjects: Option[];
  defaultSubject: string;
}) {
  const queryClient = useQueryClient();
  const [subjectId, setSubjectId] = useState(defaultSubject);
  const [prompt, setPrompt] = useState("");
  const [topic, setTopic] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState("a");
  const [marks, setMarks] = useState("1");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPrompt("");
    setOptions(["", "", "", ""]);
    setCorrect("a");
  };

  const save = async (keepOpen: boolean) => {
    const filled = options.map((text, i) => ({ id: LETTERS[i], text: text.trim() })).filter((o) => o.text);
    const subject = subjectId || defaultSubject;
    if (!schoolId || !subject || !prompt.trim()) {
      toast.error("Choose a subject and write the question.");
      return;
    }
    if (filled.length < 2) {
      toast.error("Give at least two options.");
      return;
    }
    if (!filled.some((o) => o.id === correct)) {
      toast.error("The correct answer must be one of the options you filled in.");
      return;
    }
    const isTrueFalse = filled.length === 2 && filled[0].text.toLowerCase() === "true" && filled[1].text.toLowerCase() === "false";
    setSaving(true);
    const { error } = await supabase.from("cbt_questions").insert({
      school_id: schoolId,
      subject_id: subject,
      prompt: prompt.trim(),
      topic: topic.trim() || null,
      question_type: isTrueFalse ? "true_false" : "mcq",
      options: filled,
      correct_option: correct,
      marks: Number(marks) || 1,
    });
    setSaving(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not save the question"));
      return;
    }
    toast.success("Question added");
    queryClient.invalidateQueries({ queryKey: ["cbt-questions"] });
    reset();
    if (!keepOpen) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add question</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Subject</Label>
              <Select value={subjectId || defaultSubject} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Choose a subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-topic">Topic (optional)</Label>
              <Input id="q-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="q-prompt">Question</Label>
            <Textarea id="q-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Options — tick the correct one</Label>
            {options.map((text, i) => (
              <div key={LETTERS[i]} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  aria-label={`Option ${LETTERS[i].toUpperCase()} is correct`}
                  checked={correct === LETTERS[i]}
                  onChange={() => setCorrect(LETTERS[i])}
                  className="h-4 w-4 accent-primary"
                />
                <span className="w-4 text-sm font-medium">{LETTERS[i].toUpperCase()}</span>
                <Input
                  value={text}
                  onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                />
              </div>
            ))}
            <div className="flex gap-2">
              {options.length < 5 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setOptions((p) => [...p, ""])}>Add option E</Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => { setOptions(["True", "False"]); setCorrect("a"); }}>
                Make it true/false
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5 sm:w-32">
            <Label htmlFor="q-marks">Marks</Label>
            <Input id="q-marks" type="number" min={0.5} step={0.5} value={marks} onChange={(e) => setMarks(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => save(true)} disabled={saving}>Save and add another</Button>
          <Button onClick={() => save(false)} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportQuestionsDialog({
  open, onOpenChange, schoolId, subjects, defaultSubject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  subjects: Option[];
  defaultSubject: string;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [subjectId, setSubjectId] = useState(defaultSubject);
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saving, setSaving] = useState(false);

  const downloadTemplate = () => {
    const blob = new Blob([CBT_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cbt-questions-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(importQuestionsCsv(await file.text()));
  };

  const count = result?.questions.length ?? 0;
  const subject = subjectId || defaultSubject;

  const save = async () => {
    if (!schoolId || !subject || !result || count === 0) return;
    setSaving(true);
    const rows = result.questions.map((q) => ({
      school_id: schoolId,
      subject_id: subject,
      topic: topic.trim() || null,
      prompt: q.prompt,
      question_type: q.question_type,
      options: q.options as unknown as never,
      correct_option: q.correct_option,
      marks: q.marks,
    }));
    const { error } = await supabase.from("cbt_questions").insert(rows);
    setSaving(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not import the questions"));
      return;
    }
    toast.success(`${count} question${count === 1 ? "" : "s"} imported`);
    queryClient.invalidateQueries({ queryKey: ["cbt-questions"] });
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import questions from CSV</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            One question per row: <span className="font-mono text-xs">question, option_a … option_e, answer, marks</span>.
            The answer is the option letter or its text.
          </p>
          <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" /> Download template
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Choose a subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="imp-topic">Topic (optional)</Label>
              <Input id="imp-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
          </div>
          <Input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          {result && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{count}</span> question{count === 1 ? "" : "s"} ready to import.
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                  <p className="font-medium">{result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped:</p>
                  <ul className="list-disc pl-4">
                    {result.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || count === 0 || !subject}>
            {saving ? "Importing…" : `Import ${count || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
