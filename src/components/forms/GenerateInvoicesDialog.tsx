import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { toast } from "sonner";
import { FileText, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateInvoicesDialog({ open, onOpenChange }: Props) {
  const { schoolId } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const [scheduleId, setScheduleId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; total_amount?: number } | null>(null);

  const { data: schedules } = useQuery({
    queryKey: ["fee-schedules-active", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("fee_schedules")
        .select("id, name, total_amount, is_active, class_id, classes(name), academic_period_id, academic_periods(name)")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!schoolId && open,
  });

  const selectedSchedule = schedules?.find((s: any) => s.id === scheduleId);

  const handleGenerate = async () => {
    if (!scheduleId || !schoolId) return;
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-invoices", {
        body: { fee_schedule_id: scheduleId, school_id: schoolId, due_date: dueDate || null },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult({ created: data.created, skipped: data.skipped, total_amount: data.total_amount });

      if (data.created > 0) {
        toast.success(`Created ${data.created} invoices successfully!`);
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } else {
        toast.info(data.message || "No new invoices were created.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate invoices.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setScheduleId("");
    setDueDate("");
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Generate Invoices
          </DialogTitle>
          <DialogDescription>
            Create invoices for all students in a class based on a fee schedule.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
              <CheckCircle2 className="h-8 w-8 text-success shrink-0" />
              <div>
                <p className="font-semibold text-foreground">{result.created} invoices created</p>
                {result.skipped > 0 && (
                  <p className="text-sm text-muted-foreground">{result.skipped} students skipped (already invoiced)</p>
                )}
                {result.total_amount ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    Total billed: <span className="font-mono font-medium">{formatNaira(result.total_amount)}</span>
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Fee Schedule</Label>
              <Select value={scheduleId} onValueChange={setScheduleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a fee schedule…" />
                </SelectTrigger>
                <SelectContent>
                  {schedules?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {s.classes?.name || "All Classes"} ({formatNaira(s.total_amount)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSchedule && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Class:</span>
                  <span className="font-medium">{(selectedSchedule as any).classes?.name || "All Classes"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Period:</span>
                  <span className="font-medium">{(selectedSchedule as any).academic_periods?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount per student:</span>
                  <span className="font-mono font-medium">{formatNaira(selectedSchedule.total_amount)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            {!schedules?.length && (
              <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <span>No active fee schedules found. Create one first in Fee Schedules.</span>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={!scheduleId || loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Invoices
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
