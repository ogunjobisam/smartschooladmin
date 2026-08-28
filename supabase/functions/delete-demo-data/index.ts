import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Verify role
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role, org_id")
      .eq("user_id", userId)
      .in("role", ["proprietor", "super_admin"])
      .limit(1)
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden — admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    if (roleData.org_id !== org_id) {
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

    // 7-8. Org-level tables
    await del("approval_requests", { org_id });
    await del("audit_logs", { org_id });

    // 9-10. student child tables (via students)
    await delVia("student_guardians", "student_id", "students", { school_id });
    await delVia("enrolments", "student_id", "students", { school_id });

    // 11. students
    await del("students", { school_id });

    // 12. guardians (org-level)
    await del("guardians", { org_id });

    // 13-15. staff child tables (via staff)
    await delVia("staff_bank_details", "staff_id", "staff", { school_id });
    await delVia("payroll_profiles", "staff_id", "staff", { school_id });
    await delVia("staff_positions", "staff_id", "staff", { school_id });

    // 16. staff
    await del("staff", { school_id });

    // 17. fee_schedules
    await del("fee_schedules", { school_id });

    const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

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
