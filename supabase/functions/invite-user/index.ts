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
const VALID_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar", "finance_officer", "hr_admin", "teacher", "parent", "student"];

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
  student: 10,
};

type AdminClient = ReturnType<typeof createClient>;

/**
 * Produce a set-password link for a newly invited user and get it to them.
 *
 * `generateLink` mints the link but does not deliver it — the previous code
 * called it and threw the result away, so an invited user ended up with an
 * account and a role but no way to sign in. Two deliveries now happen:
 *
 *  1. the link is queued as an email, which `process-message-queue` sends once
 *     an email provider is configured; and
 *  2. the link is returned to the caller, so whoever sent the invite can pass it
 *     on directly. That matters because a school setting up for the first time
 *     usually has no mail provider yet, and Supabase's built-in SMTP is heavily
 *     rate limited.
 */
async function createInviteLink(
  admin: AdminClient,
  email: string,
  orgId: string,
  schoolName: string | null,
  schoolId: string | null = null
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties?.action_link) {
    console.error("Could not generate invite link:", error?.message);
    return null;
  }

  const link = data.properties.action_link;
  const where = schoolName ? ` at ${schoolName}` : "";

  await admin.from("outbound_message_queue").insert({
    org_id: orgId,
    // Puts the school's name on the From line when the invite is a school's.
    school_id: schoolId,
    channel: "email",
    recipient: email,
    subject: `Your account${where} is ready`,
    body:
      `You have been invited to Smart School Admin${where}.\n\n` +
      `Set your password to get started:\n${link}\n\n` +
      `If you were not expecting this, you can ignore this message.`,
  });

  return link;
}

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
    const SCHOOL_ADMIN_ALLOWED_ROLES = ["teacher", "bursar", "finance_officer", "hr_admin", "parent", "student"];
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

      // A parent belongs to the school their children attend. Without this the
      // role row carried no school_id and the app fell back to the org's first
      // school, so in a group a parent was shown another school's notices and
      // events. Nulls stay null: a guardian with no linked student yet is
      // org-level until one is added.
      const { data: guardianStudents } = await adminClient
        .from("student_guardians")
        .select("students(school_id)")
        .eq("guardian_id", guardian_id);

      const schoolIds = [...new Set(
        (guardianStudents || [])
          .map((row) => (row.students as { school_id?: string } | null)?.school_id)
          .filter((id): id is string => !!id)
      )];
      // Children split across two schools in the same group is rare but real;
      // pinning to one would be a guess, so leave it org-level.
      const guardianSchoolId = schoolIds.length === 1 ? schoolIds[0] : null;

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
        school_id: guardianSchoolId,
      });
      if (roleError) return jsonResponse({ error: roleError.message }, 400);

      // Link guardian to auth user
      const { error: linkError } = await adminClient
        .from("guardians")
        .update({ user_id: userId })
        .eq("id", guardian_id);
      if (linkError) return jsonResponse({ error: linkError.message }, 400);

      // guardianSchoolId is resolved above from the guardian's children.
      const guardianSchoolName = guardianSchoolId
        ? (await adminClient.from("schools").select("name").eq("id", guardianSchoolId).maybeSingle()).data?.name ?? null
        : null;
      const inviteLink = isNew
        ? await createInviteLink(adminClient, email, org_id, guardianSchoolName, guardianSchoolId)
        : null;

      return jsonResponse({ success: true, user_id: userId, is_new: isNew, invite_link: inviteLink });
    }

    // Invite a student to the portal, linking the login to their student record.
    if (action === "invite_student") {
      const { email, full_name, org_id, student_id } = body;
      if (!email || !org_id || !student_id) return jsonResponse({ error: "email, org_id, and student_id required" }, 400);

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || email.length > 255) return jsonResponse({ error: "Invalid email format" }, 400);

      // The student must be in a school belonging to the caller's org, and a
      // school-level caller may only invite students at their own school.
      const { data: student } = await adminClient
        .from("students")
        .select("id, school_id, first_name, last_name, schools!inner(id, org_id, name)")
        .eq("id", student_id)
        .maybeSingle();

      const studentSchool = student?.schools as { org_id: string; name: string } | null;
      if (!student || studentSchool?.org_id !== org_id) {
        return jsonResponse({ error: "Student not found in your organisation" }, 404);
      }
      if (callerIsSchoolLevel && student.school_id !== callerSchoolId) {
        return jsonResponse({ error: "Cannot invite students from other schools" }, 403);
      }

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
          user_metadata: { full_name: full_name || `${student.first_name} ${student.last_name}` },
        });
        if (createError || !newUser?.user) return jsonResponse({ error: createError?.message || "Failed to create user" }, 400);
        userId = newUser.user.id;
        isNew = true;
      }

      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: userId,
        role: "student",
        org_id,
        school_id: student.school_id,
      });
      if (roleError) return jsonResponse({ error: roleError.message }, 400);

      const { error: linkError } = await adminClient
        .from("students")
        .update({ user_id: userId })
        .eq("id", student_id);
      if (linkError) return jsonResponse({ error: linkError.message }, 400);

      const inviteLink = isNew
        ? await createInviteLink(adminClient, email, org_id, studentSchool?.name ?? null, student.school_id ?? null)
        : null;

      return jsonResponse({ success: true, user_id: userId, is_new: isNew, invite_link: inviteLink });
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

    let schoolName: string | null = null;
    if (school_id) {
      const { data: school } = await adminClient.from("schools").select("name").eq("id", school_id).maybeSingle();
      schoolName = school?.name ?? null;
    }

    const inviteLink = isNew ? await createInviteLink(adminClient, email, org_id, schoolName, school_id || null) : null;

    return jsonResponse({ success: true, user_id: userId, is_new: isNew, invite_link: inviteLink });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Invite failed" }, 500);
  }
});
