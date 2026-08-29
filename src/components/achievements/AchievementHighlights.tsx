import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, ArrowRight, Medal } from "lucide-react";
import { Link } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePhotoUrls } from "@/hooks/usePhotoUrl";
import { categoryLabel } from "@/lib/certificates";
import { displayClassName } from "@/lib/sections";

interface Props {
  /** How many recent awards to show. */
  limit?: number;
  title?: string;
}

interface Row {
  id: string;
  title: string;
  category: string;
  award_date: string;
  photo_path: string | null;
  subject_type: "student" | "staff";
  students: { first_name: string; last_name: string } | null;
  staff: { first_name: string; last_name: string } | null;
  classes: { name: string } | null;
}

/**
 * A small celebration strip of the most recent published awards. Every role can
 * see it — published means the school has already stood behind the award — and
 * it always offers a way through to the full wall so it is never a dead end.
 */
export function AchievementHighlights({ limit = 4, title = "Recent achievements" }: Props) {
  const { schoolId } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["achievement-highlights", schoolId, limit],
    queryFn: async () => {
      let query = supabase
        .from("recognitions")
        .select(
          "id, title, category, award_date, photo_path, subject_type, students(first_name, last_name), staff(first_name, last_name), classes(name)"
        )
        .eq("status", "published")
        .order("award_date", { ascending: false })
        .limit(limit);
      if (schoolId) query = query.eq("school_id", schoolId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const photoUrls = usePhotoUrls(rows.map((r) => r.photo_path));

  const nameOf = (r: Row) => {
    const p = r.students ?? r.staff;
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-4 w-4 text-accent" /> {title}
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="text-xs text-accent">
          <Link to="/wall">
            Achievement wall <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Medal className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No published awards yet. Published recognitions and prefect appointments show up here.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/wall">Open the wall</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <Avatar className="h-11 w-11 shrink-0 rounded-lg border border-border">
                  <AvatarImage src={r.photo_path ? photoUrls[r.photo_path] : undefined} alt="" className="object-cover" />
                  <AvatarFallback className="rounded-lg bg-accent/10 text-accent">🏅</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-card-foreground">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[nameOf(r), displayClassName(r.classes?.name), format(new Date(r.award_date), "d MMM yyyy")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {categoryLabel(r.category)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
