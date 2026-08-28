import { displayClassName } from "@/lib/sections";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Award, History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  studentId: string;
  schoolId: string;
}

export function StudentHistoryTab({ studentId, schoolId }: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [awardDate, setAwardDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: enrolments } = useQuery({
    queryKey: ["student-enrolment-history", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("enrolments")
        .select("id, enrolled_at, classes(name), academic_periods(name, start_date)")
        .eq("student_id", studentId)
        .order("enrolled_at", { ascending: false });
      return data || [];
    },
  });

  const { data: awards } = useQuery({
    queryKey: ["student-awards", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_awards")
        .select("id, title, description, award_date, academic_periods(name)")
        .eq("student_id", studentId)
        .order("award_date", { ascending: false });
      return data || [];
    },
  });

  const addAward = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("student_awards").insert({
        student_id: studentId,
        school_id: schoolId,
        title,
        description: description || null,
        award_date: awardDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-awards", studentId] });
      toast.success("Award added");
      setAddOpen(false);
      setTitle("");
      setDescription("");
    },
    onError: () => toast.error("Failed to add award"),
  });

  return (
    <div className="space-y-6">
      {/* Enrolment History */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Class History</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">Academic Period</TableHead>
              <TableHead className="text-xs">Enrolled Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!enrolments?.length ? (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No enrolment history.</TableCell>
              </TableRow>
            ) : (
              enrolments.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{displayClassName(e.classes?.name) || "—"}</TableCell>
                  <TableCell>{e.academic_periods?.name || "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{new Date(e.enrolled_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Awards */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Awards & Achievements</h3>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Award
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Title</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Period</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!awards?.length ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No awards yet.</TableCell>
              </TableRow>
            ) : (
              awards.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell className="text-muted-foreground">{a.description || "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{a.award_date}</TableCell>
                  <TableCell><Badge variant="outline">{a.academic_periods?.name || "—"}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Award Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Award</DialogTitle>
            <DialogDescription>Record a student award or achievement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Best in Mathematics" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!title.trim() || addAward.isPending} onClick={() => addAward.mutate()}>
              {addAward.isPending ? "Saving…" : "Save Award"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
