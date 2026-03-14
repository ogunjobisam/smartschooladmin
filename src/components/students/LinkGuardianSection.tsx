import { useState } from "react";
import { Plus, X, Search, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

interface LinkGuardianSectionProps {
  studentId: string;
  guardians: any[];
  onRefresh: () => void;
}

export function LinkGuardianSection({ studentId, guardians, onRefresh }: LinkGuardianSectionProps) {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const [showLink, setShowLink] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGuardianId, setSelectedGuardianId] = useState("");
  const [relationship, setRelationship] = useState("parent");

  // Fetch all guardians in org for linking
  const { data: allGuardians } = useQuery({
    queryKey: ["all-guardians", orgId, searchTerm],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("guardians")
        .select("id, first_name, last_name, phone, email")
        .eq("org_id", orgId)
        .order("last_name")
        .limit(20);
      if (searchTerm) {
        query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!orgId && showLink,
  });

  const linkedGuardianIds = new Set(guardians?.map((g: any) => g.guardians?.id).filter(Boolean));

  const availableGuardians = allGuardians?.filter(g => !linkedGuardianIds.has(g.id)) || [];

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuardianId) throw new Error("Please select a guardian");
      const { error } = await supabase
        .from("student_guardians")
        .insert({
          student_id: studentId,
          guardian_id: selectedGuardianId,
          relationship,
          is_primary: guardians?.length === 0,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-guardians", studentId] });
      toast({ title: "Guardian linked", description: "Guardian has been linked to this student." });
      setShowLink(false);
      setSelectedGuardianId("");
      setSearchTerm("");
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("student_guardians")
        .delete()
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-guardians", studentId] });
      toast({ title: "Guardian unlinked" });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-card-foreground">Linked Guardians</h4>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowLink(true)}>
          <UserPlus className="h-3.5 w-3.5" /> Link Guardian
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Relationship</TableHead>
              <TableHead className="text-xs">Phone</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Primary</TableHead>
              <TableHead className="text-xs w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guardians?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No guardians linked.</TableCell></TableRow>
            ) : (
              guardians?.map((sg: any) => (
                <TableRow key={sg.id}>
                  <TableCell className="font-medium">{sg.guardians?.first_name} {sg.guardians?.last_name}</TableCell>
                  <TableCell className="capitalize">{sg.relationship || "—"}</TableCell>
                  <TableCell className="font-mono text-sm tabular-nums">{sg.guardians?.phone || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{sg.guardians?.email || "—"}</TableCell>
                  <TableCell>{sg.is_primary ? <StatusBadge status="active" /> : "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => unlinkMutation.mutate(sg.id)}
                      disabled={unlinkMutation.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showLink} onOpenChange={setShowLink}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Guardian</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search guardians by name or phone…"
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-1">
              {availableGuardians.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">No guardians found. Create one on the Guardians page first.</p>
              ) : (
                availableGuardians.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selectedGuardianId === g.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedGuardianId(g.id)}
                  >
                    <span className="font-medium">{g.first_name} {g.last_name}</span>
                    <span className="text-xs text-muted-foreground">{g.phone || g.email || ""}</span>
                  </button>
                ))
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                  <SelectItem value="uncle">Uncle</SelectItem>
                  <SelectItem value="aunt">Aunt</SelectItem>
                  <SelectItem value="sibling">Sibling</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLink(false)}>Cancel</Button>
            <Button onClick={() => linkMutation.mutate()} disabled={!selectedGuardianId || linkMutation.isPending}>
              {linkMutation.isPending ? "Linking…" : "Link Guardian"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
