import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAssignRole, ROLE_RANK } from "../_shared/caller-roles.ts";

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

const STAFF_ROLES = ["teacher", "principal", "bursar", "finance_officer", "hr_admin", "school_admin", "support_staff"];
const VALID_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar", "finance_officer", "hr_admin", "support_staff", "teacher", "parent", "student"];

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
      `You have been invited to SmartSchoolAdmin${where}.\n\n` +
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

/**
 * Student is exclusive except for parent — mirrors public.roles_compatible().
 * The database enforces this too; checking here gives a readable message.
 */
function rolesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === "student") return b === "parent";
  if (b === "student") return a === "parent";
  return true;
}

/** All roles a user already holds, most senior first. */
async function rolesOf(admin: AdminClient, userId: string) {
  const { data } = await admin
    .from("user_roles")
    .select("id, role, org_id, school_id")
    .eq("user_id", userId);
  return (data ?? []).sort(
    (a, b) => (ROLE_RANK[a.role as string] ?? 99) - (ROLE_RANK[b.role as string] ?? 99)
  ) as { id: string; role: string; org_id: string | null; school_id: string | null }[];
}

/**
 * Record a role change in audit_logs.
 *
 * Every grant and revoke is written with the admin who did it and when, so a
 * school can answer "who made this person a bursar?" after the fact. Logging
 * must never break the operation itself, so failures are swallowed and logged.
 */
async function logRoleEvent(
  admin: AdminClient,
  args: {
    orgId: string | null;
    actorId: string;
    action:
      | "role_added"
      | "role_removed"
      | "role_changed"
      | "user_removed"
      | "super_admin_granted";
    targetUserId: string;
    detail: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  }
) {
  // A null org_id used to mean "drop the event". It now means a platform-level
  // event, which audit_logs stores — see 20260927150000. Dropping it was how
  // granting super_admin, whose holder can legitimately have no organisation,
  // could happen with no record anywhere.
  const { error } = await admin.from("audit_logs").insert({
    org_id: args.orgId,
    user_id: args.actorId,
    action: args.action,
    entity_type: "user_role",
    entity_id: args.targetUserId,
    detail: args.detail,
    old_values: args.oldValues ?? null,
    new_values: args.newValues ?? null,
  });
  if (error) console.error("Could not write role audit log:", error.message);
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
    // A caller may hold several roles; their authority is their most senior one.
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role, school_id, org_id")
      .eq("user_id", caller.id)
      .in("role", ADMIN_ROLES);

    const callerRole = (callerRoles ?? []).sort(
      (a, b) => (ROLE_RANK[a.role as string] ?? 99) - (ROLE_RANK[b.role as string] ?? 99)
    )[0] as { role: string; school_id: string | null; org_id: string | null } | undefined;

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

    // School-level admins may only hand out these roles, on top of whatever the
    // rank rule in canAssignRole() already permits.
    //
    // school_admin and principal are in this list deliberately, and were not
    // always: the old comment here said a school-wide authority was not a school
    // admin's to grant. That is what stopped a school from ever having two
    // people who run it, so it is now allowed on purpose. Rank still does the
    // real work — a principal cannot reach school_admin above them, and a bursar
    // cannot reach either.
    const SCHOOL_ADMIN_ALLOWED_ROLES = [
      "school_admin", "principal", "teacher", "bursar", "finance_officer",
      "hr_admin", "support_staff", "parent", "student",
    ];
    const assignableByCaller = (targetRole: string) =>
      canAssignRole(callerRole.role, targetRole) &&
      (!callerIsSchoolLevel || SCHOOL_ADMIN_ALLOWED_ROLES.includes(targetRole));

    /**
     * A user may now hold several roles, so every management action works on the
     * target's whole role set: the caller must outrank each of the target's
     * existing roles, and school-level callers may only touch their own school.
     */
    const guardTarget = async (userId: string) => {
      const existing = await rolesOf(adminClient, userId);
      for (const r of existing) {
        if (!canAssignRole(callerRole.role, r.role)) {
          return { error: jsonResponse({ error: `Your role cannot manage a ${r.role}` }, 403), existing };
        }
        if (callerIsSchoolLevel && r.school_id !== callerSchoolId) {
          return { error: jsonResponse({ error: "Cannot manage users from other schools" }, 403), existing };
        }
      }
      return { error: null, existing };
    };

    // Add one more role to an existing user, keeping what they already have.
    if (action === "add_role") {
      const { user_id, role: extraRole } = body;
      if (!user_id || !extraRole) return jsonResponse({ error: "user_id and role required" }, 400);
      if (!VALID_ROLES.includes(extraRole)) return jsonResponse({ error: "Invalid role" }, 400);
      if (!assignableByCaller(extraRole)) return jsonResponse({ error: `Your role (${callerRole.role}) cannot assign the ${extraRole} role` }, 403);

      const guard = await guardTarget(user_id);
      if (guard.error) return guard.error;
      if (guard.existing.some((r) => r.role === extraRole)) {
        return jsonResponse({ error: "User already has that role" }, 409);
      }
      const clash = guard.existing.find((r) => !rolesCompatible(r.role, extraRole));
      if (clash) {
        return jsonResponse({ error: `The ${extraRole} role cannot be combined with the ${clash.role} role` }, 400);
      }

      const target_school_id = body.school_id
        ?? (callerIsSchoolLevel ? callerSchoolId : guard.existing[0]?.school_id ?? null);
      const { error } = await adminClient.from("user_roles").insert({
        user_id,
        role: extraRole,
        org_id: callerRole.org_id,
        school_id: target_school_id,
      });
      if (error) return jsonResponse({ error: error.message }, 400);
      await logRoleEvent(adminClient, {
        orgId: callerRole.org_id,
        actorId: caller.id,
        // Its own action, so that "who made someone a platform owner?" is a
        // filter rather than a search through every role_added row in the table.
        action: extraRole === "super_admin" ? "super_admin_granted" : "role_added",
        targetUserId: user_id,
        detail: extraRole === "super_admin"
          ? "Granted the super admin role — full access to every organisation, school and setting"
          : `Added the ${extraRole} role`,
        oldValues: { roles: guard.existing.map((r) => r.role) },
        newValues: { roles: [...guard.existing.map((r) => r.role), extraRole] },
      });
      return jsonResponse({ success: true });
    }

    // Replace one specific role. `old_role` says which of the target's roles to
    // change; without it the whole set is replaced by the new role.
    if (action === "update_role") {
      const { user_id, new_role, old_role } = body;
      if (!user_id || !new_role) return jsonResponse({ error: "user_id and new_role required" }, 400);
      if (!VALID_ROLES.includes(new_role)) return jsonResponse({ error: "Invalid role" }, 400);
      if (!assignableByCaller(new_role)) return jsonResponse({ error: `Your role (${callerRole.role}) cannot assign the ${new_role} role` }, 403);

      const guard = await guardTarget(user_id);
      if (guard.error) return guard.error;

      const kept = guard.existing.filter((r) => (old_role ? r.role !== old_role : false));
      if (kept.some((r) => r.role === new_role)) {
        return jsonResponse({ error: "User already has that role" }, 409);
      }
      const clash = kept.find((r) => !rolesCompatible(r.role, new_role));
      if (clash) {
        return jsonResponse({ error: `The ${new_role} role cannot be combined with the ${clash.role} role` }, 400);
      }

      let query = adminClient.from("user_roles").update({ role: new_role }).eq("user_id", user_id);
      if (old_role) query = query.eq("role", old_role);
      const { error } = await query;
      if (error) return jsonResponse({ error: error.message }, 400);

      // Replacing the whole set: drop the now-redundant extra rows.
      if (!old_role && guard.existing.length > 1) {
        const survivors = guard.existing.slice(1).map((r) => r.id);
        await adminClient.from("user_roles").delete().in("id", survivors);
      }
      await logRoleEvent(adminClient, {
        orgId: callerRole.org_id,
        actorId: caller.id,
        action: "role_changed",
        targetUserId: user_id,
        detail: old_role
          ? `Changed the ${old_role} role to ${new_role}`
          : `Replaced all roles with ${new_role}`,
        oldValues: { roles: guard.existing.map((r) => r.role) },
        newValues: { roles: old_role ? [...kept.map((r) => r.role), new_role] : [new_role] },
      });
      return jsonResponse({ success: true });
    }

    // Remove one role, or all of them when no role is named.
    if (action === "delete_role") {
      const { user_id, role: roleToRemove } = body;
      if (!user_id) return jsonResponse({ error: "user_id required" }, 400);
      const guard = await guardTarget(user_id);
      if (guard.error) return guard.error;

      /**
       * Never remove the platform's last super admin.
       *
       * Now that a super admin can appoint another one, they can also manage one
       * — including removing the role. Two super admins demoting each other, or
       * one demoting themselves, would leave nobody able to grant the role back,
       * because only a super admin may. The recovery would be a hand-written SQL
       * statement against production, so the check belongs here rather than in a
       * runbook. It counts rows rather than trusting the caller's own row, since
       * the target may be someone else.
       */
      const losesSuperAdmin =
        (!roleToRemove || roleToRemove === "super_admin") &&
        guard.existing.some((r) => r.role === "super_admin");
      if (losesSuperAdmin) {
        const { count } = await adminClient
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "super_admin");
        if ((count ?? 0) <= 1) {
          return jsonResponse(
            { error: "This is the only super admin left. Appoint another one before removing this role." },
            409
          );
        }
      }

      let query = adminClient.from("user_roles").delete().eq("user_id", user_id);
      if (roleToRemove) query = query.eq("role", roleToRemove);
      const { error } = await query;
      if (error) return jsonResponse({ error: error.message }, 400);
      await logRoleEvent(adminClient, {
        orgId: callerRole.org_id,
        actorId: caller.id,
        action: roleToRemove ? "role_removed" : "user_removed",
        targetUserId: user_id,
        detail: roleToRemove
          ? `Removed the ${roleToRemove} role`
          : "Removed all roles from the organisation",
        oldValues: { roles: guard.existing.map((r) => r.role) },
        newValues: {
          roles: roleToRemove
            ? guard.existing.filter((r) => r.role !== roleToRemove).map((r) => r.role)
            : [],
        },
      });
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
        // Multiple roles are allowed, so only a duplicate or an incompatible
        // combination is a problem.
        const heldRoles = await rolesOf(adminClient, existingUser.id);
        if (heldRoles.some((r) => r.role === "parent")) {
          return jsonResponse({ error: "User already has the parent role" }, 409);
        }
        const clash = heldRoles.find((r) => !rolesCompatible(r.role, "parent"));
        if (clash) return jsonResponse({ error: `The parent role cannot be combined with the ${clash.role} role` }, 400);
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
      await logRoleEvent(adminClient, {
        orgId: org_id,
        actorId: caller.id,
        action: "role_added",
        targetUserId: userId,
        detail: "Granted the parent role via a guardian portal invite",
        newValues: { roles: ["parent"] },
      });

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
        const heldRoles = await rolesOf(adminClient, existingUser.id);
        if (heldRoles.some((r) => r.role === "student")) {
          return jsonResponse({ error: "User already has the student role" }, 409);
        }
        const clash = heldRoles.find((r) => !rolesCompatible(r.role, "student"));
        if (clash) {
          return jsonResponse({ error: `A student account cannot also hold the ${clash.role} role` }, 400);
        }
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
      await logRoleEvent(adminClient, {
        orgId: org_id,
        actorId: caller.id,
        action: "role_added",
        targetUserId: userId,
        detail: "Granted the student role via a student portal invite",
        newValues: { roles: ["student"] },
      });

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
    const { email, full_name, role, staff_id } = body;

    // The client's auth context can still be hydrating when the invite is sent,
    // so org_id/school_id may arrive undefined. The caller's own role row is the
    // authoritative source anyway (and a mismatched org_id was already rejected
    // above), so fall back to it instead of failing the request.
    const school_id = body.school_id ?? (callerIsSchoolLevel ? callerSchoolId : null);
    let org_id: string | null = body.org_id ?? callerRole.org_id ?? null;
    if (!org_id && school_id) {
      const { data: sch } = await adminClient.from("schools").select("org_id").eq("id", school_id).maybeSingle();
      org_id = (sch?.org_id as string | undefined) ?? null;
    }

    if (!email || !role) return jsonResponse({ error: "email and role are required" }, 400);
    if (!org_id) return jsonResponse({ error: "Could not determine your organisation" }, 400);

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
      const heldRoles = await rolesOf(adminClient, existingUser.id);
      if (heldRoles.some((r) => r.role === role)) {
        return jsonResponse({ error: "User already has that role in this organisation" }, 409);
      }
      const clash = heldRoles.find((r) => !rolesCompatible(r.role, role));
      if (clash) {
        return jsonResponse({ error: `The ${role} role cannot be combined with the ${clash.role} role` }, 400);
      }
      const otherOrg = heldRoles.find((r) => r.org_id && r.org_id !== org_id);
      if (otherOrg) {
        return jsonResponse({ error: "That user belongs to another organisation" }, 409);
      }
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
    await logRoleEvent(adminClient, {
      orgId: org_id,
      actorId: caller.id,
      action: "role_added",
      targetUserId: userId,
      detail: isNew
        ? `Invited a new user with the ${role} role`
        : `Added the ${role} role to an existing user`,
      newValues: { roles: [role] },
    });

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
