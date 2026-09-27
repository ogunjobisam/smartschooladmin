import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { AnswerQueue, formatClock, secondsRemaining } from "@/lib/cbt";
import { cn } from "@/lib/utils";

interface PaperQuestion {
  id: string;
  prompt: string;
  question_type: string;
  marks: number;
  options: { id: string; text: string }[];
}

interface Paper {
  attempt_id: string;
  title: string;
  instructions: string | null;
  mode: string;
  status: "in_progress" | "submitted";
  deadline_at: string;
  server_now: string;
  last_seq: number;
  score: number | null;
  max_score: number | null;
  questions: PaperQuestion[];
  answers: Record<string, string | null>;
}

const SYNC_EVERY_MS = 5_000;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The exam screen. Built for a lab whose connection drops: every answer is
 * saved on this computer first and sent in the background, so losing the
 * network — or reloading the page — loses nothing. The clock is the server's.
 */
export default function SitTest() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [current, setCurrent] = useState(0);
  const [chosen, setChosen] = useState<Record<string, string | null>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [confirming, setConfirming] = useState(false);
  const [handingIn, setHandingIn] = useState(false);

  const queue = useMemo(() => (attemptId ? new AnswerQueue(attemptId, safeStorage()) : null), [attemptId]);
  const syncing = useRef(false);

  const applyPaper = useCallback((p: Paper) => {
    setPaper(p);
    setOffsetMs(Date.parse(p.server_now) - Date.now());
    if (queue) {
      if (p.status === "submitted") queue.clear();
      else queue.hydrate(p.answers ?? {}, p.last_seq);
      setChosen(queue.chosen());
      setPendingCount(queue.pending().length);
    }
  }, [queue]);

  // Load the paper; retry until it arrives, since the lab may be offline.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const { data, error } = await supabase.rpc("cbt_attempt_paper", { _attempt_id: attemptId! });
      if (cancelled) return;
      if (error) {
        if (error.code === "42501") {
          setLoadError("This test is not yours, or it no longer exists.");
          return;
        }
        setLoadError("Waiting for a connection to load the test…");
        timer = setTimeout(load, SYNC_EVERY_MS);
        return;
      }
      setLoadError(null);
      applyPaper(data as unknown as Paper);
    };
    if (attemptId) load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attemptId, applyPaper]);

  const sync = useCallback(async () => {
    if (!queue || !attemptId || syncing.current) return;
    const batch = queue.pending();
    if (batch.length === 0) return;
    syncing.current = true;
    try {
      const { data, error } = await supabase.rpc("cbt_save_answers", {
        _attempt_id: attemptId,
        _answers: batch.map((a) => ({ question_id: a.questionId, option_id: a.optionId, seq: a.seq })),
      });
      if (error) throw error;
      const result = data as unknown as { status: string };
      queue.acknowledge(batch);
      setPendingCount(queue.pending().length);
      setOnline(true);
      if (result.status === "submitted") {
        const { data: fresh } = await supabase.rpc("cbt_attempt_paper", { _attempt_id: attemptId });
        if (fresh) applyPaper(fresh as unknown as Paper);
      }
    } catch {
      setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, [queue, attemptId, applyPaper]);

  // Background sync, plus an immediate push whenever the network returns.
  useEffect(() => {
    const interval = setInterval(sync, SYNC_EVERY_MS);
    const goOnline = () => { setOnline(true); sync(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [sync]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const inProgress = paper?.status === "in_progress";
  const left = paper ? secondsRemaining(paper.deadline_at, offsetMs, now) : 0;
  const timeUp = inProgress && left === 0;

  const handingInRef = useRef(false);
  const handIn = useCallback(async (): Promise<boolean> => {
    if (!queue || !attemptId || handingInRef.current) return false;
    handingInRef.current = true;
    setHandingIn(true);
    const batch = queue.pending();
    const { data, error } = await supabase.rpc("cbt_submit_attempt", {
      _attempt_id: attemptId,
      _answers: batch.map((a) => ({ question_id: a.questionId, option_id: a.optionId, seq: a.seq })),
    });
    handingInRef.current = false;
    setHandingIn(false);
    if (error) {
      setOnline(false);
      return false;
    }
    applyPaper(data as unknown as Paper);
    return true;
  }, [queue, attemptId, applyPaper]);

  const handInByHand = async () => {
    const ok = await handIn();
    if (!ok) toast.error("No connection. Your answers are safe on this computer — try again when it returns.");
  };

  // When time runs out, hand in, and keep retrying at a steady pace while offline.
  useEffect(() => {
    if (!timeUp) return;
    handIn();
    const retry = setInterval(handIn, SYNC_EVERY_MS * 2);
    return () => clearInterval(retry);
  }, [timeUp, handIn]);

  const choose = (questionId: string, optionId: string) => {
    if (!queue || !inProgress || timeUp) return;
    queue.answer(questionId, optionId);
    setChosen(queue.chosen());
    setPendingCount(queue.pending().length);
    sync();
  };

  if (!paper) {
    return (
      <div className="space-y-4">
        {loadError ? <p className="text-sm text-muted-foreground">{loadError}</p> : <Skeleton className="h-8 w-56" />}
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (paper.status === "submitted") {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h1 className="font-display text-2xl font-bold text-primary">{paper.title}</h1>
        {paper.score != null && paper.max_score != null ? (
          <p className="text-lg">
            You scored <span className="font-semibold">{Number(paper.score)} out of {Number(paper.max_score)}</span>.
          </p>
        ) : (
          <p className="text-muted-foreground">Handed in. Your teacher will release the result.</p>
        )}
        <Button onClick={() => navigate("/student/tests")}>Back to my tests</Button>
      </div>
    );
  }

  const questions = paper.questions;
  const q = questions[current];
  const answered = questions.filter((x) => chosen[x.id] != null).length;
  const lowTime = left <= 60;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold text-primary">{paper.title}</h1>
          <p className="text-xs text-muted-foreground">{answered} of {questions.length} answered</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn("flex items-center gap-1 text-xs", online ? "text-muted-foreground" : "text-warning")}
            title={online ? "Connected" : "Offline — answers are saved on this computer"}
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {online ? (pendingCount > 0 ? "Saving…" : "Saved") : `Offline · ${pendingCount} to send`}
          </span>
          <span className={cn("flex items-center gap-1 font-mono text-lg font-semibold tabular-nums", lowTime ? "text-destructive" : "text-primary")}>
            <Clock className="h-4 w-4" /> {formatClock(left)}
          </span>
        </div>
      </div>

      {timeUp && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Time is up. Handing in{online ? "…" : " as soon as the connection returns. Do not close this page."}
        </p>
      )}

      {current === 0 && paper.instructions && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">{paper.instructions}</p>
      )}

      {q && (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">Question {current + 1} of {questions.length}</p>
              <p className="text-xs text-muted-foreground">{Number(q.marks)} mark{Number(q.marks) === 1 ? "" : "s"}</p>
            </div>
            <p className="whitespace-pre-wrap text-base">{q.prompt}</p>
            <div className="grid gap-2" role="radiogroup" aria-label={`Question ${current + 1}`}>
              {q.options.map((o, i) => {
                const selected = chosen[q.id] === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={timeUp}
                    onClick={() => choose(q.id, o.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
                      selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span className="font-semibold">{String.fromCharCode(65 + i)}.</span>
                    <span>{o.text}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        {current < questions.length - 1 ? (
          <Button onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => setConfirming(true)} disabled={handingIn || timeUp}>Hand in</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Jump to question">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setCurrent(i)}
            aria-label={`Question ${i + 1}${chosen[x.id] != null ? ", answered" : ""}`}
            className={cn(
              "h-8 w-8 rounded-md border text-xs font-medium",
              i === current && "ring-2 ring-ring ring-offset-1",
              chosen[x.id] != null ? "border-primary bg-primary text-primary-foreground" : "bg-background",
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hand in your test?</AlertDialogTitle>
            <AlertDialogDescription>
              {answered < questions.length
                ? `You have answered ${answered} of ${questions.length} questions. `
                : "You have answered every question. "}
              You cannot change your answers afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={handInByHand}>Hand in</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
