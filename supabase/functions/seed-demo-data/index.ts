import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!).auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    const { org_id, school_id } = await req.json();
    if (!org_id || !school_id) throw new Error("org_id and school_id required");

    // Get classes for this school
    const { data: classes } = await supabase.from("classes").select("id, name").eq("school_id", school_id);
    if (!classes?.length) throw new Error("No classes found");

    // Get current academic period
    const { data: periods } = await supabase.from("academic_periods")
      .select("id, academic_year_id")
      .eq("is_current", true)
      .limit(1);
    const currentPeriod = periods?.[0];

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

    // Create 60 students across classes
    const studentInserts = [];
    for (let i = 0; i < 60; i++) {
      const classIdx = i % classes.length;
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

    const { data: students, error: studErr } = await supabase.from("students").insert(studentInserts).select("id");
    if (studErr) throw studErr;

    // Enrol students into classes
    if (currentPeriod) {
      const enrolInserts = students!.map((s, i) => ({
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

    // Link guardians to students (each guardian has ~2 students)
    if (guardians) {
      const sgInserts = students!.map((s, i) => ({
        student_id: s.id,
        guardian_id: guardians[Math.floor(i / 2) % guardians.length].id,
        relationship: i % 3 === 0 ? "father" : i % 3 === 1 ? "mother" : "guardian",
        is_primary: i % 2 === 0,
      }));
      await supabase.from("student_guardians").insert(sgInserts);
    }

    // Create 15 staff
    const staffTitles = ["Teacher", "Teacher", "Teacher", "Teacher", "Teacher",
      "Head Teacher", "Librarian", "Lab Technician", "Accountant", "Secretary",
      "Security", "Driver", "Cleaner", "IT Officer", "Counselor"];
    const staffDepts = ["Science", "Arts", "Commercial", "Science", "Arts",
      "Admin", "Library", "Science", "Finance", "Admin",
      "Operations", "Operations", "Operations", "ICT", "Student Affairs"];

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
    const { data: staffList } = await supabase.from("staff").insert(staffInserts).select("id");

    // Staff positions
    if (staffList) {
      const posInserts = staffList.map((s, i) => ({
        staff_id: s.id,
        title: staffTitles[i],
        department: staffDepts[i],
        is_current: true,
      }));
      await supabase.from("staff_positions").insert(posInserts);

      // Payroll profiles & bank details
      const salaries = [250000, 230000, 220000, 240000, 210000, 350000, 180000, 200000, 280000, 160000, 100000, 120000, 90000, 260000, 220000];
      const ppInserts = staffList.map((s, i) => ({
        staff_id: s.id,
        basic_salary: salaries[i] * 100, // kobo
        housing_allowance: Math.round(salaries[i] * 0.2) * 100,
        transport_allowance: Math.round(salaries[i] * 0.1) * 100,
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

    // Create invoices for students
    const invoiceInserts = [];
    const statuses: Array<"paid" | "pending" | "overdue" | "draft"> = ["paid", "paid", "pending", "overdue", "paid", "pending"];
    for (let i = 0; i < Math.min(40, students!.length); i++) {
      const status = statuses[i % statuses.length];
      const totalAmount = (150000 + Math.floor(Math.random() * 100000)) * 100; // kobo
      const amountPaid = status === "paid" ? totalAmount : status === "pending" ? Math.round(totalAmount * 0.3) : 0;

      invoiceInserts.push({
        school_id,
        student_id: students![i].id,
        invoice_number: `INV-${String(i + 1).padStart(5, "0")}`,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        status,
        academic_period_id: currentPeriod?.id || null,
        due_date: status === "overdue" ? "2025-12-15" : "2026-03-30",
        created_by: user.id,
      });
    }
    const { data: invoices } = await supabase.from("invoices").insert(invoiceInserts).select("id");

    // Invoice items
    if (invoices && feeCategories?.length) {
      const iiInserts = invoices.flatMap((inv, i) => {
        const items = [];
        const total = invoiceInserts[i].total_amount;
        items.push({
          invoice_id: inv.id,
          description: "Tuition Fee",
          amount: Math.round(total * 0.6),
          fee_category_id: feeCategories.find(f => f.name === "Tuition")?.id || feeCategories[0].id,
        });
        items.push({
          invoice_id: inv.id,
          description: "Books & Materials",
          amount: Math.round(total * 0.15),
          fee_category_id: feeCategories.find(f => f.name === "Books & Materials")?.id || feeCategories[1]?.id || feeCategories[0].id,
        });
        items.push({
          invoice_id: inv.id,
          description: "Exam Fee",
          amount: total - Math.round(total * 0.6) - Math.round(total * 0.15),
          fee_category_id: feeCategories.find(f => f.name === "Exam Fee")?.id || feeCategories[0].id,
        });
        return items;
      });
      // Insert in batches of 100
      for (let b = 0; b < iiInserts.length; b += 100) {
        await supabase.from("invoice_items").insert(iiInserts.slice(b, b + 100));
      }
    }

    // Create payments for paid/partial invoices
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
            recorded_by: user.id,
            payment_date: `2026-0${Math.min(i % 3 + 1, 3)}-${String((i % 28) + 1).padStart(2, "0")}`,
          });
        }
      }
    }
    const { data: payments } = await supabase.from("payments").insert(paymentInserts).select("id");

    // Payment allocations
    if (payments && invoices) {
      const allocInserts = [];
      let pIdx = 0;
      for (let i = 0; i < invoices.length; i++) {
        if (invoiceInserts[i].amount_paid > 0 && pIdx < payments.length) {
          allocInserts.push({
            payment_id: payments[pIdx].id,
            invoice_id: invoices[i].id,
            amount: invoiceInserts[i].amount_paid,
          });
          pIdx++;
        }
      }
      await supabase.from("payment_allocations").insert(allocInserts);
    }

    // Create a payroll run
    if (staffList) {
      const totalGross = staffList.reduce((sum, _, i) => {
        const sal = [250000, 230000, 220000, 240000, 210000, 350000, 180000, 200000, 280000, 160000, 100000, 120000, 90000, 260000, 220000][i] * 100;
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
        created_by: user.id,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      }).select("id").single();

      if (payrollRun) {
        const priInserts = staffList.map((s, i) => {
          const sal = [250000, 230000, 220000, 240000, 210000, 350000, 180000, 200000, 280000, 160000, 100000, 120000, 90000, 260000, 220000][i] * 100;
          const allowances = Math.round(sal * 0.3);
          const deductions = Math.round((sal + allowances) * 0.15);
          return {
            payroll_run_id: payrollRun.id,
            staff_id: s.id,
            basic: sal,
            allowances,
            deductions,
            net_pay: sal + allowances - deductions,
          };
        });
        await supabase.from("payroll_run_items").insert(priInserts);
      }
    }

    // Create some approval requests
    await supabase.from("approval_requests").insert([
      {
        org_id,
        type: "fee_waiver",
        description: "Fee waiver request for Chinedu Okafor - hardship case",
        amount: 5000000,
        status: "pending",
        requested_by: user.id,
      },
      {
        org_id,
        type: "payroll_run",
        description: "March 2026 payroll run approval",
        amount: 450000000,
        status: "pending",
        requested_by: user.id,
      },
      {
        org_id,
        type: "discount",
        description: "Sibling discount for Adaeze Nwosu (20%)",
        amount: 3000000,
        status: "approved",
        requested_by: user.id,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: "Approved - sibling discount policy applies",
      },
    ]);

    // Create audit log entries
    await supabase.from("audit_logs").insert([
      { org_id, action: "create", entity_type: "student", detail: "Created 60 students via seed data", user_id: user.id },
      { org_id, action: "create", entity_type: "invoice", detail: "Generated 40 invoices for Term 2", user_id: user.id },
      { org_id, action: "create", entity_type: "payment", detail: "Recorded bulk payments", user_id: user.id },
      { org_id, action: "approve", entity_type: "payroll_run", detail: "Approved February 2026 payroll", user_id: user.id },
      { org_id, action: "create", entity_type: "staff", detail: "Added 15 staff members", user_id: user.id },
    ]);

    return new Response(JSON.stringify({
      success: true,
      counts: { students: 60, guardians: 30, staff: 15, invoices: 40, payments: paymentInserts.length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Seed error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
