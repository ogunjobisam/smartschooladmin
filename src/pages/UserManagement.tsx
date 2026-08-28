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
import { UserPlus, Loader2, Shield, Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/errors";
import {
  ROLES, ROLE_RANK, ADMIN_ROLES, roleBadgeClass, roleLabel,
  roleAllowedAlongside, rolesCompatible, primaryRole,
} from "@/lib/roles";

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

  const callerRank = ROLE_RANK[userRole || ""] ?? 99;

  if (!ADMIN_ROLES.includes(userRole || "")) {
    return <Navigate to="/dashboard" replace />;
  }

  // Can only assign/see roles strictly below their own rank
  const availableRoles = ROLES.filter((r) => (ROLE_RANK[r.value] ?? 99) > callerRank);

  // Roles that may be added to the selected user without clashing with what they hold.
  const addableRoles = useMemo(() => {
    if (!addRoleUser) return [];
    const held = addRoleUser.roles.map((r) => r.role);
    return availableRoles.filter((r) => roleAllowedAlongside(r.value, held));
  }, [addRoleUser, availableRoles]);

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
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove user"));
    }
  };

  /** The caller may manage a person only if they outrank all of their roles. */
  const canManage = (u: UserRow) =>
    u.userId !== currentUser?.id && u.roles.every((r) => (ROLE_RANK[r.role] ?? 99) > callerRank);

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
              ) : users?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Shield className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    No users found. Invite your first user!
                  </TableCell>
                </TableRow>
              ) : (
                users?.map((u) => {
                  const manageable = canManage(u);
                  const main = primaryRole(u.roles.map((r) => r.role));
                  return (
                    <TableRow key={u.userId}>
                      <TableCell className="font-medium">{u.fullName || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
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

      <InviteLinkDialog
        open={!!inviteLink}
        onOpenChange={(open) => { if (!open) setInviteLink(null); }}
        email={inviteLink?.email ?? ""}
        link={inviteLink?.link ?? ""}
      />
    </div>
  );
}
