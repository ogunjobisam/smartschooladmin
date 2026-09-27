import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { administers, fetchCallerRoles } from "../_shared/caller-roles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    // Identity comes from the verified bearer token only. A `user_id` supplied in
    // the request body is not proof of anything, so it is never trusted here.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Unauthorized", 401);
    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const { data: { user } } = await createClient(supabaseUrl, anonKey).auth.getUser(token);
    if (!user) return jsonError("Unauthorized", 401);
    const userId = user.id;

    const { org_id, school_id } = body;
    if (!org_id || !school_id) throw new Error("org_id and school_id required");

    // Tenant isolation: seeding writes with the service role key, so confirm the
    // caller actually administers the org/school they are asking us to fill.
    // Ask about the whole set of roles this caller holds rather than one row
    // PostgREST happened to return first. Passing school_id is what closes the
    // second hole here: the old check proved only that the school belonged to
    // the org, so a school_admin scoped to one school could seed any school in
    // the group — while this writes with the service role key.
    const SEED_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin"];
    const callerRole = administers(await fetchCallerRoles(supabase, userId), {
      allowed: SEED_ROLES,
      orgId: org_id,
      schoolId: school_id,
    });
    if (!callerRole) {
      return jsonError("Forbidden — you do not administer this school", 403);
    }

    const { data: seedSchool } = await supabase
      .from("schools")
      .select("id")
      .eq("id", school_id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (!seedSchool) return jsonError("Forbidden — school does not belong to your organisation", 403);

    // Get classes for this school
    const { data: classes } = await supabase.from("classes").select("id, name").eq("school_id", school_id);
    if (!classes?.length) throw new Error("No classes found");

    // Get all academic periods
    const { data: allPeriods } = await supabase.from("academic_periods")
      .select("id, name, academic_year_id, is_current")
      .order("name");
    
    // Filter to periods belonging to this org's academic years
    const { data: orgYears } = await supabase.from("academic_years")
      .select("id").eq("org_id", org_id);
    const orgYearIds = new Set((orgYears || []).map(y => y.id));
    const periods = (allPeriods || []).filter(p => orgYearIds.has(p.academic_year_id));
    const currentPeriod = periods.find(p => p.is_current) || periods[0];

    // Get fee categories
    const { data: feeCategories } = await supabase.from("fee_categories").select("id, name").eq("org_id", org_id);

    // Nigerian names
    const firstNames = ["Chinedu", "Adaeze", "Emeka", "Ngozi", "Obinna", "Amara", "Tunde", "Folake", "Ikenna", "Chidinma",
      "Yusuf", "Fatima", "Oluwaseun", "Blessing", "Kingsley", "Nneka", "Damilola", "Halima", "Chukwuma", "Ifeoma",
      "Abiodun", "Chiamaka", "Segun", "Nkechi", "Uche", "Zainab", "Tobi", "Adaobi", "Babatunde", "Onyinyechi",
      "Kabiru", "Aisha", "Jide", "Bukola", "Chidi", "Funke", "Ibrahim", "Bisi", "Ebuka", "Grace",
      "Ahmed", "Chinelo", "Femi", "Kemi", "Nnamdi", "Omolara", "Suleiman", "Titilayo", "Ugochukwu", "Wunmi"];
    const lastNames = ["Okafor", "Adeyemi", "Nwosu", "Balogun", "Eze", "Adeleke", "Obi", "Afolabi", "Nwankwo", "Ogundimu",
      "Musa", "Okwu", "Ibrahim", "Chukwu", "Adeniyi", "Onyeka", "Fashola", "Igwe", "Olayinka", "Uzodinma",
      "Abdullahi", "Ani", "Bakare", "Dim", "Ekechi", "Garba", "Hassan", "Iheanacho", "Jimoh", "Kalu"];

    const genders = ["Male", "Female"];
    const studentTypes = ["day", "boarding"];

    // Check if students already exist
    const { count: existingStudentCount } = await supabase.from("students")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    let students: { id: string }[] = [];
    
    if ((existingStudentCount || 0) > 0) {
      // Use existing students
      const { data: existingStudents } = await supabase.from("students")
        .select("id").eq("school_id", school_id);
      students = existingStudents || [];
    } else {
      // Create 60 students across classes
      const studentInserts = [];
      for (let i = 0; i < 60; i++) {
        const gender = genders[i % 2];
        const fn = firstNames[i % firstNames.length];
        const ln = lastNames[i % lastNames.length];
        const year = 2008 + Math.floor(Math.random() * 6);
        const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
        const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");

        studentInserts.push({
          school_id,
          first_name: fn,
          last_name: ln,
          gender,
          student_type: studentTypes[i % 2],
          date_of_birth: `${year}-${month}-${day}`,
          student_id_number: `STU-${String(i + 1).padStart(4, "0")}`,
          status: i < 55 ? "active" : (i < 58 ? "inactive" : "suspended"),
        });
      }
      const { data: newStudents, error: studErr } = await supabase.from("students").insert(studentInserts).select("id");
      if (studErr) throw studErr;
      students = newStudents!;

      // Enrol students into classes
      if (currentPeriod) {
        const enrolInserts = students.map((s, i) => ({
          student_id: s.id,
          class_id: classes[i % classes.length].id,
          academic_period_id: currentPeriod.id,
        }));
        await supabase.from("enrolments").insert(enrolInserts);
      }

      // Create 30 guardians and link to students
      const guardianInserts = [];
      for (let i = 0; i < 30; i++) {
        guardianInserts.push({
          org_id,
          first_name: firstNames[(i + 25) % firstNames.length],
          last_name: lastNames[i % lastNames.length],
          phone: `080${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
          email: `parent${i + 1}@example.com`,
        });
      }
      const { data: guardians } = await supabase.from("guardians").insert(guardianInserts).select("id");

      if (guardians) {
        const sgInserts = students.map((s, i) => ({
          student_id: s.id,
          guardian_id: guardians[Math.floor(i / 2) % guardians.length].id,
          relationship: i % 3 === 0 ? "father" : i % 3 === 1 ? "mother" : "guardian",
          is_primary: i % 2 === 0,
        }));
        await supabase.from("student_guardians").insert(sgInserts);
      }
    }

    // Check if staff already exist
    const { count: existingStaffCount } = await supabase.from("staff")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    let staffList: { id: string }[] = [];
    const staffTitles = ["Teacher", "Teacher", "Teacher", "Teacher", "Teacher",
      "Head Teacher", "Librarian", "Lab Technician", "Accountant", "Secretary",
      "Security", "Driver", "Cleaner", "IT Officer", "Counselor"];
    const staffDepts = ["Science", "Arts", "Commercial", "Science", "Arts",
      "Admin", "Library", "Science", "Finance", "Admin",
      "Operations", "Operations", "Operations", "ICT", "Student Affairs"];
    const salaries = [250000, 230000, 220000, 240000, 210000, 350000, 180000, 200000, 280000, 160000, 100000, 120000, 90000, 260000, 220000];

    if ((existingStaffCount || 0) > 0) {
      const { data: existingStaff } = await supabase.from("staff").select("id").eq("school_id", school_id);
      staffList = existingStaff || [];
    } else {
      const staffInserts = [];
      for (let i = 0; i < 15; i++) {
        staffInserts.push({
          school_id,
          first_name: firstNames[(i + 35) % firstNames.length],
          last_name: lastNames[(i + 15) % lastNames.length],
          email: `staff${i + 1}@school.ng`,
          phone: `070${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
          gender: genders[i % 2],
          staff_id_number: `EMP-${String(i + 1).padStart(3, "0")}`,
          employment_status: i < 13 ? "active" : (i === 13 ? "on_leave" : "inactive"),
          employment_date: `${2018 + Math.floor(i / 3)}-0${(i % 9) + 1}-15`,
        });
      }
      const { data: newStaff } = await supabase.from("staff").insert(staffInserts).select("id");
      staffList = newStaff || [];

      if (staffList.length) {
        const posInserts = staffList.map((s, i) => ({
          staff_id: s.id,
          title: staffTitles[i],
          department: staffDepts[i],
          is_current: true,
        }));
        await supabase.from("staff_positions").insert(posInserts);

        const ppInserts = staffList.map((s, i) => ({
          staff_id: s.id,
          basic_salary: salaries[i],
          housing_allowance: Math.round(salaries[i] * 0.2),
          transport_allowance: Math.round(salaries[i] * 0.1),
          pension_rate: 7.5,
          tax_rate: i < 5 ? 10 : 7,
        }));
        await supabase.from("payroll_profiles").insert(ppInserts);

        const banks = ["First Bank", "GTBank", "Access Bank", "Zenith Bank", "UBA"];
        const bdInserts = staffList.map((s, i) => ({
          staff_id: s.id,
          bank_name: banks[i % banks.length],
          account_number: String(2000000000 + i * 11111),
          account_name: `${staffInserts[i].first_name} ${staffInserts[i].last_name}`,
        }));
        await supabase.from("staff_bank_details").insert(bdInserts);
      }
    }

    // ===== SUBJECTS =====
    const { count: existingSubjectCount } = await supabase.from("subjects")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    let subjectsList: { id: string; name: string }[] = [];
    if ((existingSubjectCount || 0) > 0) {
      const { data } = await supabase.from("subjects").select("id, name").eq("school_id", school_id);
      subjectsList = data || [];
    } else {
      const subjectData = [
        { name: "Mathematics", short_code: "MTH" },
        { name: "English Language", short_code: "ENG" },
        { name: "Physics", short_code: "PHY" },
        { name: "Chemistry", short_code: "CHM" },
        { name: "Biology", short_code: "BIO" },
        { name: "Geography", short_code: "GEO" },
        { name: "Economics", short_code: "ECO" },
        { name: "Civic Education", short_code: "CIV" },
        { name: "Computer Science", short_code: "CPS" },
        { name: "Agricultural Science", short_code: "AGR" },
      ];
      const subjectInserts = subjectData.map(s => ({ ...s, school_id, is_active: true }));
      const { data: newSubjects } = await supabase.from("subjects").insert(subjectInserts).select("id, name");
      subjectsList = newSubjects || [];

      // Link subjects to classes
      if (subjectsList.length) {
        const csInserts = classes.flatMap(c =>
          subjectsList.map(s => ({ class_id: c.id, subject_id: s.id }))
        );
        // Insert in batches
        for (let b = 0; b < csInserts.length; b += 50) {
          await supabase.from("class_subjects").insert(csInserts.slice(b, b + 50));
        }
      }
    }

    // ===== EXAMS & SCORES =====
    const { count: existingExamCount } = await supabase.from("exams")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    if ((existingExamCount || 0) <= 1 && currentPeriod && subjectsList.length) {
      // Create exams for each class across periods
      const examInserts = [];
      const examNames = ["Mid-Term Test", "End of Term Exam"];
      for (const period of periods) {
        for (const cls of classes) {
          for (const eName of examNames) {
            examInserts.push({
              school_id,
              name: `${eName} - ${cls.name}`,
              class_id: cls.id,
              academic_period_id: period.id,
              max_score: 100,
              weight: eName.includes("Mid") ? 30 : 70,
              status: period.is_current ? "published" : "published",
              exam_date: period.is_current ? "2026-03-01" : "2025-12-10",
              created_by: userId,
            });
          }
        }
      }
      const { data: exams } = await supabase.from("exams").insert(examInserts).select("id, class_id, academic_period_id, name");

      // Generate scores for students in their respective classes
      if (exams && students.length) {
        // Get enrolments to map students to classes
        const { data: enrolments } = await supabase.from("enrolments")
          .select("student_id, class_id, academic_period_id")
          .in("student_id", students.map(s => s.id));

        const scoreInserts: Record<string, unknown>[] = [];
        for (const exam of exams) {
          // Find students enrolled in this exam's class and period
          const enrolledStudents = (enrolments || []).filter(
            e => e.class_id === exam.class_id && e.academic_period_id === exam.academic_period_id
          );
          // If no period-specific enrolments, just use class-based assignment
          const studentsForExam = enrolledStudents.length > 0
            ? enrolledStudents.map(e => e.student_id)
            : students.filter((_, i) => classes[i % classes.length].id === exam.class_id).map(s => s.id);

          // Pick 5-6 subjects per exam
          const examSubjects = subjectsList.slice(0, Math.min(6, subjectsList.length));
          for (const studentId of studentsForExam) {
            for (const subject of examSubjects) {
              const score = 35 + Math.floor(Math.random() * 60); // 35-94
              const grade = score >= 70 ? "A" : score >= 60 ? "B" : score >= 50 ? "C" : score >= 40 ? "D" : "F";
              scoreInserts.push({
                exam_id: exam.id,
                student_id: studentId,
                subject_id: subject.id,
                score,
                grade,
                entered_by: userId,
              });
            }
          }
        }
        // Insert scores in batches of 200
        for (let b = 0; b < scoreInserts.length; b += 200) {
          await supabase.from("student_scores").insert(scoreInserts.slice(b, b + 200));
        }
      }
    }

    // ===== ATTENDANCE RECORDS =====
    const { count: existingAttendanceCount } = await supabase.from("attendance_records")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    if ((existingAttendanceCount || 0) === 0 && students.length) {
      const attendanceInserts: Record<string, unknown>[] = [];
      const statuses = ["present", "present", "present", "present", "present", "present", "late", "absent", "excused", "present"];
      // Generate 15 days of attendance
      for (let day = 1; day <= 15; day++) {
        const dateStr = `2026-03-${String(day).padStart(2, "0")}`;
        // Skip weekends
        const d = new Date(dateStr);
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        for (let i = 0; i < Math.min(50, students.length); i++) {
          attendanceInserts.push({
            school_id,
            student_id: students[i].id,
            class_id: classes[i % classes.length].id,
            date: dateStr,
            status: statuses[(i + day) % statuses.length],
            marked_by: userId,
          });
        }
      }
      // Insert in batches of 200
      for (let b = 0; b < attendanceInserts.length; b += 200) {
        await supabase.from("attendance_records").insert(attendanceInserts.slice(b, b + 200));
      }
    }

    // ===== STUDENT AWARDS =====
    const { count: existingAwardsCount } = await supabase.from("student_awards")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    if ((existingAwardsCount || 0) === 0 && students.length) {
      const awardTitles = [
        "Best in Mathematics", "Most Improved Student", "Excellence in English",
        "Best in Science", "Overall Best Student", "Punctuality Award",
        "Good Conduct Award", "Best in Computer Science", "Creative Arts Award",
        "Sports Achievement Award", "Leadership Award", "Reading Champion",
      ];
      const awardInserts = [];
      for (let i = 0; i < Math.min(12, students.length); i++) {
        awardInserts.push({
          school_id,
          student_id: students[i * 4 % students.length].id,
          title: awardTitles[i],
          description: `Awarded for outstanding performance in ${awardTitles[i].toLowerCase().replace("best in ", "").replace(" award", "")}`,
          award_date: i < 6 ? "2025-12-15" : "2026-03-10",
          academic_period_id: i < 6 ? (periods.find(p => p.name === "Term 1")?.id || null) : (currentPeriod?.id || null),
        });
      }
      await supabase.from("student_awards").insert(awardInserts);
    }

    // ===== FEE SCHEDULES =====
    const { count: existingFeeScheduleCount } = await supabase.from("fee_schedules")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    if ((existingFeeScheduleCount || 0) === 0 && currentPeriod) {
      const fsInserts = classes.map(cls => ({
        school_id,
        name: `${cls.name} - Term 2 Fees`,
        class_id: cls.id,
        academic_period_id: currentPeriod.id,
        total_amount: cls.name.startsWith("SS") ? 250000 : 180000, // whole naira
        is_active: true,
      }));
      await supabase.from("fee_schedules").insert(fsInserts);
    }

    // ===== INVOICES & PAYMENTS =====
    const { count: existingInvoiceCount } = await supabase.from("invoices")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    let invoiceCount = 0;
    let paymentCount = 0;

    if ((existingInvoiceCount || 0) === 0) {
      const invoiceInserts = [];
      const invStatuses: Array<"paid" | "pending" | "overdue" | "draft"> = ["paid", "paid", "pending", "overdue", "paid", "pending"];
      for (let i = 0; i < Math.min(40, students.length); i++) {
        const status = invStatuses[i % invStatuses.length];
        const totalAmount = (150000 + Math.floor(Math.random() * 100000)) * 100;
        const amountPaid = status === "paid" ? totalAmount : status === "pending" ? Math.round(totalAmount * 0.3) : 0;

        invoiceInserts.push({
          school_id,
          student_id: students[i].id,
          invoice_number: `INV-${String(i + 1).padStart(5, "0")}`,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          status,
          academic_period_id: currentPeriod?.id || null,
          due_date: status === "overdue" ? "2025-12-15" : "2026-03-30",
          created_by: userId,
        });
      }
      const { data: invoices } = await supabase.from("invoices").insert(invoiceInserts).select("id");
      invoiceCount = invoices?.length || 0;

      if (invoices && feeCategories?.length) {
        const iiInserts = invoices.flatMap((inv, i) => {
          const total = invoiceInserts[i].total_amount;
          return [
            { invoice_id: inv.id, description: "Tuition Fee", amount: Math.round(total * 0.6), fee_category_id: feeCategories.find(f => f.name === "Tuition")?.id || feeCategories[0].id },
            { invoice_id: inv.id, description: "Books & Materials", amount: Math.round(total * 0.15), fee_category_id: feeCategories.find(f => f.name === "Books & Materials")?.id || feeCategories[1]?.id || feeCategories[0].id },
            { invoice_id: inv.id, description: "Exam Fee", amount: total - Math.round(total * 0.6) - Math.round(total * 0.15), fee_category_id: feeCategories.find(f => f.name === "Exam Fee")?.id || feeCategories[0].id },
          ];
        });
        for (let b = 0; b < iiInserts.length; b += 100) {
          await supabase.from("invoice_items").insert(iiInserts.slice(b, b + 100));
        }
      }

      // Payments
      const paymentInserts = [];
      const methods: Array<"cash" | "bank_transfer" | "pos" | "online"> = ["cash", "bank_transfer", "pos", "online"];
      if (invoices) {
        for (let i = 0; i < invoices.length; i++) {
          if (invoiceInserts[i].amount_paid > 0) {
            paymentInserts.push({
              school_id,
              student_id: invoiceInserts[i].student_id,
              amount: invoiceInserts[i].amount_paid,
              payment_method: methods[i % methods.length],
              reference_number: `PAY-${String(i + 1).padStart(5, "0")}`,
              recorded_by: userId,
              payment_date: `2026-0${Math.min(i % 3 + 1, 3)}-${String((i % 28) + 1).padStart(2, "0")}`,
            });
          }
        }
      }
      const { data: payments } = await supabase.from("payments").insert(paymentInserts).select("id");
      paymentCount = payments?.length || 0;

      if (payments && invoices) {
        const allocInserts: Record<string, unknown>[] = [];
        let pIdx = 0;
        for (let i = 0; i < invoices.length; i++) {
          if (invoiceInserts[i].amount_paid > 0 && pIdx < payments.length) {
            allocInserts.push({ payment_id: payments[pIdx].id, invoice_id: invoices[i].id, amount: invoiceInserts[i].amount_paid });
            pIdx++;
          }
        }
        await supabase.from("payment_allocations").insert(allocInserts);
      }
    }

    // ===== PAYROLL RUN =====
    const { count: existingPayrollCount } = await supabase.from("payroll_runs")
      .select("id", { count: "exact", head: true }).eq("school_id", school_id);

    if ((existingPayrollCount || 0) === 0 && staffList.length) {
      const totalGross = staffList.reduce((sum, _, i) => {
        const sal = salaries[i % salaries.length];
        return sum + sal + Math.round(sal * 0.3);
      }, 0);
      const totalDeductions = Math.round(totalGross * 0.15);

      const { data: payrollRun } = await supabase.from("payroll_runs").insert({
        school_id,
        period_label: "February 2026",
        status: "approved",
        staff_count: staffList.length,
        total_gross: totalGross,
        total_deductions: totalDeductions,
        total_net: totalGross - totalDeductions,
        created_by: userId,
        approved_by: userId,
        approved_at: new Date().toISOString(),
      }).select("id").single();

      if (payrollRun) {
        const priInserts = staffList.map((s, i) => {
          const sal = salaries[i % salaries.length];
          const allowances = Math.round(sal * 0.3);
          const deductions = Math.round((sal + allowances) * 0.15);
          return { payroll_run_id: payrollRun.id, staff_id: s.id, basic: sal, allowances, deductions, net_pay: sal + allowances - deductions };
        });
        await supabase.from("payroll_run_items").insert(priInserts);
      }
    }

    // ===== ANNOUNCEMENTS =====
    const { count: existingAnnouncementCount } = await supabase.from("school_announcements")
      .select("id", { count: "exact", head: true }).eq("org_id", org_id);

    if ((existingAnnouncementCount || 0) === 0) {
      await supabase.from("school_announcements").insert([
        {
          org_id, school_id,
          title: "Welcome Back to Term 2!",
          body: "We are excited to welcome all students back for the second term. Please ensure all outstanding fees are paid before the end of the first week.",
          audience: "all", channels: ["in_app"], status: "sent", sent_by: userId, sent_at: "2026-01-13T09:00:00Z",
        },
        {
          org_id, school_id,
          title: "Inter-House Sports Competition",
          body: "The annual Inter-House Sports Competition will hold on March 28th, 2026. All students are required to participate. House captains should register their teams with the Sports Department.",
          audience: "students", channels: ["in_app", "email"], status: "sent", sent_by: userId, sent_at: "2026-03-01T10:00:00Z",
        },
        {
          org_id, school_id,
          title: "PTA Meeting Notice",
          body: "The Parent-Teacher Association meeting is scheduled for March 22nd at 10:00 AM in the school hall. All parents and guardians are encouraged to attend.",
          audience: "parents", channels: ["in_app", "sms"], status: "sent", sent_by: userId, sent_at: "2026-03-10T08:00:00Z",
        },
        {
          org_id, school_id,
          title: "Staff Professional Development Day",
          body: "All teaching staff are required to attend the professional development workshop on March 15th. The workshop will cover new curriculum updates and teaching methodologies.",
          audience: "staff", channels: ["in_app"], status: "draft", sent_by: userId,
        },
      ]);
    }

    // ===== APPROVAL REQUESTS =====
    const { count: existingApprovalCount } = await supabase.from("approval_requests")
      .select("id", { count: "exact", head: true }).eq("org_id", org_id);

    if ((existingApprovalCount || 0) === 0) {
      await supabase.from("approval_requests").insert([
        { org_id, type: "fee_waiver", description: "Fee waiver request for Chinedu Okafor - hardship case", amount: 5000000, status: "pending", requested_by: userId },
        { org_id, type: "payroll_run", description: "March 2026 payroll run approval", amount: 450000000, status: "pending", requested_by: userId },
        { org_id, type: "discount", description: "Sibling discount for Adaeze Nwosu (20%)", amount: 3000000, status: "approved", requested_by: userId, reviewed_by: userId, reviewed_at: new Date().toISOString(), review_notes: "Approved - sibling discount policy applies" },
      ]);
    }

    // ===== CLASS TEACHERS =====
    // Without these a teacher signs in to an empty app: every teacher-scoped
    // policy resolves to nothing until they are attached to a class.
    if (staffList.length && classes.length) {
      const teacherLinks = classes.map((c, i) => ({
        class_id: c.id,
        staff_id: staffList[i % staffList.length].id,
        is_form_teacher: true,
      }));
      await supabase.from("class_teachers").insert(teacherLinks);
    }

    // ===== TRANSPORT =====
    // Two routes with real Lagos-shaped stop names, and about a fifth of the
    // school riding — including one negotiated fare, so the override is visible.
    let riderCount = 0;
    const { data: routes } = await supabase.from("transport_routes").insert([
      {
        school_id, name: "Ikoyi – Obalende", fee_per_term: 4500000,
        driver_name: "Musa Bello", driver_phone: "+234 803 555 0111",
        vehicle_registration: "LAG-482-KJA", capacity: 18,
      },
      {
        school_id, name: "Yaba – Surulere", fee_per_term: 3800000,
        driver_name: "Emeka Obi", driver_phone: "+234 802 555 0143",
        vehicle_registration: "LAG-119-EPE", capacity: 14,
      },
    ]).select("id, fee_per_term");

    if (routes?.length) {
      await supabase.from("transport_stops").insert([
        { route_id: routes[0].id, name: "Awolowo Road", stop_order: 1, pickup_time: "06:40", dropoff_time: "15:30" },
        { route_id: routes[0].id, name: "Falomo Roundabout", stop_order: 2, pickup_time: "06:55", dropoff_time: "15:15" },
        { route_id: routes[0].id, name: "Obalende Bus Stop", stop_order: 3, pickup_time: "07:10", dropoff_time: "15:00" },
        { route_id: routes[1].id, name: "Herbert Macaulay Way", stop_order: 1, pickup_time: "06:30", dropoff_time: "15:40" },
        { route_id: routes[1].id, name: "Ojuelaba Junction", stop_order: 2, pickup_time: "06:50", dropoff_time: "15:20" },
      ]);

      const riders = students.slice(0, 12).map((st, i) => ({
        student_id: st.id,
        route_id: routes[i % routes.length].id,
        academic_period_id: currentPeriod?.id ?? null,
        // One sibling on a reduced fare, so the override shows on the invoice.
        fee_override: i === 0 ? 3000000 : null,
      }));
      const { data: seededRiders } = await supabase.from("student_transport").insert(riders).select("id");
      riderCount = seededRiders?.length ?? 0;
    }

    // ===== NOTICES =====
    // One live, one scheduled and one draft, so all three states are visible.
    const today = new Date();
    const inTwoWeeks = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
    await supabase.from("school_notices").insert([
      {
        school_id, title: "Second term resumes 6 January",
        body: "Boarders return on the 5th. Fees are due before resumption.",
        is_published: true, display_order: 0,
      },
      {
        school_id, title: "Admissions open for the 2027/2028 session",
        body: "Application forms are available online. Entrance assessment holds in March.",
        is_published: true, display_order: 1,
      },
      {
        school_id, title: "Inter-house sports — date to be confirmed",
        body: "Draft notice, not yet published.",
        is_published: false, starts_on: inTwoWeeks, display_order: 2,
      },
    ]);

    // ===== EVENTS =====
    const day = (offset: number) => new Date(today.getTime() + offset * 86400000).toISOString();
    await supabase.from("school_events").insert([
      { org_id, school_id, title: "PTA meeting", description: "Termly parents and teachers meeting.", location: "School hall", starts_at: day(7), ends_at: day(7), audience: "parents", created_by: userId },
      { org_id, school_id, title: "Mid-term break", starts_at: day(21), ends_at: day(25), all_day: true, audience: "all", created_by: userId },
      { org_id, school_id, title: "Staff briefing", location: "Staff room", starts_at: day(2), ends_at: day(2), audience: "staff", created_by: userId },
      { org_id, school_id, title: "Inter-house sports", location: "Main field", starts_at: day(35), ends_at: day(35), all_day: true, audience: "all", created_by: userId },
    ]);

    // ===== ADMISSIONS =====
    // A funnel with something at every stage, so the counts across the top of
    // /admissions are not all zero on a demo.
    await supabase.from("schools").update({
      admissions_open: true,
      admissions_intro: "Admissions are open for the 2027/2028 session, from Nursery through to SS3. Entrance assessment holds in March.",
    }).eq("id", school_id);

    const applicantNames: [string, string, string, string][] = [
      ["Zainab", "Bello", "Alhaja Fatima Bello", "new"],
      ["Tobi", "Adeyemi", "Mr Kunle Adeyemi", "new"],
      ["Chiamaka", "Eze", "Mrs Ngozi Eze", "reviewing"],
      ["Daniel", "Okonkwo", "Chief Emeka Okonkwo", "interview"],
      ["Aisha", "Yusuf", "Dr Halima Yusuf", "offered"],
      ["Segun", "Balogun", "Mr Tunde Balogun", "accepted"],
      ["Ifeoma", "Nwachukwu", "Mrs Chioma Nwachukwu", "rejected"],
    ];
    const sections = ["nursery", "primary", "primary", "secondary", "secondary", "primary", "nursery"];
    await supabase.from("applications").insert(
      applicantNames.map(([first, last, guardian, status], i) => ({
        school_id,
        applicant_first_name: first,
        applicant_last_name: last,
        guardian_name: guardian,
        guardian_phone: `+234 80${i} 555 01${String(i).padStart(2, "0")}`,
        guardian_email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
        section: sections[i],
        status,
        previous_school: i % 3 === 0 ? "Little Angels Nursery" : null,
        source: ["A friend or family member", "Facebook or Instagram", "Walked or drove past"][i % 3],
        // Spread arrivals over the last fortnight so the "waiting" column varies
        // and the stale flag has something to show.
        created_at: new Date(today.getTime() - (i * 3 + 1) * 86400000).toISOString(),
      }))
    );

    // ===== AUDIT LOG =====
    await supabase.from("audit_logs").insert([
      { org_id, action: "seed", entity_type: "system", detail: "Seeded comprehensive demo data for all features", user_id: userId },
    ]);

    return new Response(JSON.stringify({
      success: true,
      counts: {
        students: students.length,
        staff: staffList.length,
        subjects: subjectsList.length,
        invoices: invoiceCount,
        payments: paymentCount,
        riders: riderCount,
        applications: 7,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Seed error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Seeding failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
