import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, ArrowRight, Medal, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { usePhotoUrls } from "@/hooks/usePhotoUrl";
import { categoryLabel } from "@/lib/certificates";

interface Child {
  id: string;
  name: string;
}

interface Props {
  children: Child[];
}

interface Row {
  id: string;
  title: string;
  description: string | null;
  category: string;
  award_date: string;
  photo_path: string | null;
  student_id: string | null;
}

interface AppointmentRow {
  id: string;
  position_title: string;
  portfolio: string | null;
  start_date: string;
  end_date: string | null;
  student_id: string | null;
}

/**
 * A parent's window onto what their child has won.
 *
 * Only published records appear — a draft award is the school's business until
 * it stands behind it — and every category chip doubles as a way through to the
 * wider achievement wall so the section is never a dead end.
 */
export function ChildAchievements({ children }: Props) {
  const studentIds = children.map((c) => c.id);
  const [category, setCategory] = useState<string>("all");
  const [childFilter, setChildFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["child-achievements", studentIds],
    queryFn: async () => {
      const [{ data: awards, error }, { data: posts }] = await Promise.all([
        supabase
          .from("recognitions")
          .select("id, title, description, category, award_date, photo_path, student_id")
          .in("student_id", studentIds)
          .eq("status", "published")
          .order("award_date", { ascending: false }),
        supabase
          .from("appointments")
          .select("id, position_title, portfolio, start_date, end_date, student_id")
          .in("student_id", studentIds)
          .eq("status", "published")
          .order("start_date", { ascending: false }),
      ]);
      if (error) throw error;
      return {
        awards: (awards || []) as Row[],
        appointments: (posts || []) as AppointmentRow[],
      };
    },
    enabled: studentIds.length > 0,
  });

  const awards = data?.awards || [];
  const appointments = data?.appointments || [];
  const photoUrls = usePhotoUrls(awards.map((a) => a.photo_path).filter((p): p is string => !!p));

  const categories = useMemo(
    () => [...new Set(awards.map((a) => a.category))],
    [awards]
  );

  const visible = awards.filter(
    (a) =>
      (category === "all" || a.category === category) &&
      (childFilter === "all" || a.student_id === childFilter)
  );

  const nameFor = (id: string | null) => children.find((c) => c.id === id)?.name || "";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-accent" /> Your children's achievements
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Published awards and prefect appointments, newest first.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/wall">Achievement wall <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {children.length > 1 && (
          <Tabs value={childFilter} onValueChange={setChildFilter}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All children</TabsTrigger>
              {children.map((child) => (
                <TabsTrigger key={child.id} value={child.id}>{child.name.split(" ")[0]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Badge
              role="button"
              tabIndex={0}
              onClick={() => setCategory("all")}
              variant={category === "all" ? "default" : "outline"}
              className="cursor-pointer text-[11px]"
            >
              All categories
            </Badge>
            {categories.map((c) => (
              <Badge
                key={c}
                role="button"
                tabIndex={0}
                onClick={() => setCategory(c)}
                variant={category === c ? "default" : "outline"}
                className="cursor-pointer text-[11px]"
              >
                {categoryLabel(c)}
              </Badge>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Award className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No published awards yet. Anything the school announces will appear here.
            </p>
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/wall">Browse the school's achievement wall <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((award) => (
              <div key={award.id} className="flex items-start gap-3 rounded-lg border p-3">
                <Avatar className="h-11 w-11">
                  {award.photo_path && photoUrls[award.photo_path] && (
                    <AvatarImage src={photoUrls[award.photo_path]} alt="" />
                  )}
                  <AvatarFallback className="bg-accent/10 text-accent">
                    <Medal className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{award.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {nameFor(award.student_id)} · {categoryLabel(award.category)} ·{" "}
                    {award.award_date ? format(new Date(award.award_date), "d MMM yyyy") : "—"}
                  </p>
                  {award.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{award.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {appointments.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prefect roles & appointments
            </p>
            <div className="flex flex-wrap gap-2">
              {appointments
                .filter((a) => childFilter === "all" || a.student_id === childFilter)
                .map((a) => (
                  <Badge key={a.id} variant="secondary" className="text-[11px]">
                    {nameFor(a.student_id).split(" ")[0]} — {a.position_title}
                    {a.portfolio ? ` (${a.portfolio})` : ""}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
