import { useState } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { UserPlus, Loader2, Shield, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/errors";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "proprietor", label: "Proprietor" },
  { value: "group_admin", label: "Group Admin" },
  { value: "school_admin", label: "School Admin" },
  { value: "principal", label: "Principal" },
  { value: "bursar", label: "Bursar" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "parent", label: "Parent" },
];

const roleBadgeClass: Record<string, string> = {
  super_admin: "bg-destructive/10 text-destructive border-destructive/20",
  proprietor: "bg-accent/10 text-accent border-accent/20",
  group_admin: "bg-accent/10 text-accent border-accent/20",
  school_admin: "bg-primary/10 text-primary border-primary/20",
  principal: "bg-success/10 text-success border-success/20",
  bursar: "bg-warning/10 text-warning border-warning/20",
  finance_officer: "bg-warning/10 text-warning border-warning/20",
  hr_admin: "bg-muted text-muted-foreground",
  teacher: "bg-muted text-muted-foreground",
  parent: "bg-muted text-muted-foreground",
};

export default function UserManagement() {
  const { userRole, orgId, schoolId, schools, user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [assignSchoolId, setAssignSchoolId] = useState("");
  const [inviting, setInviting] = useState(false);

  const [editingUser, setEditingUser] = useState<{ userId: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState("");
  const [updatingRole, setUpdatingRole] = useState(false);

  // Fetch all user roles in this org with profiles
  const { data: users, isLoading } = useQuery({
    queryKey: ["org-users", orgId, schoolId, userRole],
    queryFn: async () => {
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

      const userIds = data.map((r: any) => r.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      return data.map((r: any) => ({
        ...r,
        profile: profileMap.get(r.user_id) || { full_name: "Unknown", email: "" },
      }));
    },
    enabled: !!orgId,
  });

  // Role hierarchy: lower index = higher privilege
  const ROLE_RANK: Record<string, number> = {
    super_admin: 0, proprietor: 1, group_admin: 2, school_admin: 3,
    principal: 4, bursar: 5, finance_officer: 6, hr_admin: 7, teacher: 8, parent: 9,
  };
  const ADMIN_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar", "finance_officer", "hr_admin"];
  const callerRank = ROLE_RANK[userRole || ""] ?? 99;

  if (!ADMIN_ROLES.includes(userRole || "")) {
    return <Navigate to="/dashboard" replace />;
  }

  // Can only assign/see roles strictly below their own rank
  const availableRoles = ROLES.filter(r => (ROLE_RANK[r.value] ?? 99) > callerRank);

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
        ? `User ${email} created and assigned ${role} role`
        : `Existing user ${email} assigned ${role} role`
      );
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

  const handleUpdateRole = async () => {
    if (!editingUser || !newRole) return;
    setUpdatingRole(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "update_role", user_id: editingUser.userId, new_role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Role updated");
      setEditingUser(null);
      setNewRole("");
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update role"));
    } finally {
      setUpdatingRole(false);
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

  const formatRole = (r: string) => ROLES.find(x => x.value === r)?.label || r;

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description="Invite users and manage roles across your organisation.">
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
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
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">School</TableHead>
                <TableHead className="text-xs">Joined</TableHead>
                <TableHead className="text-xs w-24">Actions</TableHead>
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
                users?.map((u: any) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.profile.full_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.profile.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] ${roleBadgeClass[u.role] || ""}`}>
                        {formatRole(u.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{u.schools?.name || "All"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {u.user_id !== currentUser?.id && (ROLE_RANK[u.role] ?? 99) > callerRank && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => { setEditingUser({ userId: u.user_id, currentRole: u.role }); setNewRole(u.role); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove user?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove {u.profile.full_name || u.profile.email}'s role from your organisation. They will lose access.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRemoveUser(u.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                        {u.user_id === currentUser?.id && (
                          <span className="text-[11px] text-muted-foreground">You</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleUpdateRole} disabled={updatingRole}>
              {updatingRole && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
