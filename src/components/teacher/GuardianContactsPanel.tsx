import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { displayClassName } from "@/lib/sections";

interface Props {
  /** Students the signed-in teacher actually teaches. */
  studentIds: string[];
  classNameByStudentId?: Record<string, string>;
}

/**
 * Contact details for the guardians of a teacher's own students. The database
 * only lets a teacher read guardians linked to children they teach, so this
 * list can never leak beyond their classes.
 */
export function GuardianContactsPanel({ studentIds, classNameByStudentId = {} }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["teacher-guardian-contacts", studentIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_guardians")
        .select("relationship, student_id, students(first_name, last_name), guardians(id, first_name, last_name, phone, email)")
        .in("student_id", studentIds);
      if (error) throw error;
      return (data || []).filter((r) => r.guardians);
    },
    enabled: studentIds.length > 0,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-accent" /> Parent contacts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No guardians linked to your students yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const g = r.guardians!;
              const childName = r.students ? `${r.students.first_name} ${r.students.last_name}` : "—";
              return (
                <div key={`${r.student_id}-${g.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.first_name} {g.last_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.relationship} of {childName}
                      {classNameByStudentId[r.student_id] ? ` · ${displayClassName(classNameByStudentId[r.student_id])}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {g.phone && (
                      <a href={`tel:${g.phone}`} className="flex items-center gap-1 hover:text-foreground">
                        <Phone className="h-3 w-3" /> {g.phone}
                      </a>
                    )}
                    {g.email && (
                      <a href={`mailto:${g.email}`} className="flex items-center gap-1 hover:text-foreground">
                        <Mail className="h-3 w-3" /> {g.email}
                      </a>
                    )}
                    {!g.phone && !g.email && <span>No contact details on file</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
