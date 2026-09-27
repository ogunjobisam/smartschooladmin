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

    // Onboarding runs once per user. Re-running it (a double submit, a stale
    // tab, or a first attempt that appeared to fail) would otherwise leave
    // orphaned organisations behind.
    //
    // This checks for *any* role row, not just one carrying an org_id, and it
    // counts every row rather than reading an arbitrary one. The old version
    // did both: `.limit(1).maybeSingle()` with no order picked whichever row
    // Postgres reached first, so an account holding a role row with a null
    // org_id sailed past the guard and built a second organisation — which is
    // unreachable, because the interface has a school switcher and no
    // organisation switcher.
    const { data: existingRoles, error: existingErr } = await supabase
      .from("user_roles")
      .select("id, org_id")
      .eq("user_id", user.id);
    if (existingErr) throw existingErr;

    if (existingRoles && existingRoles.length > 0) {
      const withOrg = existingRoles.find((r) => r.org_id);
      if (withOrg) throw new Error("This account already belongs to an organisation");
      // A role row with no organisation behind it. Creating a second
      // organisation would strand this one; it needs repairing instead.
      throw new Error(
        "This account already has a role, but it is not attached to an organisation. " +
        "Ask an administrator to reissue your access rather than setting up again."
      );
    }

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

    // 3. Create school. Brand colours are deliberately left to the column
    // defaults (navy and gold — see the migration that sets them) so there is
    // one place to change them rather than a copy here to drift out of step.
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

    // 8. Create classes. The client sends { name, section }; plain strings are
    // still accepted so an older client keeps working.
    type ClassInput = string | { name: string; section?: string | null };
    const planned: ClassInput[] = (customClasses && customClasses.length > 0)
      ? customClasses
      : ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];

    const classRows = planned
      .map((entry, i) => {
        const name = typeof entry === "string" ? entry : entry?.name;
        if (!name) return null;
        return {
          school_id: school.id,
          name,
          section: typeof entry === "string" ? null : entry?.section ?? null,
          level_order: i + 1,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (classRows.length > 0) {
      const { error: classErr } = await supabase.from("classes").insert(classRows);
      if (classErr) throw classErr;
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
