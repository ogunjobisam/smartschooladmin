import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Unauthorized", 401);
    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const { data: { user } } = await createClient(supabaseUrl, anonKey).auth.getUser(token);
    if (!user) return jsonError("Unauthorized", 401);

    const { fee_schedule_id, school_id, due_date, include_transport } = await req.json();
    if (!fee_schedule_id || !school_id) throw new Error("fee_schedule_id and school_id required");

    // Tenant isolation: everything below runs with the service role key and so
    // bypasses RLS. Prove the caller holds a billing role in the org that owns
    // this school before writing anything into it.
    const BILLING_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar", "finance_officer"];
    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role, org_id")
      .eq("user_id", user.id)
      .in("role", BILLING_ROLES)
      .limit(1)
      .maybeSingle();
    if (!callerRole) return jsonError("Forbidden — you do not have permission to generate invoices", 403);

    const { data: targetSchool } = await supabase
      .from("schools")
      .select("id, org_id")
      .eq("id", school_id)
      .eq("org_id", callerRole.org_id)
      .maybeSingle();
    if (!targetSchool) return jsonError("Forbidden — school does not belong to your organisation", 403);

    // 1. Get fee schedule with class & period info — must belong to the same school
    const { data: schedule, error: schedErr } = await supabase
      .from("fee_schedules")
      .select("id, name, total_amount, class_id, academic_period_id")
      .eq("id", fee_schedule_id)
      .eq("school_id", school_id)
      .single();
    if (schedErr || !schedule) throw new Error("Fee schedule not found");

    // 2. Get students enrolled in the class for the period (or all active students if no class)
    let studentIds: string[] = [];

    if (schedule.class_id && schedule.academic_period_id) {
      // Students enrolled in this class for this period
      const { data: enrolments } = await supabase
        .from("enrolments")
        .select("student_id")
        .eq("class_id", schedule.class_id)
        .eq("academic_period_id", schedule.academic_period_id);
      studentIds = (enrolments || []).map((e) => e.student_id);
    } else if (schedule.class_id) {
      // Students enrolled in this class (any period)
      const { data: enrolments } = await supabase
        .from("enrolments")
        .select("student_id")
        .eq("class_id", schedule.class_id);
      studentIds = [...new Set((enrolments || []).map((e) => e.student_id))];
    } else {
      // All active students in the school
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", school_id)
        .eq("status", "active");
      studentIds = (students || []).map((s) => s.id);
    }

    if (studentIds.length === 0) {
      return new Response(JSON.stringify({ success: true, created: 0, skipped: 0, message: "No students found for this class/period." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Check for existing invoices to avoid duplicates
    const { data: existingInvoices } = await supabase
      .from("invoices")
      .select("student_id")
      .eq("school_id", school_id)
      .eq("academic_period_id", schedule.academic_period_id || "")
      .in("student_id", studentIds);

    const existingStudentIds = new Set((existingInvoices || []).map((i) => i.student_id));
    const newStudentIds = studentIds.filter((id) => !existingStudentIds.has(id));

    if (newStudentIds.length === 0) {
      return new Response(JSON.stringify({ success: true, created: 0, skipped: studentIds.length, message: "All students already have invoices for this period." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3b. Transport, when the bursar asked for it on this run.
    //
    // A route carries a per-term fee and a rider may have a negotiated one, and
    // until now nothing ever charged either — the fee was recorded and then
    // ignored. Riders are matched on the period being invoiced; an assignment
    // with no period is treated as standing, so a school that has not set a
    // current term still bills correctly.
    const transportByStudent = new Map<string, { amount: number; route: string }>();
    let transportCategoryId: string | null = null;

    if (include_transport) {
      let riderQuery = supabase
        .from("student_transport")
        .select("student_id, fee_override, academic_period_id, transport_routes(name, fee_per_term)")
        .in("student_id", newStudentIds);
      if (schedule.academic_period_id) {
        riderQuery = riderQuery.or(
          `academic_period_id.eq.${schedule.academic_period_id},academic_period_id.is.null`
        );
      }
      const { data: riders, error: riderErr } = await riderQuery;
      if (riderErr) throw riderErr;

      for (const rider of riders || []) {
        const route = rider.transport_routes as { name: string; fee_per_term: number } | null;
        if (!route) continue;
        const amount = rider.fee_override ?? route.fee_per_term ?? 0;
        // A zero fee is a free ride, not a line worth printing.
        if (amount <= 0) continue;
        transportByStudent.set(rider.student_id, { amount, route: route.name });
      }

      if (transportByStudent.size > 0) {
        // One shared category per organisation, created on first use so a
        // school never has to set one up before transport can be billed.
        const { data: existing } = await supabase
          .from("fee_categories")
          .select("id")
          .eq("org_id", targetSchool.org_id)
          .ilike("name", "transport")
          .limit(1)
          .maybeSingle();

        if (existing) {
          transportCategoryId = existing.id;
        } else {
          const { data: created } = await supabase
            .from("fee_categories")
            .insert({ org_id: targetSchool.org_id, name: "Transport", description: "School bus fees" })
            .select("id")
            .single();
          transportCategoryId = created?.id ?? null;
        }
      }
    }

    // 4. Get next invoice number
    const { data: lastInvoice } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNum = 1;
    if (lastInvoice?.invoice_number) {
      const match = lastInvoice.invoice_number.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    // 5. Create invoices in batches
    const invoiceInserts = newStudentIds.map((studentId, i) => ({
      school_id,
      student_id: studentId,
      invoice_number: `INV-${String(nextNum + i).padStart(5, "0")}`,
      total_amount: schedule.total_amount + (transportByStudent.get(studentId)?.amount ?? 0),
      amount_paid: 0,
      status: "pending" as const,
      academic_period_id: schedule.academic_period_id || null,
      due_date: due_date || null,
      created_by: user.id,
    }));

    const { data: createdInvoices, error: invErr } = await supabase
      .from("invoices")
      .insert(invoiceInserts)
      .select("id, student_id");
    if (invErr) throw invErr;

    // 6. Create invoice items based on fee schedule name
    if (createdInvoices) {
      const itemInserts: Record<string, unknown>[] = [];
      for (const inv of createdInvoices) {
        itemInserts.push({
          invoice_id: inv.id,
          description: schedule.name,
          amount: schedule.total_amount,
        });

        // A separate line, so a parent can see what the bus costs rather than
        // finding the term's fee mysteriously larger than the published one.
        const transport = transportByStudent.get(inv.student_id);
        if (transport) {
          itemInserts.push({
            invoice_id: inv.id,
            description: `Transport — ${transport.route}`,
            amount: transport.amount,
            fee_category_id: transportCategoryId,
          });
        }
      }

      // Insert in batches of 100
      for (let b = 0; b < itemInserts.length; b += 100) {
        await supabase.from("invoice_items").insert(itemInserts.slice(b, b + 100));
      }
    }

    // 7. Create audit log entry
    await supabase.from("audit_logs").insert({
      org_id: targetSchool.org_id,
      action: "bulk_create",
      entity_type: "invoice",
      detail:
        `Generated ${createdInvoices?.length} invoices from fee schedule "${schedule.name}"` +
        (transportByStudent.size > 0 ? `, including transport for ${transportByStudent.size} rider(s)` : ""),
      user_id: user.id,
    });

    return new Response(JSON.stringify({
      success: true,
      created: createdInvoices?.length || 0,
      skipped: existingStudentIds.size,
      total_amount: (createdInvoices?.length || 0) * schedule.total_amount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Bulk invoice error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
