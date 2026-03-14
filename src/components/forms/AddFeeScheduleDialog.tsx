import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface FeeItem {
  description: string;
  amount: string;
  categoryId: string;
}

export function AddFeeScheduleDialog({ children }: { children: React.ReactNode }) {
  const { schoolId, orgId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [items, setItems] = useState<FeeItem[]>([{ description: "", amount: "", categoryId: "" }]);

  const { data: classes } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return data || [];
    },
    enabled: !!schoolId && open,
  });

  const { data: periods } = useQuery({
    queryKey: ["academic-periods-active", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, academic_years!inner(org_id)")
        .eq("academic_years.org_id", orgId!)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!orgId && open,
  });

  const { data: categories } = useQuery({
    queryKey: ["fee-categories", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("fee_categories").select("id, name").eq("org_id", orgId).order("name");
      return data || [];
    },
    enabled: !!orgId && open,
  });

  const addItem = () => setItems([...items, { description: "", amount: "", categoryId: "" }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: keyof FeeItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error("Please enter a schedule name.");
    if (!schoolId) return toast.error("No school selected.");
    const validItems = items.filter(i => i.description.trim() && parseFloat(i.amount) > 0);
    if (validItems.length === 0) return toast.error("Add at least one fee item with a valid amount.");

    setLoading(true);
    try {
      // Insert fee schedule
      const { data: schedule, error: schedError } = await supabase
        .from("fee_schedules")
        .insert({
          name: name.trim(),
          school_id: schoolId,
          class_id: classId || null,
          academic_period_id: periodId || null,
          total_amount: Math.round(totalAmount * 100), // store in minor units
          is_active: true,
        })
        .select("id")
        .single();

      if (schedError) throw schedError;

      // Insert fee items as invoice_items template? 
      // The schema doesn't have a fee_schedule_items table, so we store total_amount on the schedule.
      // We can use fee_categories for categorization.

      toast.success("Fee schedule created successfully!");
      queryClient.invalidateQueries({ queryKey: ["fee-schedules"] });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Failed to create fee schedule.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setClassId("");
    setPeriodId("");
    setItems([{ description: "", amount: "", categoryId: "" }]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Fee Schedule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="schedule-name">Schedule Name *</Label>
            <Input id="schedule-name" placeholder="e.g. Term 1 Fees – JSS1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Class (optional)</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Academic Period (optional)</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Fee Items</Label>
              <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={addItem}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Description (e.g. Tuition)"
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={item.amount}
                        onChange={(e) => updateItem(i, "amount", e.target.value)}
                        className="flex-1"
                      />
                      {categories && categories.length > 0 && (
                        <Select value={item.categoryId} onValueChange={(v) => updateItem(i, "categoryId", v)}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="mt-1 text-destructive" onClick={() => removeItem(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Total Amount</span>
            <span className="text-lg font-bold tabular-nums">{totalAmount.toLocaleString()}</span>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating…" : "Create Fee Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
