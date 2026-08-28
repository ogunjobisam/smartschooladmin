import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import { sortBySection } from "@/lib/sections";
import { splitPersonName } from "@/lib/names";
import type { Tables } from "@/integrations/supabase/types";

type Application = Tables<"applications">;

interface ConvertApplicantDialogProps {
  application: Application | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Turns an accepted application into a student on the roll.
 *
 * This is the only way an application reaches "enrolled" — the status menu
 * deliberately does not offer it, so the funnel cannot claim a child is on the
 * roll when no student record exists.
 */
export function ConvertApplicantDialog({ application, onOpenChange }: ConvertApplicantDialogProps) {
  const { schoolId, orgId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [classId, setClassId] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [createGuardian, setCreateGuardian] = useState(true);

  const { data: classes } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name, section, level_order")
        .eq("school_id", schoolId!)
        .order("level_order");
      return sortBySection(data || []);
    },
    enabled: !!schoolId && !!application,
  });

  const { data: currentPeriod } = useQuery({
    queryKey: ["current-period", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, academic_years!inner(org_id)")
        .eq("is_current", true)
        .eq("academic_years.org_id", orgId!)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId && !!application,
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!application) throw new Error("No application selected");
      if (!schoolId || !orgId) throw new Error("No school selected");
      if (!classId) throw new Error("Pick the class this child is joining");
      if (!currentPeriod) {
        throw new Error("No current academic term is set. Set one in Settings → Academic Years first.");
      }

      const { data: student, error: studentError } = await supabase
        .from("students")
        .insert({
          school_id: schoolId,
          first_name: application.applicant_first_name,
          last_name: application.applicant_last_name,
          date_of_birth: application.date_of_birth,
          gender: application.gender,
          address: application.guardian_address,
          student_id_number: studentNumber.trim() || null,
        })
        .select("id")
        .single();
      if (studentError) throw studentError;

      const { error: enrolError } = await supabase.from("enrolments").insert({
        student_id: student.id,
        class_id: classId,
        academic_period_id: currentPeriod.id,
      });
      if (enrolError) throw enrolError;

      if (createGuardian) {
        const { first, last } = splitPersonName(application.guardian_name);
        const { data: guardian, error: guardianError } = await supabase
          .from("guardians")
          .insert({
            org_id: orgId,
            first_name: first,
            last_name: last,
            phone: application.guardian_phone,
            email: application.guardian_email,
            address: application.guardian_address,
          })
          .select("id")
          .single();
        if (guardianError) throw guardianError;

        const { error: linkError } = await supabase.from("student_guardians").insert({
          student_id: student.id,
          guardian_id: guardian.id,
          relationship: "parent",
          is_primary: true,
        });
        if (linkError) throw linkError;
      }

      // Last, so a failure above leaves the application still convertible
      // rather than marking it enrolled with no student behind it.
      const { error: applicationError } = await supabase
        .from("applications")
        .update({
          status: "enrolled",
          converted_student_id: student.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", application.id);
      if (applicationError) throw applicationError;

      return student.id;
    },
    onSuccess: (studentId) => {
      toast.success("Enrolled", { description: "The applicant is now a student on the roll." });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["guardians"] });
      onOpenChange(false);
      navigate(`/students/${studentId}`);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not enrol this applicant")),
  });

  return (
    <Dialog open={!!application} onOpenChange={(v) => { if (!v) { setClassId(""); setStudentNumber(""); } onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enrol {application?.applicant_first_name} {application?.applicant_last_name}</DialogTitle>
          <DialogDescription>
            This creates a student record{createGuardian ? ", a guardian record" : ""} and an
            enrolment for {currentPeriod?.name || "the current term"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="convert-class">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="convert-class"><SelectValue placeholder="Pick a class" /></SelectTrigger>
              <SelectContent>
                {(classes || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {application?.section && (
              <p className="text-xs text-muted-foreground">
                They applied for the {application.section} section.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="convert-number">Admission number <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="convert-number" value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={createGuardian} onCheckedChange={(v) => setCreateGuardian(v === true)} className="mt-0.5" />
            <span>
              Also create a guardian record for {application?.guardian_name}
              <span className="block text-xs text-muted-foreground">
                Untick this if they already have one — you can link the existing guardian
                from the student&rsquo;s record instead.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending} className="gap-1.5">
            {convert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Enrol student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
