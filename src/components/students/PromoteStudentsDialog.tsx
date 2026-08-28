import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

interface PromoteStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromoteStudentsDialog({ open, onOpenChange }: PromoteStudentsDialogProps) {
  const { schoolId, orgId } = useAuth();
  const queryClient = useQueryClient();
  const [fromClassId, setFromClassId] = useState("");
  const [toClassId, setToClassId] = useState("");
  const [fromPeriodId, setFromPeriodId] = useState("");
  const [toPeriodId, setToPeriodId] = useState("");
  const [promoting, setPromoting] = useState(false);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return data || [];
    },
    enabled: !!schoolId && open,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["all-periods", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("academic_years")
        .select("academic_periods(id, name, academic_year_id)")
        .eq("org_id", orgId);
      return (data || []).flatMap((y) => y.academic_periods || []);
    },
    enabled: !!orgId && open,
  });

  const handlePromote = async () => {
    if (!fromClassId || !toClassId || !fromPeriodId || !toPeriodId) return;
    setPromoting(true);

    // Get students enrolled in fromClass + fromPeriod
    const { data: enrolments } = await supabase
      .from("enrolments")
      .select("student_id")
      .eq("class_id", fromClassId)
      .eq("academic_period_id", fromPeriodId);

    const studentIds = (enrolments || []).map((e) => e.student_id);

    if (studentIds.length === 0) {
      toast.error("No students found in the source class/period");
      setPromoting(false);
      return;
    }

    // Check for existing enrolments to avoid duplicates
    const { data: existing } = await supabase
      .from("enrolments")
      .select("student_id")
      .eq("class_id", toClassId)
      .eq("academic_period_id", toPeriodId)
      .in("student_id", studentIds);

    const existingSet = new Set((existing || []).map((e) => e.student_id));
    const toInsert = studentIds.filter((sid) => !existingSet.has(sid));

    if (toInsert.length === 0) {
      toast.info("All students are already enrolled in the target class/period");
      setPromoting(false);
      return;
    }

    const { error } = await supabase.from("enrolments").insert(
      toInsert.map((student_id) => ({
        student_id,
        class_id: toClassId,
        academic_period_id: toPeriodId,
      }))
    );

    setPromoting(false);
    if (error) {
      toast.error("Promotion failed: " + error.message);
    } else {
      toast.success(`Promoted ${toInsert.length} students successfully`);
      queryClient.invalidateQueries({ queryKey: ["students"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" /> Promote Students
          </DialogTitle>
          <DialogDescription>
            Bulk-move students from one class/period to another by creating new enrolment records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">FROM</Label>
              <div className="space-y-2">
                <Select value={fromClassId} onValueChange={setFromClassId}>
                  <SelectTrigger><SelectValue placeholder="Source Class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fromPeriodId} onValueChange={setFromPeriodId}>
                  <SelectTrigger><SelectValue placeholder="Source Period" /></SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">TO</Label>
              <div className="space-y-2">
                <Select value={toClassId} onValueChange={setToClassId}>
                  <SelectTrigger><SelectValue placeholder="Target Class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={toPeriodId} onValueChange={setToPeriodId}>
                  <SelectTrigger><SelectValue placeholder="Target Period" /></SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button
            onClick={handlePromote}
            disabled={promoting || !fromClassId || !toClassId || !fromPeriodId || !toPeriodId}
            className="w-full"
          >
            {promoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {promoting ? "Promoting…" : "Promote Students"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
