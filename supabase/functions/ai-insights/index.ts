import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.71.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "claude-opus-5";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type AnalysisType =
  | "academic_performance"
  | "report_card_comments"
  | "finance"
  | "staff";

const ANALYSIS_TYPES: AnalysisType[] = [
  "academic_performance",
  "report_card_comments",
  "finance",
  "staff",
];

/** Roles allowed to run each analysis, mirroring who can see the underlying data. */
const ANALYSIS_ROLES: Record<AnalysisType, string[]> = {
  academic_performance: ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "teacher"],
  report_card_comments: ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "teacher"],
  finance: ["super_admin", "proprietor", "group_admin", "school_admin", "bursar", "finance_officer"],
  staff: ["super_admin", "proprietor", "group_admin", "school_admin", "hr_admin", "bursar"],
};

const SYSTEM_PROMPT = `You are an analyst inside a school management system used by private schools, mainly in Nigeria.

You are given a factual summary of one school's own data. Write for a busy school leader or teacher who has minutes, not hours.

Rules you must follow:
- Ground every claim in the numbers you are given. Never invent a figure, a name, or a trend.
- When the data is thin, say so plainly instead of padding. "Only one term of results, so no trend yet" is a useful sentence.
- Be specific about who and what: name the student, subject, class or line item the point is about.
- Prefer actions a school can actually take this term over generic advice.
- Do not moralise, do not speculate about a child's home life, and do not diagnose. Stick to what attendance and scores show.
- Never recommend disciplinary or exclusionary action against a named child.
- Use British English and the currency symbol exactly as it appears in the data.

Format as short markdown: a one-paragraph summary, then a handful of bullet points under clear headings. No preamble, no sign-off.`;

const REPORT_CARD_SYSTEM = `You write end-of-term report card comments for a school.

You are given one student's subject results and attendance. Write a comment a class teacher could sign.

Rules:
- 40 to 70 words, addressed about the student in the third person.
- Name at least one genuine strength and one specific area to work on, both drawn from the data.
- Mention attendance only if it is below 90% or clearly affecting the results.
- Warm and professional. Never harsh, never gushing, never generic filler.
- Never invent a subject, score, behaviour or incident that is not in the data.
- If there is too little data to judge, say the results so far are limited rather than making something up.

Return the comment text only, with no heading, quotes or preamble.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json(
        { error: "AI analysis is not configured. Set the ANTHROPIC_API_KEY function secret." },
        503
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { data: { user } } = await createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role, org_id, school_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!callerRole?.org_id) return json({ error: "No organisation for this account" }, 403);

    const body = await req.json();
    const analysisType = body.analysis_type as AnalysisType;
    if (!ANALYSIS_TYPES.includes(analysisType)) {
      return json({ error: "Unknown analysis type" }, 400);
    }
    if (!ANALYSIS_ROLES[analysisType].includes(callerRole.role)) {
      return json({ error: "Your role cannot run this analysis" }, 403);
    }

    // Entitlement: every organisation gets FREE_MONTHLY_ANALYSES a month for
    // free; buying the add-on raises the ceiling to its own monthly limit.
    const { data: org } = await admin
      .from("organisation_groups")
      .select("id, name, currency, ai_addon_enabled, ai_monthly_limit")
      .eq("id", callerRole.org_id)
      .maybeSingle();
    if (!org) return json({ error: "Organisation not found" }, 404);

    const FREE_MONTHLY_ANALYSES = 5;
    const effectiveLimit = org.ai_addon_enabled
      ? Math.max(org.ai_monthly_limit ?? 0, FREE_MONTHLY_ANALYSES)
      : FREE_MONTHLY_ANALYSES;


    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count: usedThisMonth } = await admin
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "succeeded")
      .gte("created_at", monthStart.toISOString());

    if ((usedThisMonth ?? 0) >= org.ai_monthly_limit) {
      return json(
        {
          error: `Your organisation has used all ${org.ai_monthly_limit} AI analyses for this month.`,
          code: "limit_reached",
        },
        429
      );
    }

    // The school being analysed must belong to the caller's org. School-level
    // roles are further pinned to their own school.
    const schoolId: string | null = body.school_id ?? callerRole.school_id ?? null;
    if (schoolId) {
      const ORG_LEVEL = ["super_admin", "proprietor", "group_admin"];
      if (!ORG_LEVEL.includes(callerRole.role) && callerRole.school_id && schoolId !== callerRole.school_id) {
        return json({ error: "That school is not yours" }, 403);
      }
      const { data: school } = await admin
        .from("schools")
        .select("id")
        .eq("id", schoolId)
        .eq("org_id", org.id)
        .maybeSingle();
      if (!school) return json({ error: "School does not belong to your organisation" }, 403);
    }

    // `summary` is the caller's own data, already aggregated in the browser by
    // src/lib/performance.ts. It is bounded here so a malformed or oversized
    // payload cannot run up a large bill.
    const summary = JSON.stringify(body.summary ?? {});
    if (summary.length > 60_000) {
      return json({ error: "Too much data for one analysis. Narrow the class or term and try again." }, 413);
    }

    const anthropic = new Anthropic({ apiKey });
    const isReportCard = analysisType === "report_card_comments";

    const userPrompt = isReportCard
      ? `School: ${org.name}\n\nStudent results and attendance:\n${summary}`
      : `School: ${org.name}\nCurrency: ${org.currency || "NGN"}\nAnalysis requested: ${analysisType.replace(/_/g, " ")}\n\nData:\n${summary}`;

    let message;
    try {
      message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: isReportCard ? 1024 : 4096,
        thinking: { type: "adaptive" },
        output_config: { effort: isReportCard ? "low" : "medium" },
        system: isReportCard ? REPORT_CARD_SYSTEM : SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (err) {
      await admin.from("ai_usage_events").insert({
        org_id: org.id,
        school_id: schoolId,
        user_id: user.id,
        analysis_type: analysisType,
        model: MODEL,
        status: "failed",
        error_message: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
      });
      throw err;
    }

    if (message.stop_reason === "refusal") {
      await admin.from("ai_usage_events").insert({
        org_id: org.id,
        school_id: schoolId,
        user_id: user.id,
        analysis_type: analysisType,
        model: MODEL,
        status: "refused",
      });
      return json({ error: "The model declined to answer this request." }, 422);
    }

    const text = message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    await admin.from("ai_usage_events").insert({
      org_id: org.id,
      school_id: schoolId,
      user_id: user.id,
      analysis_type: analysisType,
      model: MODEL,
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
      status: "succeeded",
    });

    return json({
      result: text,
      analysis_type: analysisType,
      usage: {
        used_this_month: (usedThisMonth ?? 0) + 1,
        monthly_limit: org.ai_monthly_limit,
      },
    });
  } catch (err) {
    console.error("ai-insights error:", err);
    return json(
      { error: err instanceof Error ? err.message : "AI analysis failed" },
      500
    );
  }
});
