import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Public admissions intake.
 *
 * A prospective parent is not signed in, so this runs with the service role and
 * is the only writer of `public.applications`. There is no `anon` policy on that
 * table on purpose: everything a stranger can do to it has to pass through the
 * validation below.
 *
 * Two actions:
 *   school — resolve a school's public admissions slug to the little it should
 *            publish (name, branding, intro, the sections it admits into).
 *   apply  — accept an application, and tell the school office about it.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SECTIONS = ["toddler", "nursery", "primary", "secondary"];

/** Trim, collapse whitespace, and cap length so one field cannot carry an essay. */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** A date the applicant could plausibly have been born on. */
function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const year = Number(value.slice(0, 4));
  const thisYear = new Date().getFullYear();
  if (year < thisYear - 30 || year > thisYear) return null;
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Admissions is not configured on this deployment." }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Expected a JSON body." }, 400);
  }

  const slug = clean(payload.slug, 120);
  if (!slug) return jsonResponse({ error: "Which school? No admissions link was given." }, 400);

  const { data: school, error: schoolError } = await admin
    .from("schools")
    .select("id, org_id, name, tagline, logo_url, primary_color, address, email, phone, admissions_open, admissions_intro")
    .eq("admissions_slug", slug)
    .maybeSingle();

  if (schoolError) {
    console.error("Admissions lookup failed:", schoolError.message);
    return jsonResponse({ error: "Could not look up that school." }, 500);
  }
  if (!school) return jsonResponse({ error: "No school is accepting applications at that address." }, 404);

  const action = payload.action;

  // ---------------------------------------------------------------------------
  // school: what the public page may show
  // ---------------------------------------------------------------------------
  if (action === "school") {
    const { data: classes } = await admin
      .from("classes")
      .select("section")
      .eq("school_id", school.id);

    const sections = SECTIONS.filter((s) => (classes || []).some((c) => c.section === s));

    // Published notices inside their date window. Filtered here rather than in
    // the browser so an unpublished draft never reaches a stranger's machine.
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: notices } = await admin
      .from("school_notices")
      .select("id, title, body, starts_on, ends_on")
      .eq("school_id", school.id)
      .eq("is_published", true)
      .or(`starts_on.is.null,starts_on.lte.${todayIso}`)
      .or(`ends_on.is.null,ends_on.gte.${todayIso}`)
      .order("display_order");

    return jsonResponse({
      school: {
        name: school.name,
        tagline: school.tagline,
        logo_url: school.logo_url,
        primary_color: school.primary_color,
        address: school.address,
        email: school.email,
        phone: school.phone,
        intro: school.admissions_intro,
        admissions_open: school.admissions_open,
        // A school with no classes set up yet still gets the full list, or the
        // form would offer nothing to apply into.
        sections: sections.length > 0 ? sections : SECTIONS,
      },
      notices: notices || [],
    });
  }

  // ---------------------------------------------------------------------------
  // apply: accept an application
  // ---------------------------------------------------------------------------
  if (action === "apply") {
    if (!school.admissions_open) {
      return jsonResponse({ error: "This school is not accepting applications at the moment." }, 403);
    }

    const firstName = clean(payload.applicant_first_name, 100);
    const lastName = clean(payload.applicant_last_name, 100);
    const guardianName = clean(payload.guardian_name, 200);
    const guardianPhone = clean(payload.guardian_phone, 40);

    if (!firstName || !lastName) return jsonResponse({ error: "The applicant's first and last name are required." }, 400);
    if (!guardianName) return jsonResponse({ error: "A parent or guardian name is required." }, 400);
    if (!guardianPhone) return jsonResponse({ error: "A phone number is required so the school can reach you." }, 400);

    const guardianEmail = clean(payload.guardian_email, 255);
    if (guardianEmail && !isEmail(guardianEmail)) {
      return jsonResponse({ error: "That email address does not look right." }, 400);
    }

    const rawSection = clean(payload.section, 20);
    const section = rawSection && SECTIONS.includes(rawSection) ? rawSection : null;

    // Two applications for the same child within the hour is a double-tap on the
    // submit button, not two children.
    // `maybeSingle` would raise once a third attempt matched two existing rows,
    // and the raise used to be swallowed — so the duplicate it was meant to stop
    // got inserted anyway. Take the newest match instead.
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await admin
      .from("applications")
      .select("reference")
      .eq("school_id", school.id)
      .eq("applicant_first_name", firstName)
      .eq("applicant_last_name", lastName)
      .eq("guardian_phone", guardianPhone)
      .gte("created_at", anHourAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentError) {
      console.error("Duplicate check failed:", recentError.message);
      return jsonResponse({ error: "Could not record your application. Please try again." }, 500);
    }

    if (recent && recent.length > 0) {
      return jsonResponse({ reference: recent[0].reference, duplicate: true });
    }

    const { data: application, error: insertError } = await admin
      .from("applications")
      .insert({
        school_id: school.id,
        applicant_first_name: firstName,
        applicant_last_name: lastName,
        date_of_birth: cleanDate(payload.date_of_birth),
        gender: clean(payload.gender, 20),
        section,
        previous_school: clean(payload.previous_school, 200),
        guardian_name: guardianName,
        guardian_email: guardianEmail,
        guardian_phone: guardianPhone,
        guardian_address: clean(payload.guardian_address, 500),
        source: clean(payload.source, 100),
        message: clean(payload.message, 2000),
      })
      .select("reference")
      .single();

    if (insertError) {
      console.error("Could not record application:", insertError.message);
      return jsonResponse({ error: "Could not record your application. Please try again." }, 500);
    }

    const messages: Record<string, unknown>[] = [];

    if (school.email) {
      messages.push({
        org_id: school.org_id,
        channel: "email",
        recipient: school.email,
        subject: `New application: ${firstName} ${lastName} (${application.reference})`,
        body:
          `A new application has come in through your admissions page.\n\n` +
          `Reference: ${application.reference}\n` +
          `Applicant: ${firstName} ${lastName}\n` +
          `Section: ${section ?? "not stated"}\n` +
          `Parent/guardian: ${guardianName}\n` +
          `Phone: ${guardianPhone}\n` +
          (guardianEmail ? `Email: ${guardianEmail}\n` : "") +
          `\nOpen Admissions in ${school.name} to review it.`,
      });
    }

    if (guardianEmail) {
      messages.push({
        org_id: school.org_id,
        channel: "email",
        recipient: guardianEmail,
        subject: `We have your application for ${firstName} (${application.reference})`,
        body:
          `Dear ${guardianName},\n\n` +
          `Thank you for applying to ${school.name}. We have your application for ` +
          `${firstName} ${lastName}.\n\n` +
          `Your reference is ${application.reference}. Please quote it when you contact us.\n\n` +
          `We will be in touch about the next steps.\n\n` +
          `${school.name}` +
          (school.phone ? `\n${school.phone}` : ""),
      });
    }

    if (messages.length > 0) {
      // A queue failure must not lose the application — it is already saved.
      const { error: queueError } = await admin.from("outbound_message_queue").insert(messages);
      if (queueError) console.error("Could not queue admissions email:", queueError.message);
    }

    return jsonResponse({ reference: application.reference });
  }

  return jsonResponse({ error: "Unknown action." }, 400);
});
