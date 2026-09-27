import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sortBySection } from "@/lib/sections";

const EVERY_CLASS = "__every_class__";

interface CreateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateExamDialog({ open, onOpenChange }: CreateExamDialogProps) {
  const { schoolId, user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [examDate, setExamDate] = useState<Date>();
  const [maxScore, setMaxScore] = useState("100");
  const [termWeight, setTermWeight] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return sortBySection(data || []);
    },
    enabled: !!schoolId,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["active-periods"],
    queryFn: async () => {
      const { data } = await supabase.from("academic_periods").select("id, name").eq("is_current", true);
      return data || [];
    },
  });

  const weight = termWeight.trim() === "" ? null : Number(termWeight);
  const weightInvalid = weight !== null && !(weight > 0 && weight <= 100);

  const handleCreate = async () => {
    if (!schoolId || !name.trim() || weightInvalid) return;
    setSaving(true);

    // CA1, CA2 and the exam are set once per term but sat by every arm, so
    // "Every class" creates the same assessment for each one in one go.
    const targets = classId === EVERY_CLASS ? classes.map((c) => c.id) : [classId || null];
    const { error } = await supabase.from("exams").insert(
      targets.map((target) => ({
        school_id: schoolId,
        name: name.trim(),
        class_id: target,
        academic_period_id: periodId || null,
        exam_date: examDate ? format(examDate, "yyyy-MM-dd") : null,
        max_score: parseInt(maxScore) || 100,
        term_weight: weight,
        created_by: user?.id,
      }))
    );

    setSaving(false);
    if (error) toast.error("Failed to create exam");
    else {
      toast.success(targets.length > 1 ? `Created for ${targets.length} classes` : "Exam created");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      onOpenChange(false);
      setName("");
      setClassId("");
      setPeriodId("");
      setExamDate(undefined);
      setMaxScore("100");
      setTermWeight("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Exam</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Exam Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. First Term Exam 2025" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  {classes.length > 1 && <SelectItem value={EVERY_CLASS}>Every class</SelectItem>}
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Academic Period</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Exam Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !examDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {examDate ? format(examDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={examDate} onSelect={setExamDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Max Score</Label>
              <Input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="term-weight">Term report weight (%)</Label>
            <Input
              id="term-weight"
              type="number"
              min="1"
              max="100"
              value={termWeight}
              onChange={(e) => setTermWeight(e.target.value)}
              placeholder="e.g. 20 for a CA, 60 for the exam"
            />
            <p className={cn("text-xs", weightInvalid ? "text-destructive" : "text-muted-foreground")}>
              {weightInvalid
                ? "Between 1 and 100."
                : "How much of the term total this counts for. Leave blank if it is not part of the term report."}
            </p>
          </div>
          <Button onClick={handleCreate} disabled={!name.trim() || saving || weightInvalid} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Exam
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
