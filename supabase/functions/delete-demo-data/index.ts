import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { administers, fetchCallerRoles } from "../_shared/caller-roles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Service role client for bulk deletes (bypasses RLS)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { school_id, org_id } = await req.json();
    if (!school_id || !org_id) {
      return new Response(JSON.stringify({ error: "school_id and org_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tenant isolation: this deletes with the service role key, which bypasses RLS,
    // so the target org/school MUST be proven to belong to the caller before any
    // delete runs. Without this an admin of one school could wipe another's data.
    //
    // Asked of every role row the caller holds rather than of one arbitrary
    // row. The old shape compared a randomly-chosen row's org_id, which denied
    // a multi-org proprietor their own group on some requests and not others,
    // and denied a super_admin always, since their row carries a NULL org_id.
    const roleData = administers(await fetchCallerRoles(admin, userId), {
      allowed: ["proprietor", "super_admin"],
      orgId: org_id,
      schoolId: school_id,
    });
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden — organisation does not belong to you" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: school } = await admin
      .from("schools")
      .select("id")
      .eq("id", school_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (!school) {
      return new Response(JSON.stringify({ error: "Forbidden — school does not belong to your organisation" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const counts: Record<string, number> = {};

    // Helper: delete and count
    const del = async (table: string, filter: Record<string, string>) => {
      const query = admin.from(table).delete().match(filter).select("id");
      const { data, error } = await query;
      if (error) console.error(`Error deleting ${table}:`, error.message);
      counts[table] = data?.length ?? 0;
    };

    // Helper: delete via subquery (for junction tables)
    const delVia = async (table: string, fkCol: string, parentTable: string, parentFilter: Record<string, string>) => {
      const { data: parentIds } = await admin.from(parentTable).select("id").match(parentFilter);
      if (!parentIds || parentIds.length === 0) { counts[table] = 0; return; }
      const ids = parentIds.map((r: { id: string }) => r.id);
      const { data, error } = await admin.from(table).delete().in(fkCol, ids).select("id");
      if (error) console.error(`Error deleting ${table}:`, error.message);
      counts[table] = data?.length ?? 0;
    };

    // Gathered before anything is deleted: the approvals and guardians that
    // belong to this school are found through rows the steps below remove.
    const idsOf = async (table: string) => {
      const { data } = await admin.from(table).select("id").eq("school_id", school_id);
      return (data ?? []).map((r: { id: string }) => r.id);
    };
    const schoolRecordIds = [...(await idsOf("invoices")), ...(await idsOf("payroll_runs"))];
    const schoolStudentIds = await idsOf("students");
    let schoolGuardianIds: string[] = [];
    if (schoolStudentIds.length > 0) {
      const { data: links } = await admin
        .from("student_guardians").select("guardian_id").in("student_id", schoolStudentIds);
      schoolGuardianIds = [...new Set((links ?? []).map((l: { guardian_id: string }) => l.guardian_id))];
    }

    // 1. payment_allocations (via payments)
    await delVia("payment_allocations", "payment_id", "payments", { school_id });

    // 2. invoice_items (via invoices)
    await delVia("invoice_items", "invoice_id", "invoices", { school_id });

    // 3. payroll_run_items (via payroll_runs)
    await delVia("payroll_run_items", "payroll_run_id", "payroll_runs", { school_id });

    // 4-6. Direct school_id tables
    await del("payroll_runs", { school_id });
    await del("payments", { school_id });
    await del("invoices", { school_id });

    // 7. Org-level tables
    //
    // audit_logs is deliberately left alone. It used to be wiped here, for the
    // whole organisation, which meant the one action that erases a school's
    // records also erased the record of who did it — and of every earlier role
    // change and retry. The wipe is logged below instead.
    //
    // approval_requests and guardians belong to the organisation, not a
    // school, and both used to be deleted for the whole organisation — so
    // clearing one school of a group wiped every other school's guardians and
    // pending approvals. Only this school's go now.
    if (schoolRecordIds.length > 0) {
      const { data, error } = await admin
        .from("approval_requests").delete().eq("org_id", org_id).in("reference_id", schoolRecordIds).select("id");
      if (error) console.error("Error deleting approval_requests:", error.message);
      counts["approval_requests"] = data?.length ?? 0;
    } else {
      counts["approval_requests"] = 0;
    }

    // 9-10. student child tables (via students)
    await delVia("student_guardians", "student_id", "students", { school_id });
    await delVia("enrolments", "student_id", "students", { school_id });

    // 11. students
    await del("students", { school_id });

    // 12. guardians: those of this school's pupils who have no child left at
    // another school in the group.
    counts["guardians"] = 0;
    if (schoolGuardianIds.length > 0) {
      const { data: stillLinked } = await admin
        .from("student_guardians").select("guardian_id").in("guardian_id", schoolGuardianIds);
      const keep = new Set((stillLinked ?? []).map((l: { guardian_id: string }) => l.guardian_id));
      const orphaned = schoolGuardianIds.filter((id) => !keep.has(id));
      if (orphaned.length > 0) {
        const { data, error } = await admin
          .from("guardians").delete().eq("org_id", org_id).in("id", orphaned).select("id");
        if (error) console.error("Error deleting guardians:", error.message);
        counts["guardians"] = data?.length ?? 0;
      }
    }

    // 13-15. staff child tables (via staff)
    await delVia("staff_bank_details", "staff_id", "staff", { school_id });
    await delVia("payroll_profiles", "staff_id", "staff", { school_id });
    await delVia("staff_positions", "staff_id", "staff", { school_id });

    // 16. staff
    await del("staff", { school_id });

    // 17. fee_schedules
    await del("fee_schedules", { school_id });

    // Admissions, transport, notices, events and teacher assignments.
    //
    // Deleting students already cascades their attendance, scores, guardian
    // links, enrolments and bus assignments; these are the school-scoped rows
    // that survive it, and a demo that cannot be reset cleanly is worse than no
    // demo at all.
    await del("applications", { school_id });
    // Clears the numbering too, so a fresh demo starts again at APP-<year>-00001.
    // Not via del(): that helper returns `id`, and this table is keyed on
    // (school_id, year) with no id column.
    {
      const { data, error } = await admin
        .from("application_counters")
        .delete()
        .eq("school_id", school_id)
        .select("school_id");
      if (error) console.error("Error deleting application_counters:", error.message);
      counts["application_counters"] = data?.length ?? 0;
    }
    await del("school_notices", { school_id });
    await del("school_events", { school_id });
    // Cascades transport_stops and any remaining student_transport rows.
    await del("transport_routes", { school_id });
    await delVia("class_teachers", "class_id", "classes", { school_id });

    const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

    const { error: auditError } = await admin.from("audit_logs").insert({
      org_id,
      user_id: userId,
      action: "school_data_deleted",
      entity_type: "school",
      entity_id: school_id,
      detail: `Deleted all data for the school: ${totalDeleted} records`,
      new_values: counts,
    });
    if (auditError) console.error("Could not write the audit log for the deletion:", auditError.message);

    return new Response(
      JSON.stringify({ success: true, total_deleted: totalDeleted, counts }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-demo-data error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
