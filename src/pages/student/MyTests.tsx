import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Clock, MonitorCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type MyTest = {
  test_id: string;
  title: string;
  subject_name: string;
  mode: string;
  instructions: string | null;
  duration_minutes: number;
  opens_at: string | null;
  closes_at: string | null;
  max_attempts: number | null;
  question_count: number;
  attempts_used: number;
  open_attempt_id: string | null;
  last_score: number | null;
  last_max_score: number | null;
  last_submitted_at: string | null;
};

function availability(t: MyTest, now: number): { canStart: boolean; note: string } {
  if (t.open_attempt_id) return { canStart: true, note: "In progress" };
  if (t.opens_at && Date.parse(t.opens_at) > now) {
    return { canStart: false, note: `Opens ${format(new Date(t.opens_at), "EEE d MMM, HH:mm")}` };
  }
  if (t.closes_at && Date.parse(t.closes_at) <= now) return { canStart: false, note: "Closed" };
  if (t.max_attempts != null && t.attempts_used >= t.max_attempts) {
    return { canStart: false, note: t.last_submitted_at ? "Handed in" : "No attempts left" };
  }
  return { canStart: true, note: t.closes_at ? `Closes ${format(new Date(t.closes_at), "EEE d MMM, HH:mm")}` : "Open" };
}

/** The pupil's computer-based tests: what is open, what is coming, what is done. */
export default function MyTests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["cbt-my-tests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cbt_my_tests");
      if (error) throw error;
      return (data ?? []) as MyTest[];
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });

  const start = async (t: MyTest) => {
    setStarting(t.test_id);
    try {
      const { data, error } = await supabase.rpc("cbt_start_attempt", { _test_id: t.test_id });
      if (error) throw error;
      navigate(`/student/tests/${data}`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not start the test"));
    } finally {
      setStarting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader title="My tests" description="Computer-based tests set by your teachers." />
      {tests.length === 0 ? (
        <EmptyState icon={MonitorCheck} title="No tests right now" description="When a teacher sets a test for your class it will appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tests.map((t) => {
            const { canStart, note } = availability(t, now);
            return (
              <Card key={t.test_id}>
                <CardHeader className="space-y-1 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{t.title}</CardTitle>
                    <Badge variant={t.mode === "practice" ? "secondary" : "outline"}>
                      {t.mode === "practice" ? "Practice" : "Test"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t.subject_name} · {t.question_count} question{t.question_count === 1 ? "" : "s"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> {t.duration_minutes} minutes · {note}
                  </div>
                  {t.last_score != null && t.last_max_score != null && (
                    <p className="text-sm">
                      Last score: <span className="font-semibold">{Number(t.last_score)} / {Number(t.last_max_score)}</span>
                    </p>
                  )}
                  {t.last_score == null && t.last_submitted_at && (
                    <p className="text-sm text-muted-foreground">Handed in. Your teacher will release the result.</p>
                  )}
                  {canStart && (
                    <Button className="w-full" onClick={() => start(t)} disabled={starting === t.test_id}>
                      {t.open_attempt_id ? "Resume" : t.attempts_used > 0 ? "Try again" : "Start"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
