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

    // Verify the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const { data: { user } } = await createClient(supabaseUrl, anonKey).auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    // Onboarding runs once per user. Re-running it (a double submit, a stale tab)
    // would otherwise leave orphaned organisations behind.
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (existingRole?.org_id) throw new Error("This account already belongs to an organisation");

    const { orgName, country, currency, schoolName, campusName, academicYear, terms, classes: customClasses } = await req.json();
    if (!orgName || !schoolName) throw new Error("orgName and schoolName required");

    // 1. Create organisation
    const { data: org, error: orgErr } = await supabase
      .from("organisation_groups")
      .insert({ name: orgName, country: country || "NG", currency: currency || "NGN", created_by: user.id })
      .select("id")
      .single();
    if (orgErr) throw orgErr;

    // 2. Assign proprietor role
    const { error: roleErr } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role: "proprietor", org_id: org.id });
    if (roleErr) throw roleErr;

    // 3. Create school
    const { data: school, error: schoolErr } = await supabase
      .from("schools")
      .insert({ org_id: org.id, name: schoolName })
      .select("id")
      .single();
    if (schoolErr) throw schoolErr;

    // 4. Update user_roles with school_id
    await supabase
      .from("user_roles")
      .update({ school_id: school.id })
      .eq("user_id", user.id)
      .eq("org_id", org.id);

    // 5. Create campus
    await supabase.from("campuses").insert({ school_id: school.id, name: campusName || "Main Campus" });

    // 6. Create academic year
    const { data: ay, error: ayErr } = await supabase
      .from("academic_years")
      .insert({
        org_id: org.id,
        name: academicYear || "2025/2026",
        start_date: "2025-09-01",
        end_date: "2026-07-31",
        is_current: true,
      })
      .select("id")
      .single();
    if (ayErr) throw ayErr;

    // 7. Create terms/periods
    const termNames = terms?.length ? terms : ["Term 1", "Term 2", "Term 3"];
    const periodDates = [
      { start: "2025-09-01", end: "2025-12-15" },
      { start: "2026-01-10", end: "2026-04-10" },
      { start: "2026-04-25", end: "2026-07-20" },
    ];
    for (let i = 0; i < termNames.length; i++) {
      await supabase.from("academic_periods").insert({
        academic_year_id: ay.id,
        name: termNames[i],
        start_date: periodDates[i]?.start || "2026-01-01",
        end_date: periodDates[i]?.end || "2026-12-31",
        is_current: i === 1,
      });
    }

    // 8. Create classes — use custom classes if provided, otherwise default Nigerian classes
    const classNames = (customClasses && customClasses.length > 0)
      ? customClasses
      : ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];
    for (let i = 0; i < classNames.length; i++) {
      await supabase.from("classes").insert({ school_id: school.id, name: classNames[i], level_order: i + 1 });
    }

    // 9. Create default fee categories
    const defaultFees = ["Tuition", "Books & Materials", "Transport", "Feeding", "Exam Fee", "Uniform", "Boarding"];
    for (const name of defaultFees) {
      await supabase.from("fee_categories").insert({ org_id: org.id, name });
    }

    return new Response(JSON.stringify({
      success: true,
      org_id: org.id,
      school_id: school.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Setup error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Setup failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
