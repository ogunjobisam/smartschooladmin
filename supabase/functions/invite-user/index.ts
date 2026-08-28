import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const STAFF_ROLES = ["teacher", "principal", "bursar", "finance_officer", "hr_admin", "school_admin"];
const VALID_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar", "finance_officer", "hr_admin", "teacher", "parent"];

// Role hierarchy: lower index = higher privilege
const ROLE_RANK: Record<string, number> = {
  super_admin: 0,
  proprietor: 1,
  group_admin: 2,
  school_admin: 3,
  principal: 4,
  bursar: 5,
  finance_officer: 6,
  hr_admin: 7,
  teacher: 8,
  parent: 9,
};

type AdminClient = ReturnType<typeof createClient>;

/**
 * Look up an auth user by email.
 *
 * `listUsers()` returns only the first page (50 users) by default, so a bare
 * `.find()` over it silently misses anyone past that boundary and the invite
 * then fails with a confusing "email already registered". Page through until
 * we find a match or run out of users.
 */
async function findUserByEmail(admin: AdminClient, email: string) {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) return undefined;
  }
  return undefined;
}

function canAssignRole(callerRole: string, targetRole: string): boolean {
  const callerRank = ROLE_RANK[callerRole];
  const targetRank = ROLE_RANK[targetRole];
  if (callerRank === undefined || targetRank === undefined) return false;
  // Can only assign roles strictly below your own rank
  return targetRank > callerRank;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonResponse({ error: "Invalid token" }, 401);

    // Check caller is super_admin, proprietor, or school_admin
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const ADMIN_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar", "finance_officer", "hr_admin"];
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role, school_id, org_id")
      .eq("user_id", caller.id)
      .in("role", ADMIN_ROLES)
      .limit(1)
      .maybeSingle();

    if (!callerRole) return jsonResponse({ error: "Insufficient permissions" }, 403);

    const ORG_LEVEL_ROLES = ["super_admin", "proprietor", "group_admin"];
    const callerIsSchoolLevel = !ORG_LEVEL_ROLES.includes(callerRole.role);
    const callerSchoolId = callerRole.school_id;

    const body = await req.json();
    const { action } = body;

    // Tenant isolation: every write below uses the service role key and bypasses
    // RLS, so an org_id supplied by the client must be proven to be the caller's
    // own org. Otherwise an admin of one organisation could grant themselves or
    // anyone else a role inside another organisation.
    if (body.org_id && body.org_id !== callerRole.org_id) {
      return jsonResponse({ error: "Cannot manage users in another organisation" }, 403);
    }
    if (callerIsSchoolLevel && !callerSchoolId) {
      return jsonResponse({ error: "Your account is not assigned to a school" }, 403);
    }

    // School-level admins may only hand out these roles. The rank check in
    // canAssignRole() alone would let a school_admin create a principal, which
    // is a school-wide authority they should not be able to grant.
    const SCHOOL_ADMIN_ALLOWED_ROLES = ["teacher", "bursar", "finance_officer", "hr_admin", "parent"];
    const assignableByCaller = (targetRole: string) =>
      canAssignRole(callerRole.role, targetRole) &&
      (!callerIsSchoolLevel || SCHOOL_ADMIN_ALLOWED_ROLES.includes(targetRole));

    // Handle role update
    if (action === "update_role") {
      const { user_id, new_role } = body;
      if (!user_id || !new_role) return jsonResponse({ error: "user_id and new_role required" }, 400);
      if (!assignableByCaller(new_role)) return jsonResponse({ error: `Your role (${callerRole.role}) cannot assign the ${new_role} role` }, 403);
      // Also check caller outranks the target's current role
      const { data: targetRole } = await adminClient.from("user_roles").select("role, school_id").eq("user_id", user_id).maybeSingle();
      if (targetRole && !canAssignRole(callerRole.role, targetRole.role)) return jsonResponse({ error: `Your role cannot manage a ${targetRole.role}` }, 403);
      if (callerIsSchoolLevel && targetRole?.school_id !== callerSchoolId) return jsonResponse({ error: "Cannot manage users from other schools" }, 403);
      const { error } = await adminClient.from("user_roles").update({ role: new_role }).eq("user_id", user_id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    // Handle delete user role
    if (action === "delete_role") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ error: "user_id required" }, 400);
      const { data: targetRole } = await adminClient.from("user_roles").select("school_id, role").eq("user_id", user_id).maybeSingle();
      if (targetRole && !canAssignRole(callerRole.role, targetRole.role)) return jsonResponse({ error: `Your role cannot remove a ${targetRole.role}` }, 403);
      if (callerIsSchoolLevel && targetRole?.school_id !== callerSchoolId) return jsonResponse({ error: "Cannot manage users from other schools" }, 403);
      const { error } = await adminClient.from("user_roles").delete().eq("user_id", user_id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    // Handle guardian invite (creates auth user with parent role + links guardian)
    if (action === "invite_guardian") {
      const { email, full_name, org_id, guardian_id } = body;
      if (!email || !org_id || !guardian_id) return jsonResponse({ error: "email, org_id, and guardian_id required" }, 400);

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || email.length > 255) return jsonResponse({ error: "Invalid email format" }, 400);

      // The guardian row must live in the caller's org before we link an account to it.
      const { data: guardian } = await adminClient
        .from("guardians")
        .select("id")
        .eq("id", guardian_id)
        .eq("org_id", org_id)
        .maybeSingle();
      if (!guardian) return jsonResponse({ error: "Guardian not found in your organisation" }, 404);

      // Check if user exists
      const existingUser = await findUserByEmail(adminClient, email);

      let userId: string;
      let isNew = false;
      if (existingUser) {
        userId = existingUser.id;
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", existingUser.id)
          .eq("org_id", org_id)
          .maybeSingle();
        if (existingRole) return jsonResponse({ error: "User already has a role in this organisation" }, 409);
      } else {
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: full_name || "" },
        });
        if (createError || !newUser?.user) return jsonResponse({ error: createError?.message || "Failed to create user" }, 400);
        userId = newUser.user.id;
        isNew = true;
      }

      // Assign parent role
      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: userId,
        role: "parent",
        org_id,
      });
      if (roleError) return jsonResponse({ error: roleError.message }, 400);

      // Link guardian to auth user
      const { error: linkError } = await adminClient
        .from("guardians")
        .update({ user_id: userId })
        .eq("id", guardian_id);
      if (linkError) return jsonResponse({ error: linkError.message }, 400);

      // Send password reset email so user can set their own password
      if (isNew) {
        await adminClient.auth.admin.generateLink({ type: "recovery", email });
      }

      return jsonResponse({ success: true, user_id: userId, is_new: isNew });
    }

    // Handle standard invite
    const { email, full_name, role, org_id, school_id, staff_id } = body;

    if (!email || !role || !org_id) return jsonResponse({ error: "email, role, and org_id are required" }, 400);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 255) return jsonResponse({ error: "Invalid email format" }, 400);
    if (!VALID_ROLES.includes(role)) return jsonResponse({ error: "Invalid role" }, 400);
    if (full_name && full_name.length > 200) return jsonResponse({ error: "Name too long" }, 400);

    // Enforce role hierarchy: caller can only assign roles below their rank
    if (!assignableByCaller(role)) return jsonResponse({ error: `Your role (${callerRole.role}) cannot assign the ${role} role` }, 403);
    if (callerIsSchoolLevel) {
      if (school_id && school_id !== callerSchoolId) return jsonResponse({ error: "Cannot invite users to other schools" }, 403);
    }
    if (school_id) {
      const { data: targetSchool } = await adminClient
        .from("schools")
        .select("id")
        .eq("id", school_id)
        .eq("org_id", callerRole.org_id)
        .maybeSingle();
      if (!targetSchool) return jsonResponse({ error: "School does not belong to your organisation" }, 403);
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(adminClient, email);

    let userId: string;
    let isNew = false;

    if (existingUser) {
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("org_id", org_id)
        .maybeSingle();
      if (existingRole) return jsonResponse({ error: "User already has a role in this organisation" }, 409);
      userId = existingUser.id;
    } else {
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: full_name || "" },
      });
      if (createError || !newUser?.user) return jsonResponse({ error: createError?.message || "Failed to create user" }, 400);
      userId = newUser.user.id;
      isNew = true;
    }

    // Assign role
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      role,
      org_id,
      school_id: school_id || null,
    });
    if (roleError) return jsonResponse({ error: roleError.message }, 400);

    // Auto-create staff record for staff roles
    if (STAFF_ROLES.includes(role) && school_id) {
      if (staff_id) {
        await adminClient.from("staff").update({ user_id: userId }).eq("id", staff_id);
      } else {
        const nameParts = (full_name || email.split("@")[0]).split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        await adminClient.from("staff").insert({
          first_name: firstName,
          last_name: lastName || firstName,
          email,
          school_id,
          user_id: userId,
        });
      }
    }

    // Send password reset email so invited user can set their own password
    if (isNew) {
      await adminClient.auth.admin.generateLink({ type: "recovery", email });
    }

    return jsonResponse({ success: true, user_id: userId, is_new: isNew });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
