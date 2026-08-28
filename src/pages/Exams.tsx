import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, FileText, Pencil, Loader2, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CreateExamDialog } from "@/components/exams/CreateExamDialog";
import { displayClassName } from "@/lib/sections";

export default function Exams() {
  const { schoolId } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["exams", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("exams")
        .select("*, classes(name), academic_periods(name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!schoolId,
  });

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "status-paid",
    closed: "status-void",
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Exams & Grades" description="Create exams, enter scores, and generate report cards.">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> New Exam
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : exams.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={BookOpen}
                title="No exams yet"
                description="Create your first exam to start entering student scores."
                actionLabel="Create exam"
                onAction={() => setCreateOpen(true)}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Max Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id} className="cursor-pointer" onClick={() => navigate(`/exams/${exam.id}`)}>
                    <TableCell className="font-medium">{exam.name}</TableCell>
                    <TableCell className="text-muted-foreground">{displayClassName(exam.classes?.name) || "All"}</TableCell>
                    <TableCell className="text-muted-foreground">{exam.academic_periods?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{exam.exam_date ? format(new Date(exam.exam_date), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell>{exam.max_score}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor[exam.status] || ""}>
                        {exam.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={(e) => { e.stopPropagation(); navigate(`/exams/${exam.id}`); }}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Scores
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateExamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
