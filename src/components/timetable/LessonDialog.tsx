import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DAY_NAMES, periodLabel, type SlotLesson, type TimetablePeriod } from "@/lib/timetable";

const NONE = "__none__";

interface SubjectOption { id: string; name: string }
interface TeacherOption { id: string; first_name: string; last_name: string }

interface LessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  academicPeriodId: string;
  classId: string;
  periodId: string;
  day: number;
  date: string;
  lesson: SlotLesson | null;
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  periods: TimetablePeriod[];
}

/**
 * Add, change or remove one lesson in the weekly pattern, and record a one-off
 * change (cancelled or moved) for the specific week on screen.
 */
export function LessonDialog({
  open, onOpenChange, schoolId, academicPeriodId, classId, periodId, day, date,
  lesson, subjects, teachers, periods,
}: LessonDialogProps) {
  const queryClient = useQueryClient();
  const entry = lesson?.entry ?? null;
  const [subjectId, setSubjectId] = useState(NONE);
  const [staffId, setStaffId] = useState(NONE);
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [exceptionKind, setExceptionKind] = useState<"none" | "cancelled" | "moved">("none");
  const [newDate, setNewDate] = useState(date);
  const [newPeriodId, setNewPeriodId] = useState(periodId);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setSubjectId(entry?.subject_id ?? NONE);
    setStaffId(entry?.staff_id ?? NONE);
    setRoom(entry?.room ?? "");
    setNotes(entry?.notes ?? "");
    const ex = lesson?.exception;
    setExceptionKind(ex ? ex.status : "none");
    setNewDate(ex?.new_date ?? date);
    setNewPeriodId(ex?.new_timetable_period_id ?? periodId);
    setReason(ex?.reason ?? "");
  }, [open, entry?.id, lesson?.exception?.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["timetable-entries"] });
    queryClient.invalidateQueries({ queryKey: ["timetable-exceptions"] });
  };

  const saveLesson = async () => {
    if (subjectId === NONE) {
      toast.error("Choose a subject for this lesson.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        school_id: schoolId,
        academic_period_id: academicPeriodId,
        class_id: classId,
        timetable_period_id: entry?.timetable_period_id ?? periodId,
        day_of_week: entry?.day_of_week ?? day,
        subject_id: subjectId,
        staff_id: staffId === NONE ? null : staffId,
        room: room.trim() || null,
        notes: notes.trim() || null,
      };
      if (entry) {
        const { error } = await supabase.from("timetable_entries").update(payload).eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("timetable_entries").insert(payload);
        if (error) throw error;
      }

      // One-off change for the week on screen.
      const existingException = lesson?.exception;
      const entryId = entry?.id;
      if (entryId) {
        if (exceptionKind === "none" && existingException) {
          const { error } = await supabase.from("timetable_exceptions").delete().eq("id", existingException.id);
          if (error) throw error;
        } else if (exceptionKind !== "none") {
          const exPayload = {
            school_id: schoolId,
            entry_id: entryId,
            date: lesson?.state === "moved-here" ? existingException?.date ?? date : date,
            status: exceptionKind,
            new_date: exceptionKind === "moved" ? newDate : null,
            new_timetable_period_id: exceptionKind === "moved" ? newPeriodId : null,
            new_room: null,
            reason: reason.trim() || null,
          };
          const { error } = existingException
            ? await supabase.from("timetable_exceptions").update(exPayload).eq("id", existingException.id)
            : await supabase.from("timetable_exceptions").insert(exPayload);
          if (error) throw error;
        }
      }

      toast.success(entry ? "Lesson updated." : "Lesson added.");
      refresh();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the lesson.";
      toast.error(message.includes("duplicate key") ? "That slot already has a lesson for this class." : message);
    } finally {
      setSaving(false);
    }
  };

  const removeLesson = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("timetable_entries").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success("Lesson removed from the weekly pattern.");
      refresh();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the lesson.");
    } finally {
      setSaving(false);
    }
  };

  const slotPeriod = periods.find((p) => p.id === (entry?.timetable_period_id ?? periodId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit lesson" : "Add lesson"}</DialogTitle>
          <DialogDescription>
            {DAY_NAMES[entry?.day_of_week ?? day]}
            {slotPeriod ? `, ${periodLabel(slotPeriod)}` : ""} · repeats every week this term
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="Choose a subject" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Teacher</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Not assigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not assigned</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Room</Label>
              <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Lab 2" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bring textbooks" />
            </div>
          </div>

          {entry && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Just for {format(parseISO(date), "EEEE d MMM")}</Label>
                <Select value={exceptionKind} onValueChange={(v) => setExceptionKind(v as typeof exceptionKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Runs as normal</SelectItem>
                    <SelectItem value="cancelled">Cancelled this day</SelectItem>
                    <SelectItem value="moved">Moved to another slot</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {exceptionKind === "moved" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>New date</Label>
                    <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>New period</Label>
                    <Select value={newPeriodId} onValueChange={setNewPeriodId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => <SelectItem key={p.id} value={p.id}>{periodLabel(p)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {exceptionKind !== "none" && (
                <div className="space-y-2">
                  <Label>Reason (shown to students)</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Staff training" />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {entry ? (
            <Button variant="outline" onClick={removeLesson} disabled={saving} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Remove lesson
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={saveLesson} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
