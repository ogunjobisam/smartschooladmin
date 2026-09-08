import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PERIODS, shortTime, type TimetablePeriod } from "@/lib/timetable";

interface PeriodsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  periods: TimetablePeriod[];
}

interface DraftRow {
  id?: string;
  name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
}

/** The school's bell schedule: named periods every class timetable slots into. */
export function PeriodsDialog({ open, onOpenChange, schoolId, periods }: PeriodsDialogProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset the draft each time the dialog opens.
  const [openedFor, setOpenedFor] = useState<boolean>(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setRows(
        periods.length > 0
          ? periods.map((p) => ({
              id: p.id, name: p.name, start_time: shortTime(p.start_time),
              end_time: shortTime(p.end_time), is_break: p.is_break,
            }))
          : DEFAULT_PERIODS.map((p) => ({ ...p }))
      );
      setRemoved([]);
    }
  }

  const update = (index: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((prev) => [...prev, { name: `Period ${prev.length + 1}`, start_time: "14:15", end_time: "15:00", is_break: false }]);

  const removeRow = (index: number) => {
    const row = rows[index];
    if (row.id) setRemoved((prev) => [...prev, row.id!]);
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    const cleaned = rows.filter((r) => r.name.trim() && r.start_time && r.end_time);
    if (cleaned.length === 0) {
      toast.error("Add at least one period.");
      return;
    }
    if (cleaned.some((r) => r.end_time <= r.start_time)) {
      toast.error("Each period must end after it starts.");
      return;
    }
    setSaving(true);
    try {
      if (removed.length > 0) {
        const { error } = await supabase.from("timetable_periods").delete().in("id", removed);
        if (error) throw error;
      }
      const payload = cleaned.map((r, i) => ({
        id: r.id,
        school_id: schoolId,
        name: r.name.trim(),
        start_time: r.start_time,
        end_time: r.end_time,
        is_break: r.is_break,
        sort_order: i + 1,
      }));
      const inserts = payload.filter((p) => !p.id).map(({ id, ...rest }) => rest);
      const updates = payload.filter((p) => p.id);
      if (inserts.length > 0) {
        const { error } = await supabase.from("timetable_periods").insert(inserts);
        if (error) throw error;
      }
      for (const row of updates) {
        const { id, ...rest } = row;
        const { error } = await supabase.from("timetable_periods").update(rest).eq("id", id!);
        if (error) throw error;
      }
      toast.success("Bell schedule saved.");
      queryClient.invalidateQueries({ queryKey: ["timetable-periods"] });
      queryClient.invalidateQueries({ queryKey: ["timetable-entries"] });
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the bell schedule.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Daily periods</DialogTitle>
          <DialogDescription>
            Set the times the school day is divided into. Every class timetable uses these.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id ?? `new-${index}`} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-4">
                {index === 0 && <Label className="text-xs">Name</Label>}
                <Input value={row.name} onChange={(e) => update(index, { name: e.target.value })} />
              </div>
              <div className="col-span-5 sm:col-span-3">
                {index === 0 && <Label className="text-xs">Starts</Label>}
                <Input type="time" value={row.start_time} onChange={(e) => update(index, { start_time: e.target.value })} />
              </div>
              <div className="col-span-5 sm:col-span-3">
                {index === 0 && <Label className="text-xs">Ends</Label>}
                <Input type="time" value={row.end_time} onChange={(e) => update(index, { end_time: e.target.value })} />
              </div>
              <div className="col-span-1 flex items-center gap-2 pb-2">
                <Checkbox
                  id={`break-${index}`}
                  checked={row.is_break}
                  onCheckedChange={(checked) => update(index, { is_break: checked === true })}
                />
                <Label htmlFor={`break-${index}`} className="whitespace-nowrap text-xs text-muted-foreground">Break</Label>
              </div>
              <div className="col-span-1 pb-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)} aria-label="Remove period">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-fit">
          <Plus className="mr-1 h-4 w-4" /> Add period
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
