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
      .select("role, school_id")
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

    // School admins can only manage users in their own school
    const SCHOOL_ADMIN_ALLOWED_ROLES = ["teacher", "bursar", "finance_officer", "hr_admin", "parent"];

    // Handle role update
    if (action === "update_role") {
      const { user_id, new_role } = body;
      if (!user_id || !new_role) return jsonResponse({ error: "user_id and new_role required" }, 400);
      if (callerIsSchoolLevel) {
        if (!SCHOOL_ADMIN_ALLOWED_ROLES.includes(new_role)) return jsonResponse({ error: "School-level admins can only assign school-level roles" }, 403);
        const { data: targetRole } = await adminClient.from("user_roles").select("school_id").eq("user_id", user_id).maybeSingle();
        if (targetRole?.school_id !== callerSchoolId) return jsonResponse({ error: "Cannot manage users from other schools" }, 403);
      }
      const { error } = await adminClient.from("user_roles").update({ role: new_role }).eq("user_id", user_id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    // Handle delete user role
    if (action === "delete_role") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ error: "user_id required" }, 400);
      if (callerIsSchoolLevel) {
        const { data: targetRole } = await adminClient.from("user_roles").select("school_id, role").eq("user_id", user_id).maybeSingle();
        if (targetRole?.school_id !== callerSchoolId) return jsonResponse({ error: "Cannot manage users from other schools" }, 403);
        if (!SCHOOL_ADMIN_ALLOWED_ROLES.includes(targetRole?.role)) return jsonResponse({ error: "Cannot remove this role" }, 403);
      }
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

      // Check if user exists
      const { data: existingUsers } = await adminClient.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

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

    // School admins can only invite school-level roles into their own school
    if (callerIsSchoolLevel) {
      if (!SCHOOL_ADMIN_ALLOWED_ROLES.includes(role)) return jsonResponse({ error: "School-level admins can only assign school-level roles" }, 403);
      if (school_id && school_id !== callerSchoolId) return jsonResponse({ error: "Cannot invite users to other schools" }, 403);
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

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
