import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, ExternalLink, Medal, Search, Settings2, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePhotoUrls } from "@/hooks/usePhotoUrl";
import { canAccessPath } from "@/lib/access";
import { categoryLabel, RECOGNITION_CATEGORIES } from "@/lib/certificates";
import { displayClassName } from "@/lib/sections";

const ALL = "all";

interface Person {
  first_name: string;
  last_name: string;
  photo_url?: string | null;
}

interface RecognitionRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  award_date: string;
  photo_path: string | null;
  subject_type: "student" | "staff";
  student_id: string | null;
  staff_id: string | null;
  students: Person | null;
  staff: Person | null;
  classes: { name: string } | null;
  academic_periods: { name: string } | null;
  subjects: { name: string } | null;
}

interface AppointmentRow {
  id: string;
  position_title: string;
  portfolio: string | null;
  start_date: string;
  end_date: string | null;
  subject_type: "student" | "staff";
  student_id: string | null;
  staff_id: string | null;
  students: Person | null;
  staff: Person | null;
  academic_years: { name: string } | null;
}

/**
 * The public face of recognitions inside the app: everyone in the organisation,
 * parents and students included, can read published awards, so this page is a
 * read-only celebration wall rather than the management screen at /achievements.
 */
export default function AchievementWall() {
  const { schoolId, userRole } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL);

  const canManage = canAccessPath(userRole, "/achievements");
  const canOpenStudents = canAccessPath(userRole, "/students");
  const canOpenStaff = canAccessPath(userRole, "/staff");

  const { data: recognitions = [], isLoading } = useQuery({
    queryKey: ["wall-recognitions", schoolId],
    queryFn: async () => {
      let query = supabase
        .from("recognitions")
        .select(`
          id, title, description, category, award_date, photo_path, subject_type, student_id, staff_id,
          students(first_name, last_name, photo_url),
          staff(first_name, last_name, photo_url),
          classes(name), academic_periods(name), subjects(name)
        `)
        .eq("status", "published")
        .order("award_date", { ascending: false })
        .limit(200);
      if (schoolId) query = query.eq("school_id", schoolId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as RecognitionRow[];
    },
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["wall-appointments", schoolId],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select(`
          id, position_title, portfolio, start_date, end_date, subject_type, student_id, staff_id,
          students(first_name, last_name, photo_url),
          staff(first_name, last_name, photo_url),
          academic_years(name)
        `)
        .eq("status", "published")
        .order("start_date", { ascending: false })
        .limit(200);
      if (schoolId) query = query.eq("school_id", schoolId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AppointmentRow[];
    },
  });

  const photoUrls = usePhotoUrls([
    ...recognitions.flatMap((r) => [r.photo_path, r.students?.photo_url, r.staff?.photo_url]),
    ...appointments.flatMap((a) => [a.students?.photo_url, a.staff?.photo_url]),
  ]);

  const nameOf = (row: { students: Person | null; staff: Person | null }) => {
    const p = row.students ?? row.staff;
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
  };

  const initialsOf = (row: { students: Person | null; staff: Person | null }) =>
    nameOf(row)
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const profileLink = (row: { subject_type: string; student_id: string | null; staff_id: string | null }) => {
    if (row.subject_type === "student" && row.student_id && canOpenStudents) return `/students/${row.student_id}`;
    if (row.subject_type === "staff" && row.staff_id && canOpenStaff) return `/staff/${row.staff_id}`;
    return null;
  };

  const matches = (text: string) => text.toLowerCase().includes(search.trim().toLowerCase());

  const filteredRecognitions = useMemo(
    () =>
      recognitions.filter(
        (r) =>
          (categoryFilter === ALL || r.category === categoryFilter) &&
          (!search.trim() || matches(`${r.title} ${nameOf(r)} ${r.classes?.name ?? ""}`)),
      ),
    [recognitions, categoryFilter, search],
  );

  const filteredAppointments = useMemo(
    () =>
      appointments.filter(
        (a) => !search.trim() || matches(`${a.position_title} ${nameOf(a)} ${a.portfolio ?? ""}`),
      ),
    [appointments, search],
  );

  const studentAwards = filteredRecognitions.filter((r) => r.subject_type === "student");
  const staffAwards = filteredRecognitions.filter((r) => r.subject_type === "staff");

  const photoFor = (row: RecognitionRow) =>
    (row.photo_path ? photoUrls[row.photo_path] : undefined) ??
    photoUrls[(row.students?.photo_url ?? row.staff?.photo_url) || ""];

  const renderRecognition = (r: RecognitionRow) => {
    const link = profileLink(r);
    return (
      <Card key={r.id} className="overflow-hidden transition-shadow hover:shadow-md">
        <div className="h-1.5 w-full bg-gradient-to-r from-accent via-primary to-accent" />
        <CardContent className="flex gap-4 p-4">
          <Avatar className="h-16 w-16 shrink-0 rounded-xl border border-border">
            <AvatarImage src={photoFor(r)} alt="" className="object-cover" />
            <AvatarFallback className="rounded-xl bg-accent/10 text-accent">{initialsOf(r)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-card-foreground">{r.title}</span>
              <Badge variant="secondary" className="text-[10px]">{categoryLabel(r.category)}</Badge>
            </div>
            <p className="text-sm font-medium">
              {link ? (
                <Link to={link} className="text-accent underline-offset-2 hover:underline">
                  {nameOf(r)}
                </Link>
              ) : (
                nameOf(r)
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                displayClassName(r.classes?.name),
                r.academic_periods?.name,
                r.subjects?.name,
                format(new Date(r.award_date), "d MMM yyyy"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderAppointment = (a: AppointmentRow) => {
    const link = profileLink(a);
    const photo = photoUrls[(a.students?.photo_url ?? a.staff?.photo_url) || ""];
    return (
      <Card key={a.id} className="overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <Avatar className="h-14 w-14 shrink-0 rounded-xl border border-border">
            <AvatarImage src={photo} alt="" className="object-cover" />
            <AvatarFallback className="rounded-xl bg-primary/10 text-primary">{initialsOf(a)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-card-foreground">{a.position_title}</span>
              <Badge variant="outline" className="text-[10px]">
                {a.subject_type === "student" ? "Prefect" : "Staff role"}
              </Badge>
            </div>
            <p className="text-sm font-medium">
              {link ? (
                <Link to={link} className="text-accent underline-offset-2 hover:underline">
                  {nameOf(a)}
                </Link>
              ) : (
                nameOf(a)
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                a.portfolio,
                a.academic_years?.name,
                `${format(new Date(a.start_date), "MMM yyyy")}${a.end_date ? ` – ${format(new Date(a.end_date), "MMM yyyy")}` : " – present"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

  const emptyState = (message: string) => (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Medal className="h-9 w-9 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
        {canManage && (
          <Button asChild variant="outline" size="sm">
            <Link to="/achievements">Manage achievements</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achievement Wall"
        description="Published awards, prizes and appointments for students and staff."
      >
        {canManage && (
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/achievements">
              <Settings2 className="h-4 w-4" /> Manage
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, award or class"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {RECOGNITION_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students" className="gap-1">
              <Award className="h-4 w-4" /> Students ({studentAwards.length})
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1">
              <Award className="h-4 w-4" /> Staff ({staffAwards.length})
            </TabsTrigger>
            <TabsTrigger value="appointments" className="gap-1">
              <Users className="h-4 w-4" /> Prefects & roles ({filteredAppointments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="mt-4">
            {studentAwards.length === 0
              ? emptyState("No published student awards match this view yet.")
              : <div className="grid gap-4 md:grid-cols-2">{studentAwards.map(renderRecognition)}</div>}
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            {staffAwards.length === 0
              ? emptyState("No published staff awards match this view yet.")
              : <div className="grid gap-4 md:grid-cols-2">{staffAwards.map(renderRecognition)}</div>}
          </TabsContent>

          <TabsContent value="appointments" className="mt-4">
            {filteredAppointments.length === 0
              ? emptyState("No published appointments match this view yet.")
              : <div className="grid gap-4 md:grid-cols-2">{filteredAppointments.map(renderAppointment)}</div>}
          </TabsContent>
        </Tabs>
      )}

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <ExternalLink className="h-3 w-3" /> Awards appear here once a school manager publishes them.
      </p>
    </div>
  );
}
