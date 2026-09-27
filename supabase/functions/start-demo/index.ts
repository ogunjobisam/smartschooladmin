import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchCallerRoles, primaryRole } from "../_shared/caller-roles.ts";

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

/** Personas a visitor may try. Anything else is rejected. */
const DEMO_ROLES = ["proprietor", "principal", "teacher", "parent", "student"] as const;
type DemoRole = (typeof DEMO_ROLES)[number];

const DEMO_HOURS = 4;

type AdminClient = ReturnType<typeof createClient>;

/**
 * Remove demo organisations whose four hours are up.
 *
 * There is no scheduler in play, so expiry is enforced opportunistically:
 * every new demo sweeps the old ones first. The banner in the app also calls
 * the cleanup endpoint when a session runs out, so an idle project still
 * clears itself the next time anyone visits.
 */
async function purgeExpired(admin: AdminClient) {
  const { data: expired } = await admin
    .from("organisation_groups")
    .select("id")
    .eq("is_demo", true)
    .lt("demo_expires_at", new Date().toISOString())
    .limit(20);

  for (const org of expired ?? []) {
    await destroyDemoOrg(admin, org.id as string);
  }

  await purgeOrphanDemoUsers(admin);
}

const DEMO_EMAIL_DOMAIN = "@demo.smartschooladmin.app";

/**
 * Throwaway demo logins whose sandbox is already gone (e.g. a start that
 * failed halfway). Only the reserved demo email domain is ever touched.
 */
async function purgeOrphanDemoUsers(admin: AdminClient) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return;

  for (const user of data?.users ?? []) {
    if (!user.email?.endsWith(DEMO_EMAIL_DOMAIN)) continue;
    const { count } = await admin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) > 0) continue;
    await admin.from("profiles").delete().eq("user_id", user.id);
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) console.error("Could not delete orphan demo user", user.id, delErr.message);
  }
}

/**
 * Erase one demo sandbox: its data, then the throwaway logins that were only
 * ever created for it. Used both by the expiry sweep and by "End demo".
 */
async function destroyDemoOrg(admin: AdminClient, orgId: string): Promise<boolean> {
  // Collect the throwaway logins before the role rows disappear.
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("org_id", orgId);
  const userIds = [...new Set((roles ?? []).map((r) => r.user_id as string))];

  const { error } = await admin.rpc("delete_demo_org", { _org_id: orgId });
  if (error) {
    console.error("Could not delete demo org", orgId, error.message);
    return false;
  }
  for (const userId of userIds) {
    await admin.from("profiles").delete().eq("user_id", userId);
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) console.error("Could not delete demo user", userId, delErr.message);
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Also usable as a plain cleanup endpoint when a session times out.
    if (body.action === "cleanup") {
      await purgeExpired(admin);
      return jsonResponse({ success: true });
    }

    // "End demo" (or a timer that has just run out): delete the caller's own
    // sandbox immediately, without waiting for the expiry sweep.
    if (body.action === "end") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

      const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      }).auth.getUser();
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

      // Deterministic rather than whichever row came back first: someone who
      // started a sandbox while signed in to a real account holds two role
      // rows, and "no demo session to end" arriving at random is not something
      // anyone can reproduce. The is_demo check below is what keeps a real
      // organisation safe either way.
      const roleRow = primaryRole(await fetchCallerRoles(admin, user.id));
      const orgId = roleRow?.org_id as string | undefined;
      if (!orgId) return jsonResponse({ error: "No demo session to end" }, 400);

      // Only ever delete a sandbox — never a real organisation.
      const { data: org } = await admin
        .from("organisation_groups")
        .select("id, is_demo")
        .eq("id", orgId)
        .maybeSingle();
      if (!org?.is_demo) return jsonResponse({ error: "Not a demo organisation" }, 403);

      const deleted = await destroyDemoOrg(admin, orgId);
      if (!deleted) return jsonResponse({ error: "Could not end the demo" }, 500);

      await purgeExpired(admin);
      return jsonResponse({ success: true, deleted: true });
    }

    const role: DemoRole = DEMO_ROLES.includes(body.role) ? body.role : "proprietor";

    await purgeExpired(admin);

    // Seed a private sandbox: its own organisation, school and sample records.
    const { data: seeded, error: seedError } = await admin.rpc("create_demo_org", {
      _label: "Demo Group",
      _hours: DEMO_HOURS,
    });
    if (seedError) {
      console.error("Demo seeding failed:", seedError.message);
      return jsonResponse({ error: "Could not start the demo. Please try again." }, 500);
    }

    const seed = (Array.isArray(seeded) ? seeded[0] : seeded) as {
      org_id: string;
      school_id: string;
      class_id: string;
      staff_id: string;
      guardian_id: string;
      student_id: string;
    };

    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `demo.${role}.${suffix}@demo.smartschooladmin.app`;
    const password = crypto.randomUUID() + "Aa1!";

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Demo ${role.replace("_", " ")}`, is_demo: true },
    });
    if (createError || !created?.user) {
      await admin.rpc("delete_demo_org", { _org_id: seed.org_id });
      return jsonResponse({ error: createError?.message || "Could not create the demo account" }, 500);
    }
    const userId = created.user.id;

    // Proprietor is group-level; the other personas belong to the demo school.
    const schoolScoped = role !== "proprietor";
    const { error: roleError } = await admin.from("user_roles").insert({
      user_id: userId,
      role,
      org_id: seed.org_id,
      school_id: schoolScoped ? seed.school_id : null,
    });
    if (roleError) {
      await admin.auth.admin.deleteUser(userId);
      await admin.rpc("delete_demo_org", { _org_id: seed.org_id });
      return jsonResponse({ error: roleError.message }, 500);
    }

    // Point the persona at a real record so their own dashboard has content.
    if (role === "teacher" || role === "principal") {
      await admin.from("staff").update({ user_id: userId }).eq("id", seed.staff_id);
    }
    if (role === "parent") {
      await admin.from("guardians").update({ user_id: userId }).eq("id", seed.guardian_id);
    }
    if (role === "student") {
      await admin.from("students").update({ user_id: userId }).eq("id", seed.student_id);
    }

    // Sign the visitor in and hand the session back — one click, no details.
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: signIn, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
    if (signInError || !signIn?.session) {
      return jsonResponse({ error: signInError?.message || "Could not open the demo session" }, 500);
    }

    const expiresAt = new Date(Date.now() + DEMO_HOURS * 60 * 60 * 1000).toISOString();

    return jsonResponse({
      success: true,
      role,
      org_id: seed.org_id,
      school_id: seed.school_id,
      expires_at: expiresAt,
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    });
  } catch (err) {
    console.error("start-demo failed:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Demo failed" }, 500);
  }
});
