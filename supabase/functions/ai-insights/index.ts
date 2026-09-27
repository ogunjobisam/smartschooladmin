import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchCallerRoles, primaryRole } from "../_shared/caller-roles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "openai/gpt-5.6-sol";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";

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
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return json({ error: "AI analysis is not configured." }, 503);
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

    // This handler is not told which organisation to analyse — it picks one —
    // so it needs the caller's *most senior* role, not whichever row PostgREST
    // returned first. The old `.limit(1)` with no ORDER BY meant someone who
    // teaches at one school and runs another could have `callerRole.role` come
    // back as either, which decides both the analyses they may run (below) and
    // whose data gets analysed. primaryRole() uses the same ordering as the
    // database's primary_user_role(), so the two cannot disagree.
    const callerRole = primaryRole(await fetchCallerRoles(admin, user.id));
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

    // Reserve this analysis against the month's allowance before calling the
    // model. Counting successes first and recording afterwards let parallel
    // requests all pass the check; the reservation is counted under a lock.
    const { data: reservation, error: reserveError } = await admin.rpc("reserve_ai_analysis", {
      _org_id: org.id,
      _limit: effectiveLimit,
      _school_id: schoolId,
      _user_id: user.id,
      _analysis_type: analysisType,
      _model: MODEL,
    });
    if (reserveError) throw reserveError;
    const slot = (Array.isArray(reservation) ? reservation[0] : reservation) as
      { event_id: string | null; used: number } | null;
    if (!slot?.event_id) {
      return json(
        {
          error: org.ai_addon_enabled
            ? `Your organisation has used all ${effectiveLimit} AI analyses for this month.`
            : `Your organisation has used all ${effectiveLimit} free AI analyses for this month. Buy the AI Analysis add-on for a larger monthly allowance.`,
          code: org.ai_addon_enabled ? "limit_reached" : "free_limit_reached",
        },
        429
      );
    }
    const eventId = slot.event_id;
    const usedThisMonth = slot.used;

    const isReportCard = analysisType === "report_card_comments";

    const userPrompt = isReportCard
      ? `School: ${org.name}\n\nStudent results and attendance:\n${summary}`
      : `School: ${org.name}\nCurrency: ${org.currency || "NGN"}\nAnalysis requested: ${analysisType.replace(/_/g, " ")}\n\nData:\n${summary}`;

    // A failure gives the reserved slot back.
    const logFailure = async (messageText: string) => {
      await admin
        .from("ai_usage_events")
        .update({ status: "failed", error_message: messageText.slice(0, 500) })
        .eq("id", eventId);
    };

    let response: Response;
    try {
      response = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: MODEL,
          instructions: isReportCard ? REPORT_CARD_SYSTEM : SYSTEM_PROMPT,
          input: [{ role: "user", content: userPrompt }],
          max_output_tokens: isReportCard ? 2048 : 6144,
          reasoning: { effort: isReportCard ? "low" : "medium" },
        }),
      });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Unknown error";
      await logFailure(messageText);
      return json({ error: "Could not reach the AI service. Please try again." }, 502);
    }

    if (!response.ok) {
      const detail = await response.text();
      await logFailure(`${response.status}: ${detail}`);
      if (response.status === 429) {
        return json({ error: "The AI service is busy. Please try again in a moment." }, 429);
      }
      if (response.status === 402) {
        return json({ error: "AI credits have run out. Please top up to continue." }, 402);
      }
      if (response.status === 403) {
        return json({ error: "AI access is currently blocked for this workspace." }, 403);
      }
      return json({ error: "AI analysis failed. Please try again." }, 502);
    }

    const payload = await response.json();

    const text: string = (payload.output_text as string | undefined)?.trim() ||
      (Array.isArray(payload.output)
        ? payload.output
            .flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content ?? [])
            .filter((block: { type?: string }) => block.type === "output_text")
            .map((block: { text?: string }) => block.text ?? "")
            .join("\n")
            .trim()
        : "");

    if (!text) {
      await logFailure("Empty response from model");
      return json({ error: "The AI service returned an empty result. Please try again." }, 502);
    }

    await admin
      .from("ai_usage_events")
      .update({
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
        status: "succeeded",
      })
      .eq("id", eventId);

    return json({
      result: text,
      analysis_type: analysisType,
      usage: {
        used_this_month: (usedThisMonth ?? 0) + 1,
        monthly_limit: effectiveLimit,
        has_addon: org.ai_addon_enabled,
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
