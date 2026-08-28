import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, Check, Loader2, Plus, Printer, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CertificateDialog } from "@/components/achievements/CertificateDialog";
import { RecognitionPhotoField } from "@/components/achievements/RecognitionPhotoField";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePhotoUrls } from "@/hooks/usePhotoUrl";
import { sendRecognitionNotifications } from "@/lib/notification-dispatcher";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import { displayClassName } from "@/lib/sections";
import { canManageStudents } from "@/lib/access";
import {
  categoriesFor, categoryLabel, RECOGNITION_CATEGORIES,
  type CertificateRecipient, type RecognitionSubject,
} from "@/lib/certificates";

type Status = "draft" | "submitted" | "published" | "archived";

/** Roles that may publish. Mirrors is_school_manager() in the database. */
const PUBLISHER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar"];

const ALL = "all";

const statusTone: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  archived: "bg-destructive/10 text-destructive",
};

interface PersonRef {
  first_name: string;
  last_name: string;
  student_id_number?: string | null;
  staff_id_number?: string | null;
}

interface RecognitionRow {
  id: string;
  school_id: string;
  subject_type: RecognitionSubject;
  student_id: string | null;
  staff_id: string | null;
  category: string;
  title: string;
  description: string | null;
  award_date: string;
  status: Status;
  academic_period_id: string | null;
  class_id: string | null;
  subject_id: string | null;
  published_at: string | null;
  photo_path: string | null;
  students: PersonRef | null;
  staff: PersonRef | null;
  classes: { name: string } | null;
  academic_periods: { name: string } | null;
  subjects: { name: string } | null;
}

interface AppointmentRow {
  id: string;
  school_id: string;
  subject_type: RecognitionSubject;
  student_id: string | null;
  staff_id: string | null;
  position_title: string;
  portfolio: string | null;
  start_date: string;
  end_date: string | null;
  status: Status;
  students: PersonRef | null;
  staff: PersonRef | null;
  academic_years: { name: string } | null;
}

const personName = (row: { students: PersonRef | null; staff: PersonRef | null }) => {
  const p = row.students ?? row.staff;
  return p ? `${p.first_name} ${p.last_name}` : "Unknown";
};

const personIdNumber = (row: { students: PersonRef | null; staff: PersonRef | null }) =>
  row.students?.student_id_number ?? row.staff?.staff_id_number ?? null;

export default function Achievements() {
  const { orgId, schoolId, schools, user, userRole } = useAuth();
  const queryClient = useQueryClient();

  const canPublish = PUBLISHER_ROLES.includes(userRole || "");
  const canDraft = canPublish || canManageStudents(userRole) || userRole === "teacher" || userRole === "hr_admin";

  const [schoolFilter, setSchoolFilter] = useState<string>(ALL);
  const [termFilter, setTermFilter] = useState<string>(ALL);
  const [classFilter, setClassFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);

  const [recOpen, setRecOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);

  const visibleSchoolIds = useMemo(
    () => (schoolFilter === ALL ? schools.map((s) => s.id) : [schoolFilter]),
    [schoolFilter, schools],
  );

  const { data: periods = [] } = useQuery({
    queryKey: ["achievement-periods", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_periods")
        .select("id, name, academic_years!inner(org_id, name)")
        .eq("academic_years.org_id", orgId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: years = [] } = useQuery({
    queryKey: ["achievement-years", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["achievement-classes", visibleSchoolIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, school_id")
        .in("school_id", visibleSchoolIds)
        .order("level_order");
      if (error) throw error;
      return data || [];
    },
    enabled: visibleSchoolIds.length > 0,
  });

  const { data: recognitions = [], isLoading } = useQuery({
    queryKey: ["recognitions", visibleSchoolIds.join(","), termFilter, classFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from("recognitions")
        .select(`
          id, school_id, subject_type, student_id, staff_id, category, title, description,
          award_date, status, academic_period_id, class_id, subject_id, published_at, photo_path,
          students(first_name, last_name, student_id_number),
          staff(first_name, last_name, staff_id_number),
          classes(name),
          academic_periods(name),
          subjects(name)
        `)
        .in("school_id", visibleSchoolIds)
        .order("award_date", { ascending: false });

      if (termFilter !== ALL) query = query.eq("academic_period_id", termFilter);
      if (classFilter !== ALL) query = query.eq("class_id", classFilter);
      if (typeFilter !== ALL) query = query.eq("category", typeFilter);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as RecognitionRow[];
    },
    enabled: visibleSchoolIds.length > 0,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", visibleSchoolIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id, school_id, subject_type, student_id, staff_id, position_title, portfolio,
          start_date, end_date, status,
          students(first_name, last_name, student_id_number),
          staff(first_name, last_name, staff_id_number),
          academic_years(name)
        `)
        .in("school_id", visibleSchoolIds)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AppointmentRow[];
    },
    enabled: visibleSchoolIds.length > 0,
  });

  const { data: school } = useQuery({
    queryKey: ["achievement-school", schoolFilter, schoolId],
    queryFn: async () => {
      const id = schoolFilter === ALL ? schoolId! : schoolFilter;
      const { data, error } = await supabase
        .from("schools")
        .select("name, address, phone, email, logo_url, tagline")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const published = recognitions.filter((r) => r.status === "published");
  const pipeline = recognitions.filter((r) => r.status === "draft" || r.status === "submitted");
  const archived = recognitions.filter((r) => r.status === "archived");

  const logAudit = async (action: string, detail: string, entityId: string) => {
    if (!orgId) return;
    await supabase.from("audit_logs").insert({
      org_id: orgId,
      user_id: user?.id ?? null,
      action,
      entity_type: "recognition",
      entity_id: entityId,
      detail,
    });
  };

  /** Tells the recipient — and, for a student, their guardians — about a new award. */
  const notifyPublished = async (id: string) => {
    const row = recognitions.find((r) => r.id === id);
    if (!row || !orgId) return;
    try {
      await sendRecognitionNotifications({
        orgId,
        schoolId: row.school_id,
        recognitionId: row.id,
        subjectType: row.subject_type,
        studentId: row.student_id,
        staffId: row.staff_id,
        recipientName: personName(row),
        title: row.title,
        citation: row.description,
        awardDate: row.award_date,
      });
    } catch (err) {
      console.error("Could not send recognition notifications", err);
    }
  };

  const setPhoto = useMutation({
    mutationFn: async ({ id, path }: { id: string; path: string | null }) => {
      const { error } = await supabase.from("recognitions").update({ photo_path: path }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recognitions"] }),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, table }: { id: string; status: Status; table: "recognitions" | "appointments" }) => {
      const { error } = await supabase.from(table).update({ status }).eq("id", id);
      if (error) throw error;
      return { id, status, table };
    },
    onSuccess: async ({ id, status, table }) => {
      if (status === "published" && table === "recognitions") await notifyPublished(id);
      await logAudit(`recognition_${status}`, `${table === "appointments" ? "Appointment" : "Recognition"} moved to ${status}`, id);
      queryClient.invalidateQueries({ queryKey: [table === "appointments" ? "appointments" : "recognitions"] });
      toast.success(status === "published" ? "Published" : `Moved to ${status}`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async ({ id, table }: { id: string; table: "recognitions" | "appointments" }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return { id, table };
    },
    onSuccess: ({ table }) => {
      queryClient.invalidateQueries({ queryKey: [table === "appointments" ? "appointments" : "recognitions"] });
      toast.success("Removed");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const photoUrls = usePhotoUrls(recognitions.map((r) => r.photo_path));

  const printRecipients: CertificateRecipient[] = useMemo(
    () =>
      published
        .filter((r) => selected.has(r.id))
        .map((r) => ({
          name: personName(r),
          subjectType: r.subject_type,
          idNumber: personIdNumber(r),
          className: r.classes ? displayClassName(r.classes.name) : null,
          title: r.title,
          category: r.category,
          description: r.description,
          awardDate: r.award_date,
          periodName: r.academic_periods?.name ?? null,
          subjectName: r.subjects?.name ?? null,
          photoUrl: r.photo_path ? photoUrls[r.photo_path] ?? null : null,
        })),
    [published, selected, photoUrls],
  );

  const filters = (
    <div className="flex flex-wrap gap-2">
      {schools.length > 1 && (
        <Select value={schoolFilter} onValueChange={(v) => { setSchoolFilter(v); setClassFilter(ALL); }}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="School" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All schools</SelectItem>
            {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={termFilter} onValueChange={setTermFilter}>
        <SelectTrigger className="w-[170px]"><SelectValue placeholder="Term" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All terms</SelectItem>
          {periods.map((p: { id: string; name: string }) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={classFilter} onValueChange={setClassFilter}>
        <SelectTrigger className="w-[170px]"><SelectValue placeholder="Class" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All classes</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>{displayClassName(c.name)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-[200px]"><SelectValue placeholder="Recognition type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All recognition types</SelectItem>
          {RECOGNITION_CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(schoolFilter !== ALL || termFilter !== ALL || classFilter !== ALL || typeFilter !== ALL) && (
        <Button
          variant="ghost"
          onClick={() => { setSchoolFilter(ALL); setTermFilter(ALL); setClassFilter(ALL); setTypeFilter(ALL); }}
        >
          Clear
        </Button>
      )}
    </div>
  );

  const recognitionCard = (r: RecognitionRow, showActions: boolean) => (
    <Card key={r.id} className="overflow-hidden">
      <CardContent className="flex flex-wrap items-start gap-3 p-4">
        {r.status === "published" && (
          <Checkbox
            checked={selected.has(r.id)}
            onCheckedChange={() => toggleSelected(r.id)}
            aria-label={`Select ${personName(r)}`}
            className="mt-1"
          />
        )}
        <Avatar className="h-14 w-14 rounded-lg border border-border">
          <AvatarImage
            src={r.photo_path ? photoUrls[r.photo_path] : undefined}
            alt={`${personName(r)} award photo`}
            className="object-cover"
          />
          <AvatarFallback className="rounded-lg bg-muted text-base">
            {personName(r).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{personName(r)}</span>
            <Badge variant="outline">{r.subject_type === "staff" ? "Staff" : "Student"}</Badge>
            <Badge className={statusTone[r.status]}>{r.status}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{r.title}</p>
          <p className="text-xs text-muted-foreground">
            {[
              categoryLabel(r.category),
              r.classes ? displayClassName(r.classes.name) : null,
              r.academic_periods?.name,
              r.subjects?.name,
              r.award_date ? format(new Date(r.award_date), "d MMM yyyy") : null,
            ].filter(Boolean).join(" · ")}
          </p>
          {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
        </div>

        {showActions && (
          <div className="flex flex-wrap items-center gap-2">
            {canDraft && (
              <RecognitionPhotoField
                recognitionId={r.id}
                schoolId={r.school_id}
                value={r.photo_path}
                size="sm"
                onChange={(path) => setPhoto.mutateAsync({ id: r.id, path })}
                fallback="🏅"
              />
            )}
            {r.status !== "published" && canPublish && (
              <Button size="sm" onClick={() => setStatus.mutate({ id: r.id, status: "published", table: "recognitions" })}>
                <Check className="mr-1 h-4 w-4" /> Publish
              </Button>
            )}
            {r.status === "draft" && !canPublish && (
              <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "submitted", table: "recognitions" })}>
                Submit for approval
              </Button>
            )}
            {r.status === "published" && canPublish && (
              <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "archived", table: "recognitions" })}>
                <Undo2 className="mr-1 h-4 w-4" /> Withdraw
              </Button>
            )}
            {r.status === "archived" && canPublish && (
              <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "draft", table: "recognitions" })}>
                Reopen
              </Button>
            )}
            {canPublish && (
              <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: r.id, table: "recognitions" })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achievement Wall"
        description="Prizes, commendations and prefect appointments. Nothing shows on a profile until it is published."
      >
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer className="mr-2 h-4 w-4" /> Print {selected.size}
            </Button>
          )}
          {canDraft && (
            <>
              <Button variant="outline" onClick={() => setApptOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Appointment
              </Button>
              <Button onClick={() => setRecOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Recognition
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {filters}

      <Tabs defaultValue="wall">
        <TabsList>
          <TabsTrigger value="wall">Wall ({published.length})</TabsTrigger>
          {canDraft && <TabsTrigger value="pipeline">Awaiting approval ({pipeline.length})</TabsTrigger>}
          <TabsTrigger value="appointments">Appointments ({appointments.length})</TabsTrigger>
          {canPublish && <TabsTrigger value="archived">Withdrawn ({archived.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="wall" className="space-y-3 pt-4">
          {isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : published.length === 0 ? (
            <EmptyState
              icon={Award}
              title="Nothing published yet"
              description="Add a recognition and publish it — published records appear here and on the student or staff profile."
            />
          ) : (
            published.map((r) => recognitionCard(r, true))
          )}
        </TabsContent>

        {canDraft && (
          <TabsContent value="pipeline" className="space-y-3 pt-4">
            {pipeline.length === 0 ? (
              <EmptyState icon={Award} title="Nothing waiting" description="Drafts and submissions appear here for approval." />
            ) : (
              pipeline.map((r) => recognitionCard(r, true))
            )}
          </TabsContent>
        )}

        <TabsContent value="appointments" className="space-y-3 pt-4">
          {appointments.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No appointments"
              description="Record prefects and staff appointments with their portfolio and tenure."
            />
          ) : (
            appointments.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{personName(a)}</span>
                      <Badge variant="outline">{a.subject_type === "staff" ? "Staff" : "Student"}</Badge>
                      <Badge className={statusTone[a.status]}>{a.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium">{a.position_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        a.portfolio,
                        a.academic_years?.name,
                        `${format(new Date(a.start_date), "d MMM yyyy")}${a.end_date ? ` – ${format(new Date(a.end_date), "d MMM yyyy")}` : " – present"}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {canPublish && (
                    <div className="flex gap-2">
                      {a.status !== "published" ? (
                        <Button size="sm" onClick={() => setStatus.mutate({ id: a.id, status: "published", table: "appointments" })}>
                          <Check className="mr-1 h-4 w-4" /> Publish
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: a.id, status: "archived", table: "appointments" })}>
                          <Undo2 className="mr-1 h-4 w-4" /> End
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: a.id, table: "appointments" })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {canPublish && (
          <TabsContent value="archived" className="space-y-3 pt-4">
            {archived.length === 0 ? (
              <EmptyState icon={Award} title="Nothing withdrawn" description="Withdrawn recognitions are kept here for the record." />
            ) : (
              archived.map((r) => recognitionCard(r, true))
            )}
          </TabsContent>
        )}
      </Tabs>

      <RecognitionForm
        open={recOpen}
        onOpenChange={setRecOpen}
        orgId={orgId}
        schoolId={schoolFilter === ALL ? schoolId : schoolFilter}
        canPublish={canPublish}
        periods={periods as { id: string; name: string }[]}
        classes={classes}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["recognitions"] })}
      />

      <AppointmentForm
        open={apptOpen}
        onOpenChange={setApptOpen}
        orgId={orgId}
        schoolId={schoolFilter === ALL ? schoolId : schoolFilter}
        canPublish={canPublish}
        years={years}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["appointments"] })}
      />

      <CertificateDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        recipients={printRecipients}
        school={{
          name: school?.name ?? "School",
          address: school?.address,
          phone: school?.phone,
          email: school?.email,
          logoUrl: school?.logo_url,
          tagline: school?.tagline,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

interface FormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string | null;
  schoolId: string | null;
  canPublish: boolean;
  onSaved: () => void;
}

function usePeople(schoolId: string | null, subject: RecognitionSubject, enabled: boolean) {
  return useQuery({
    queryKey: ["achievement-people", schoolId, subject],
    queryFn: async () => {
      if (subject === "student") {
        const { data, error } = await supabase
          .from("students")
          .select("id, first_name, last_name, student_id_number")
          .eq("school_id", schoolId!)
          .eq("status", "active")
          .order("first_name");
        if (error) throw error;
        return (data || []).map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name}` }));
      }
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId!)
        .eq("employment_status", "active")
        .order("first_name");
      if (error) throw error;
      return (data || []).map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name}` }));
    },
    enabled: enabled && !!schoolId,
  });
}

function RecognitionForm({
  open, onOpenChange, orgId, schoolId, canPublish, periods, classes, onSaved,
}: FormProps & {
  periods: { id: string; name: string }[];
  classes: { id: string; name: string }[];
}) {
  const [subject, setSubject] = useState<RecognitionSubject>("student");
  const [personId, setPersonId] = useState("");
  const [category, setCategory] = useState("best_in_class");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [awardDate, setAwardDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [periodId, setPeriodId] = useState<string>(ALL);
  const [classId, setClassId] = useState<string>(ALL);
  const [publishNow, setPublishNow] = useState(false);
  const [recognitionId, setRecognitionId] = useState(() => crypto.randomUUID());
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  const { data: people = [] } = usePeople(schoolId, subject, open);
  const { data: subjects = [] } = useQuery({
    queryKey: ["achievement-subjects", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!schoolId,
  });
  const [subjectId, setSubjectId] = useState<string>(ALL);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId || !schoolId) throw new Error("Choose a school first");
      if (!personId) throw new Error("Choose who the recognition is for");
      const { error } = await supabase.from("recognitions").insert({
        id: recognitionId,
        photo_path: photoPath,
        org_id: orgId,
        school_id: schoolId,
        subject_type: subject,
        student_id: subject === "student" ? personId : null,
        staff_id: subject === "staff" ? personId : null,
        category,
        title: title.trim() || categoryLabel(category),
        description: description.trim() || null,
        award_date: awardDate,
        academic_period_id: periodId === ALL ? null : periodId,
        class_id: classId === ALL ? null : classId,
        subject_id: subjectId === ALL ? null : subjectId,
        status: publishNow && canPublish ? "published" : "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(publishNow && canPublish ? "Recognition published" : "Saved as a draft for approval");
      onSaved();
      onOpenChange(false);
      setPersonId("");
      setTitle("");
      setDescription("");
      setPublishNow(false);
      setPhotoPath(null);
      setRecognitionId(crypto.randomUUID());
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a recognition</DialogTitle>
          <DialogDescription>
            Drafts stay private. Once published it appears on the wall and on the recipient's profile.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>For</Label>
            <Select
              value={subject}
              onValueChange={(v) => { setSubject(v as RecognitionSubject); setPersonId(""); setCategory(v === "staff" ? "teacher_of_term" : "best_in_class"); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">A student</SelectItem>
                <SelectItem value="staff">A staff member</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Recipient</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoriesFor(subject).map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rec-date">Award date</Label>
            <Input id="rec-date" type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rec-title">Title</Label>
            <Input
              id="rec-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={categoryLabel(category)}
            />
          </div>

          <div className="space-y-2">
            <Label>Term</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Not term-specific</SelectItem>
                {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {subject === "student" && (
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>No class</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{displayClassName(c.name)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {category === "subject_prize" && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>No subject</SelectItem>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rec-desc">Citation (optional)</Label>
            <Textarea
              id="rec-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Highest average in the class for the term."
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Award photo (optional)</Label>
            <RecognitionPhotoField
              recognitionId={recognitionId}
              schoolId={schoolId}
              value={photoPath}
              onChange={(path) => setPhotoPath(path)}
            />
          </div>

          {canPublish && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={publishNow} onCheckedChange={(v) => setPublishNow(!!v)} />
              Publish immediately
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentForm({
  open, onOpenChange, orgId, schoolId, canPublish, years, onSaved,
}: FormProps & { years: { id: string; name: string }[] }) {
  const [subject, setSubject] = useState<RecognitionSubject>("student");
  const [personId, setPersonId] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [yearId, setYearId] = useState<string>(ALL);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [publishNow, setPublishNow] = useState(false);

  const { data: people = [] } = usePeople(schoolId, subject, open);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId || !schoolId) throw new Error("Choose a school first");
      if (!personId) throw new Error("Choose who is being appointed");
      if (!positionTitle.trim()) throw new Error("Give the appointment a title");
      const { error } = await supabase.from("appointments").insert({
        org_id: orgId,
        school_id: schoolId,
        subject_type: subject,
        student_id: subject === "student" ? personId : null,
        staff_id: subject === "staff" ? personId : null,
        position_title: positionTitle.trim(),
        portfolio: portfolio.trim() || null,
        academic_year_id: yearId === ALL ? null : yearId,
        start_date: startDate,
        end_date: endDate || null,
        status: publishNow && canPublish ? "published" : "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(publishNow && canPublish ? "Appointment published" : "Saved as a draft for approval");
      onSaved();
      onOpenChange(false);
      setPersonId("");
      setPositionTitle("");
      setPortfolio("");
      setPublishNow(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record an appointment</DialogTitle>
          <DialogDescription>Prefects, house captains and staff offices, with their tenure.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>For</Label>
            <Select value={subject} onValueChange={(v) => { setSubject(v as RecognitionSubject); setPersonId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">A student</SelectItem>
                <SelectItem value="staff">A staff member</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Appointee</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="appt-title">Position</Label>
            <Input
              id="appt-title"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="Head Boy, Senior Prefect, Games Captain"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="appt-portfolio">Portfolio (optional)</Label>
            <Input
              id="appt-portfolio"
              value={portfolio}
              onChange={(e) => setPortfolio(e.target.value)}
              placeholder="Sanitation, Library, Sports"
            />
          </div>

          <div className="space-y-2">
            <Label>Academic year</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Not year-specific</SelectItem>
                {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="appt-start">From</Label>
              <Input id="appt-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-end">To</Label>
              <Input id="appt-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {canPublish && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={publishNow} onCheckedChange={(v) => setPublishNow(!!v)} />
              Publish immediately
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
