import { format, parseISO } from "date-fns";
import { Ban, ArrowRightLeft, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DAY_NAMES, DAY_SHORT, dateForDay, entryTeacherName, periodLabel,
  type SlotLesson, type TimetablePeriod,
} from "@/lib/timetable";

interface TimetableGridProps {
  periods: TimetablePeriod[];
  days: readonly number[];
  monday: Date;
  grid: Map<string, SlotLesson[]>;
  /** Show the class name instead of the subject (used for a teacher's own week). */
  showClassName?: boolean;
  editable?: boolean;
  onSelectSlot?: (periodId: string, day: number, lesson: SlotLesson | null) => void;
}

const stateStyles: Record<SlotLesson["state"], string> = {
  normal: "border-primary/30 bg-primary/5",
  cancelled: "border-destructive/30 bg-destructive/5 opacity-70",
  "moved-away": "border-border bg-muted/60 opacity-70",
  "moved-here": "border-warning/40 bg-warning/10",
};

export function TimetableGrid({
  periods, days, monday, grid, showClassName, editable, onSelectSlot,
}: TimetableGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-32 p-2 text-left text-xs font-medium text-muted-foreground">Period</th>
            {days.map((day) => {
              const date = dateForDay(monday, day);
              return (
                <th key={day} className="p-2 text-left text-xs font-medium text-muted-foreground">
                  <span className="hidden sm:inline">{DAY_NAMES[day]}</span>
                  <span className="sm:hidden">{DAY_SHORT[day]}</span>
                  <span className="ml-1 font-normal">{format(parseISO(date), "d MMM")}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <th className="rounded-md bg-muted/50 p-2 text-left align-top text-xs font-medium">
                <div className="text-foreground">{period.name}</div>
                <div className="font-normal text-muted-foreground">
                  {periodLabel(period).split("· ")[1]}
                </div>
              </th>
              {days.map((day) => {
                const lessons = grid.get(`${period.id}|${day}`) ?? [];
                if (period.is_break && lessons.length === 0) {
                  return (
                    <td key={day} className="rounded-md bg-muted/30 p-2 text-center text-xs text-muted-foreground">
                      {period.name}
                    </td>
                  );
                }
                if (lessons.length === 0) {
                  return (
                    <td key={day} className="p-0 align-top">
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => onSelectSlot?.(period.id, day, null)}
                          className="flex h-full min-h-[68px] w-full items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          aria-label={`Add a lesson on ${DAY_NAMES[day]} in ${period.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="min-h-[68px] rounded-md border border-dashed" />
                      )}
                    </td>
                  );
                }
                return (
                  <td key={day} className="p-0 align-top">
                    <div className="space-y-1">
                      {lessons.map((lesson, i) => {
                        const title = showClassName
                          ? lesson.entry.classes?.name ?? "Class"
                          : lesson.entry.subjects?.name ?? "Lesson";
                        const secondary = showClassName
                          ? lesson.entry.subjects?.name
                          : entryTeacherName(lesson.entry);
                        const content = (
                          <>
                            <div className="truncate text-sm font-medium text-foreground">{title}</div>
                            {secondary && (
                              <div className="truncate text-xs text-muted-foreground">{secondary}</div>
                            )}
                            {lesson.entry.room && (
                              <div className="truncate text-xs text-muted-foreground">Room {lesson.entry.room}</div>
                            )}
                            {lesson.state === "cancelled" && (
                              <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
                                <Ban className="h-3 w-3" /> Cancelled
                              </Badge>
                            )}
                            {lesson.state === "moved-away" && (
                              <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
                                <ArrowRightLeft className="h-3 w-3" /> Moved
                              </Badge>
                            )}
                            {lesson.state === "moved-here" && (
                              <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
                                <ArrowRightLeft className="h-3 w-3" /> Moved here
                              </Badge>
                            )}
                          </>
                        );
                        const className = cn(
                          "min-h-[68px] w-full rounded-md border p-2 text-left",
                          stateStyles[lesson.state]
                        );
                        return editable ? (
                          <button
                            key={`${lesson.entry.id}-${i}`}
                            type="button"
                            onClick={() => onSelectSlot?.(period.id, day, lesson)}
                            className={cn(className, "transition-colors hover:border-primary")}
                          >
                            {content}
                          </button>
                        ) : (
                          <div key={`${lesson.entry.id}-${i}`} className={className}>
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
