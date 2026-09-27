import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Clock, Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csv-export";
import { getErrorMessage } from "@/lib/errors";
import { displayClassName } from "@/lib/sections";
import type { ImportedOption } from "@/lib/cbt";

/**
 * One CBT test: its paper, its status, and every pupil's sitting. Once anyone
 * has sat it the paper is frozen by the database, so the screen stops offering
 * changes rather than letting them fail.
 */
export default function CbtTestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: test, isLoading } = useQuery({
    queryKey: ["cbt-test", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cbt_tests")
        .select("*, classes(name), subjects(name), exams(name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: paper = [] } = useQuery({
    queryKey: ["cbt-test-paper", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cbt_test_questions")
        .select("position, question_id, cbt_questions(id, prompt, options, correct_option, marks)")
        .eq("test_id", id!)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["cbt-test-attempts", id],
    queryFn: async () => {
      // Mark anything whose time has run out before showing results.
      await supabase.rpc("cbt_close_overdue", { _test_id: id! });
      const { data, error } = await supabase
        .from("cbt_attempts")
        .select("id, attempt_no, status, started_at, deadline_at, submitted_at, score, max_score, students(first_name, last_name, student_id_number)")
        .eq("test_id", id!)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cbt-test", id] });
    queryClient.invalidateQueries({ queryKey: ["cbt-test-paper", id] });
    queryClient.invalidateQueries({ queryKey: ["cbt-test-attempts", id] });
    queryClient.invalidateQueries({ queryKey: ["cbt-tests"] });
  };

  const locked = attempts.length > 0;
  const totalMarks = paper.reduce((sum, p) => sum + Number(p.cbt_questions?.marks ?? 0), 0);

  const setStatus = async (status: "draft" | "published" | "closed") => {
    const { error } = await supabase.from("cbt_tests").update({ status }).eq("id", id!);
    if (error) toast.error(getErrorMessage(error, "Could not change the status"));
    else {
      toast.success(status === "published" ? "Published — pupils can now sit it" : status === "closed" ? "Test closed" : "Moved back to draft");
      refresh();
    }
  };

  const removeQuestion = async (questionId: string) => {
    const { error } = await supabase.from("cbt_test_questions").delete().eq("test_id", id!).eq("question_id", questionId);
    if (error) toast.error(getErrorMessage(error, "Could not remove the question"));
    else refresh();
  };

  const extend = async (attemptId: string) => {
    const { error } = await supabase.rpc("cbt_extend_attempt", { _attempt_id: attemptId, _minutes: 10 });
    if (error) toast.error(getErrorMessage(error, "Could not extend the time"));
    else {
      toast.success("Ten more minutes given");
      refresh();
    }
  };

  const reset = async (attemptId: string) => {
    const { error } = await supabase.from("cbt_attempts").delete().eq("id", attemptId);
    if (error) toast.error(getErrorMessage(error, "Could not reset the sitting"));
    else {
      toast.success("Sitting reset — the pupil can start again");
      refresh();
    }
  };

  const deleteTest = async () => {
    const { error } = await supabase.from("cbt_tests").delete().eq("id", id!);
    if (error) toast.error(getErrorMessage(error, "Could not delete the test"));
    else {
      toast.success("Test deleted");
      queryClient.invalidateQueries({ queryKey: ["cbt-tests"] });
      navigate("/cbt");
    }
  };

  const exportResults = () => {
    exportToCsv(
      `${test?.title ?? "cbt"}-results.csv`,
      ["Pupil", "ID number", "Attempt", "Status", "Score", "Out of", "Started", "Handed in"],
      attempts.map((a) => [
        `${a.students?.first_name ?? ""} ${a.students?.last_name ?? ""}`.trim(),
        a.students?.student_id_number ?? "",
        String(a.attempt_no),
        a.status,
        a.score == null ? "" : String(a.score),
        a.max_score == null ? "" : String(a.max_score),
        format(new Date(a.started_at), "yyyy-MM-dd HH:mm"),
        a.submitted_at ? format(new Date(a.submitted_at), "yyyy-MM-dd HH:mm") : "",
      ]),
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!test) {
    return <EmptyState title="Test not found" description="It may have been deleted, or it is for a class you do not teach." />;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/cbt")}>
        <ArrowLeft className="h-3.5 w-3.5" /> All tests
      </Button>
      <PageHeader
        title={test.title}
        description={`${displayClassName(test.classes?.name) || "Class"} · ${test.subjects?.name ?? "Subject"} · ${test.duration_minutes} min · ${
          test.mode === "practice" ? "Practice" : test.exams?.name ? `Marks go to ${test.exams.name}` : "Graded"
        }`}
      >
        <Badge variant={test.status === "published" ? "default" : "outline"} className="capitalize">{test.status}</Badge>
        {test.status === "draft" && (
          <Button size="sm" onClick={() => setStatus("published")} disabled={paper.length === 0}>Publish</Button>
        )}
        {test.status === "published" && (
          <Button size="sm" variant="outline" onClick={() => setStatus("closed")}>Close test</Button>
        )}
        {test.status === "closed" && (
          <Button size="sm" variant="outline" onClick={() => setStatus("published")}>Reopen</Button>
        )}
        {test.status === "published" && !locked && (
          <Button size="sm" variant="ghost" onClick={() => setStatus("draft")}>Unpublish</Button>
        )}
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </PageHeader>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Paper · {paper.length} question{paper.length === 1 ? "" : "s"} · {totalMarks} mark{totalMarks === 1 ? "" : "s"}
          </CardTitle>
          {!locked && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPicking(true)}>
              <Plus className="h-3.5 w-3.5" /> Add from bank
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {locked && (
            <p className="text-sm text-muted-foreground">Pupils have sat this test, so its paper can no longer change.</p>
          )}
          {paper.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions yet. Add some from the question bank before publishing.</p>
          ) : (
            <ol className="space-y-3">
              {paper.map((p, i) => {
                const q = p.cbt_questions;
                const options = (q?.options as unknown as ImportedOption[]) ?? [];
                return (
                  <li key={p.question_id} className="flex gap-3 rounded-md border p-3">
                    <span className="text-sm font-medium text-muted-foreground">{i + 1}.</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="whitespace-pre-wrap text-sm">{q?.prompt}</p>
                      <ul className="grid gap-x-4 text-xs text-muted-foreground sm:grid-cols-2">
                        {options.map((o) => (
                          <li key={o.id} className={o.id === q?.correct_option ? "font-semibold text-success" : undefined}>
                            {o.id.toUpperCase()}. {o.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <span className="text-xs text-muted-foreground">{Number(q?.marks ?? 0)} mk</span>
                    {!locked && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove from paper"
                        onClick={() => removeQuestion(p.question_id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Sittings</CardTitle>
          {attempts.length > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportResults}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {attempts.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nobody has started this test yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pupil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="hidden md:table-cell">Started</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.students?.first_name} {a.students?.last_name}</div>
                      {a.attempt_no > 1 && <div className="text-xs text-muted-foreground">Attempt {a.attempt_no}</div>}
                    </TableCell>
                    <TableCell>
                      {a.status === "submitted" ? (
                        <Badge variant="secondary">Handed in</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" /> until {format(new Date(a.deadline_at), "HH:mm")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.score == null ? "—" : `${Number(a.score)} / ${Number(a.max_score)}`}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {format(new Date(a.started_at), "d MMM, HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === "in_progress" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => extend(a.id)}>+10 min</Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Reset sitting" onClick={() => reset(a.id)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PickQuestionsDialog
        open={picking}
        onOpenChange={setPicking}
        testId={test.id}
        schoolId={test.school_id}
        subjectId={test.subject_id}
        existing={paper.map((p) => p.question_id)}
        onAdded={refresh}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this test?</AlertDialogTitle>
            <AlertDialogDescription>
              Every pupil's sitting goes with it. Marks already written into an exam stay where they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTest}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PickQuestionsDialog({
  open, onOpenChange, testId, schoolId, subjectId, existing, onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  schoolId: string;
  subjectId: string;
  existing: string[];
  onAdded: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: bank = [], isLoading } = useQuery({
    queryKey: ["cbt-bank-for-test", schoolId, subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cbt_questions")
        .select("id, prompt, topic, marks")
        .eq("school_id", schoolId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const available = useMemo(() => bank.filter((q) => !existing.includes(q.id)), [bank, existing]);
  const allSelected = available.length > 0 && available.every((q) => selected.has(q.id));

  const toggle = (qid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });

  const add = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const start = existing.length;
    const rows = available
      .filter((q) => selected.has(q.id))
      .map((q, i) => ({ test_id: testId, question_id: q.id, position: start + i + 1 }));
    const { error } = await supabase.from("cbt_test_questions").insert(rows);
    setSaving(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not add the questions"));
      return;
    }
    toast.success(`${rows.length} question${rows.length === 1 ? "" : "s"} added`);
    setSelected(new Set());
    onAdded();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add questions from the bank</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No more questions for this subject. Add some on the Question bank tab.
          </p>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? new Set(available.map((q) => q.id)) : new Set())}
              />
              Select all ({available.length})
            </label>
            <div className="divide-y rounded-md border">
              {available.map((q) => (
                <label key={q.id} className="flex cursor-pointer items-start gap-3 p-3 text-sm">
                  <Checkbox checked={selected.has(q.id)} onCheckedChange={() => toggle(q.id)} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{q.prompt}</span>
                    {q.topic && <span className="block text-xs text-muted-foreground">{q.topic}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{Number(q.marks)} mk</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={add} disabled={saving || selected.size === 0}>
            Add {selected.size > 0 ? selected.size : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
