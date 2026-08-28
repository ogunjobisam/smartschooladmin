import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { categoryLabel, type RecognitionSubject } from "@/lib/certificates";
import { displayClassName } from "@/lib/sections";
import { usePhotoUrls } from "@/hooks/usePhotoUrl";

interface Props {
  subjectType: RecognitionSubject;
  personId: string;
  /** Used where the panel sits alongside other cards rather than in its own tab. */
  hideWhenEmpty?: boolean;
}

/**
 * Only published records appear here. A draft award on a profile would be a
 * promise the school has not yet approved, so the profile reads the same list
 * a parent would see.
 */
export function RecognitionsPanel({ subjectType, personId, hideWhenEmpty }: Props) {
  const column = subjectType === "student" ? "student_id" : "staff_id";

  const { data: recognitions = [] } = useQuery({
    queryKey: ["profile-recognitions", subjectType, personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recognitions")
        .select("id, title, category, description, award_date, photo_path, classes(name), academic_periods(name), subjects(name)")
        .eq(column, personId)
        .eq("status", "published")
        .order("award_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!personId,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["profile-appointments", subjectType, personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, position_title, portfolio, start_date, end_date, academic_years(name)")
        .eq(column, personId)
        .eq("status", "published")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!personId,
  });

  const photoUrls = usePhotoUrls(recognitions.map((r) => r.photo_path));

  const empty = recognitions.length === 0 && appointments.length === 0;
  if (empty && hideWhenEmpty) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-4 w-4 text-primary" /> Achievements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {empty && (
          <p className="text-sm text-muted-foreground">
            No published achievements yet. Awards appear here once a school manager publishes them.
          </p>
        )}
        {appointments.map((a) => (
          <div key={a.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.position_title}</span>
              <Badge variant="outline">Appointment</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                a.portfolio,
                (a.academic_years as { name: string } | null)?.name,
                `${format(new Date(a.start_date), "MMM yyyy")}${a.end_date ? ` – ${format(new Date(a.end_date), "MMM yyyy")}` : " – present"}`,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))}

        {recognitions.map((r) => (
          <div key={r.id} className="flex gap-3 rounded-lg border p-3">
            {r.photo_path && (
              <Avatar className="h-14 w-14 shrink-0 rounded-lg border border-border">
                <AvatarImage src={photoUrls[r.photo_path]} alt="" className="object-cover" />
                <AvatarFallback className="rounded-lg bg-muted">🏅</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.title}</span>
              <Badge variant="secondary">{categoryLabel(r.category)}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                (r.classes as { name: string } | null)?.name
                  ? displayClassName((r.classes as { name: string }).name)
                  : null,
                (r.academic_periods as { name: string } | null)?.name,
                (r.subjects as { name: string } | null)?.name,
                r.award_date ? format(new Date(r.award_date), "d MMM yyyy") : null,
              ].filter(Boolean).join(" · ")}
            </p>
            {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
