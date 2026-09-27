import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { InviteLinkDialog } from "@/components/auth/InviteLinkDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { UserPlus, Loader2, Shield, Trash2, Plus, X, Search, Filter, History, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/errors";
import {
  ROLES, ROLE_RANK, ADMIN_ROLES, roleBadgeClass, roleLabel,
  roleAllowedAlongside, primaryRole, rolesCompatible, canAssignRole,
} from "@/lib/roles";

/** True when a person holds two roles that are not allowed together. */
function hasRoleConflict(roles: string[]): boolean {
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      if (!rolesCompatible(roles[i], roles[j])) return true;
    }
  }
  return false;
}

interface UserRow {
  userId: string;
  fullName: string;
  email: string;
  roles: { role: string; schoolName: string | null; createdAt: string }[];
  joined: string;
}

export default function UserManagement() {
  const { userRole, orgId, schoolId, schools, user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [assignSchoolId, setAssignSchoolId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<{ email: string; link: string } | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [matchAll, setMatchAll] = useState(true);
  const [conflictsOnly, setConflictsOnly] = useState(false);

  const [addRoleUser, setAddRoleUser] = useState<UserRow | null>(null);
  const [extraRole, setExtraRole] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  // Fetch all user roles in this org with profiles
  const { data: users, isLoading } = useQuery({
    queryKey: ["org-users", orgId, schoolId, userRole],
    queryFn: async (): Promise<UserRow[]> => {
      if (!orgId) return [];
      let query = supabase
        .from("user_roles")
        .select("user_id, role, school_id, created_at, schools(name)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });

      // School-level admins only see users in their school
      if (!["super_admin", "proprietor", "group_admin"].includes(userRole || "") && schoolId) {
        query = query.eq("school_id", schoolId);
      }

      const { data } = await query;
      if (!data) return [];

      const userIds = [...new Set(data.map((r) => r.user_id))];
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      // One row per person, with all their roles collected together.
      const byUser = new Map<string, UserRow>();
      for (const r of data) {
        const profile = profileMap.get(r.user_id);
        const existing = byUser.get(r.user_id);
        const entry = existing ?? {
          userId: r.user_id,
          fullName: profile?.full_name || "Unknown",
          email: profile?.email || "",
          roles: [],
          joined: r.created_at,
        };
        entry.roles.push({
          role: r.role,
          schoolName: (r.schools as { name: string } | null)?.name ?? null,
          createdAt: r.created_at,
        });
        byUser.set(r.user_id, entry);
      }

      return [...byUser.values()].map((u) => ({
        ...u,
        roles: u.roles.sort((a, b) => (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99)),
      }));
    },
    enabled: !!orgId,
  });

  /**
   * Narrowing happens in the browser: an organisation's staff list is small,
   * and role combinations and exclusivity conflicts can only be judged once a
   * person's whole role set is assembled.
   */
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (term && !`${u.fullName} ${u.email}`.toLowerCase().includes(term)) return false;
      const held = u.roles.map((r) => r.role);
      if (roleFilter.length > 0) {
        const ok = matchAll
          ? roleFilter.every((r) => held.includes(r))
          : roleFilter.some((r) => held.includes(r));
        if (!ok) return false;
      }
      if (conflictsOnly && !hasRoleConflict(held)) return false;
      return true;
    });
  }, [users, search, roleFilter, matchAll, conflictsOnly]);

  const conflictCount = useMemo(
    () => (users ?? []).filter((u) => hasRoleConflict(u.roles.map((r) => r.role))).length,
    [users]
  );

  // Only these roles can read audit_logs, so don't query it for the others.
  const canViewAudit = ["super_admin", "proprietor", "principal", "school_admin"].includes(userRole || "");

  const { data: auditLog } = useQuery({
    queryKey: ["role-audit", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, entity_id, detail, created_at, user_id")
        .eq("org_id", orgId!)
        .eq("entity_type", "user_role")
        .order("created_at", { ascending: false })
        .limit(50);
      const rows = data ?? [];
      const ids = [...new Set([...rows.map((r) => r.user_id), ...rows.map((r) => r.entity_id)].filter(Boolean))] as string[];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids)
        : { data: [] };
      const names = new Map((profiles || []).map((p) => [p.user_id, p.full_name || p.email || "Unknown"]));
      return rows.map((r) => ({
        ...r,
        actorName: r.user_id ? names.get(r.user_id) ?? "Unknown" : "System",
        targetName: r.entity_id ? names.get(r.entity_id) ?? "Removed user" : "—",
      }));
    },
    enabled: !!orgId && canViewAudit,
  });

  // Whatever the caller may actually grant. canAssignRole is the same function
  // the invite-user edge function gates on, so this dropdown cannot offer a role
  // the server will then refuse — which is how a school admin used to be shown
  // "School Admin" and get a 403 for choosing it.
  const availableRoles = ROLES.filter((r) => canAssignRole(userRole || "", r.value));

  // Roles that may be added to the selected user without clashing with what they hold.
  //
  // Declared before the early return below: a hook after a conditional return
  // changes the hook count when the condition flips (the role resolving after
  // first render is enough), and React throws. The parent dashboard was once
  // a blank page for every parent for exactly this reason.
  const addableRoles = useMemo(() => {
    if (!addRoleUser) return [];
    const held = addRoleUser.roles.map((r) => r.role);
    return availableRoles.filter((r) => roleAllowedAlongside(r.value, held));
  }, [addRoleUser, availableRoles]);

  if (!ADMIN_ROLES.includes(userRole || "")) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleInvite = async () => {
    if (!email.trim() || !role || !orgId) {
      toast.error("Please fill in email and role");
      return;
    }

    // Client-side email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim()) || email.trim().length > 255) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (fullName.length > 200) {
      toast.error("Name must be less than 200 characters");
      return;
    }

    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          org_id: orgId,
          school_id: assignSchoolId || schoolId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data?.is_new
        ? `User ${email} created and assigned ${roleLabel(role)} role`
        : `Existing user ${email} assigned ${roleLabel(role)} role`
      );

      // Show the set-password link. The invite is also queued as an email, but
      // a school without a mail provider needs to be able to pass it on by hand
      // — otherwise the new account is unusable and nothing says why.
      if (data?.invite_link) {
        setInviteLink({ email: email.trim(), link: data.invite_link });
      }

      setEmail("");
      setFullName("");
      setRole("");
      setAssignSchoolId("");
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["role-audit"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to invite user"));
    } finally {
      setInviting(false);
    }
  };

  const handleAddRole = async () => {
    if (!addRoleUser || !extraRole) return;
    setSavingRole(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "add_role", user_id: addRoleUser.userId, role: extraRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${roleLabel(extraRole)} role added`);
      setAddRoleUser(null);
      setExtraRole("");
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["role-audit"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add role"));
    } finally {
      setSavingRole(false);
    }
  };

  /** Removes a single role, leaving the user's other roles intact. */
  const handleRemoveRole = async (userId: string, roleToRemove: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "delete_role", user_id: userId, role: roleToRemove },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${roleLabel(roleToRemove)} role removed`);
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["role-audit"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove role"));
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "delete_role", user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("User removed from organisation");
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["role-audit"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove user"));
    }
  };

  /**
   * The caller may manage a person only if they could have granted every role
   * that person holds — the same rule guardTarget() applies server-side. Peers
   * are included, so two school admins can manage each other; that is the point
   * of letting a school have two.
   */
  const canManage = (u: UserRow) =>
    u.userId !== currentUser?.id && u.roles.every((r) => canAssignRole(userRole || "", r.role));

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Invite users and manage roles across your organisation. A person can hold several roles — a student cannot also be staff."
      >
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                If the email already belongs to someone in your organisation, this adds the role
                to their existing account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {schools.length > 1 && (
                <div className="space-y-2">
                  <Label>School</Label>
                  <Select value={assignSchoolId} onValueChange={setAssignSchoolId}>
                    <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
                    <SelectContent>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-4 w-4" />
                Roles{roleFilter.length > 0 ? ` (${roleFilter.length})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    variant={matchAll ? "default" : "outline"}
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={() => setMatchAll(true)}
                  >
                    Has all
                  </Button>
                  <Button
                    variant={!matchAll ? "default" : "outline"}
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={() => setMatchAll(false)}
                  >
                    Has any
                  </Button>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {ROLES.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={roleFilter.includes(r.value)}
                        onCheckedChange={(checked) =>
                          setRoleFilter((prev) =>
                            checked ? [...prev, r.value] : prev.filter((v) => v !== r.value)
                          )
                        }
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant={conflictsOnly ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setConflictsOnly((v) => !v)}
          >
            <AlertTriangle className="h-4 w-4" />
            Conflicts{conflictCount > 0 ? ` (${conflictCount})` : ""}
          </Button>

          {(search || roleFilter.length > 0 || conflictsOnly) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setRoleFilter([]); setConflictsOnly(false); }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Roles</TableHead>
                <TableHead className="text-xs">School</TableHead>
                <TableHead className="text-xs">Joined</TableHead>
                <TableHead className="text-xs w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Shield className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    {(users?.length ?? 0) === 0
                      ? "No users found. Invite your first user!"
                      : "No users match these filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const manageable = canManage(u);
                  const conflict = hasRoleConflict(u.roles.map((r) => r.role));
                  const main = primaryRole(u.roles.map((r) => r.role));
                  return (
                    <TableRow key={u.userId}>
                      <TableCell className="font-medium">{u.fullName || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {conflict && (
                            <Badge variant="outline" className="gap-1 border-destructive/40 text-[11px] text-destructive">
                              <AlertTriangle className="h-3 w-3" /> Conflict
                            </Badge>
                          )}
                          {u.roles.map((r) => (
                            <Badge
                              key={r.role}
                              variant="outline"
                              className={`text-[11px] gap-1 ${roleBadgeClass[r.role] || ""}`}
                            >
                              {roleLabel(r.role)}
                              {r.role === main && u.roles.length > 1 && (
                                <span className="opacity-60">(main)</span>
                              )}
                              {manageable && u.roles.length > 1 && (
                                <button
                                  type="button"
                                  aria-label={`Remove ${roleLabel(r.role)} role`}
                                  className="ml-0.5 opacity-60 hover:opacity-100"
                                  onClick={() => handleRemoveRole(u.userId, r.role)}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {[...new Set(u.roles.map((r) => r.schoolName || "All"))].join(", ")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.joined).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {manageable && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Add another role"
                                onClick={() => { setAddRoleUser(u); setExtraRole(""); }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" aria-label="Remove user">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove user?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This removes all of {u.fullName || u.email}'s roles in your organisation. They will lose access.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleRemoveUser(u.userId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                          {u.userId === currentUser?.id && (
                            <span className="text-[11px] text-muted-foreground">You</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isLoading && (users?.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredUsers.length} of {users?.length} people
        </p>
      )}

      {/* Who changed whose roles, and when */}
      {canViewAudit && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b p-4">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Role activity</h2>
              <span className="text-xs text-muted-foreground">Last 50 changes</span>
            </div>
            {(auditLog?.length ?? 0) === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No role changes recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">When</TableHead>
                      <TableHead className="text-xs">Who</TableHead>
                      <TableHead className="text-xs">Affected user</TableHead>
                      <TableHead className="text-xs">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLog?.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{entry.actorName}</TableCell>
                        <TableCell className="text-sm">{entry.targetName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add an extra role to an existing user */}
      <Dialog open={!!addRoleUser} onOpenChange={(open) => { if (!open) setAddRoleUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a role</DialogTitle>
            <DialogDescription>
              {addRoleUser?.fullName || addRoleUser?.email} currently holds{" "}
              {addRoleUser?.roles.map((r) => roleLabel(r.role)).join(", ")}. Their most senior role
              decides which menus they see.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Additional role</Label>
              <Select value={extraRole} onValueChange={setExtraRole}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {addableRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addRoleUser?.roles.some((r) => r.role === "student") && (
                <p className="text-xs text-muted-foreground">
                  A student account can only also be a parent — staff and admin roles are not allowed
                  alongside it.
                </p>
              )}
              {addableRoles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No further roles can be added to this user.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRoleUser(null)}>Cancel</Button>
            <Button onClick={handleAddRole} disabled={savingRole || !extraRole}>
              {savingRole && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InviteLinkDialog invite={inviteLink} onClose={() => setInviteLink(null)} />
    </div>
  );
}
