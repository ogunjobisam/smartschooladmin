import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { sortBySection } from "@/lib/sections";

const NONE = "__none__";

export interface FeeScheduleEditable {
  id: string;
  name: string;
  total_amount: number | null;
  is_active: boolean | null;
  class_id: string | null;
  academic_period_id: string | null;
}

/**
 * Fee schedules used to be create-only, so a typo in a term's fees meant living
 * with it. This edits the record in place instead.
 */
export function EditFeeScheduleDialog({
  schedule,
  onOpenChange,
}: {
  schedule: FeeScheduleEditable | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { schoolId, orgId } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [classId, setClassId] = useState(NONE);
  const [periodId, setPeriodId] = useState(NONE);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!schedule) return;
    setName(schedule.name || "");
    setAmount(String(schedule.total_amount ?? ""));
    setClassId(schedule.class_id || NONE);
    setPeriodId(schedule.academic_period_id || NONE);
    setActive(schedule.is_active !== false);
  }, [schedule]);

  const { data: classes } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return sortBySection(data || []);
    },
    enabled: !!schoolId && !!schedule,
  });

  const { data: periods } = useQuery({
    queryKey: ["academic-periods-active", schoolId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, academic_years!inner(org_id)")
        .eq("academic_years.org_id", orgId)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!orgId && !!schedule,
  });

  const save = async () => {
    if (!schedule) return;
    if (!name.trim()) return toast.error("Please enter a schedule name.");
    const parsed = Math.round(parseFloat(amount));
    if (!Number.isFinite(parsed) || parsed < 0) return toast.error("Enter a valid total amount.");
    setSaving(true);
    const { error } = await supabase
      .from("fee_schedules")
      .update({
        name: name.trim(),
        total_amount: parsed,
        class_id: classId === NONE ? null : classId,
        academic_period_id: periodId === NONE ? null : periodId,
        is_active: active,
      })
      .eq("id", schedule.id);
    setSaving(false);
    if (error) return toast.error(getErrorMessage(error, "Could not update this fee schedule."));
    toast.success("Fee schedule updated");
    queryClient.invalidateQueries({ queryKey: ["fee-schedules"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!schedule} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Fee Schedule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="edit-schedule-name">Schedule Name</Label>
            <Input id="edit-schedule-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-schedule-amount">Total Amount</Label>
            <Input id="edit-schedule-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All classes</SelectItem>
                  {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Academic Period</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="No period" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No period</SelectItem>
                  {periods?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="edit-schedule-active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive schedules stay on record but are not offered for new invoices.</p>
            </div>
            <Switch id="edit-schedule-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
