import { useState, useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface ColumnMapping {
  csvHeader: string;
  dbField: string;
}

interface ParsedRow {
  data: Record<string, string>;
  errors: string[];
  rowNum: number;
}

type ImportMode = "students" | "staff";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ImportMode;
}

const STUDENT_FIELDS = [
  { value: "__skip__", label: "— Skip —" },
  { value: "first_name", label: "First Name *" },
  { value: "last_name", label: "Last Name *" },
  { value: "student_id_number", label: "Student ID" },
  { value: "gender", label: "Gender" },
  { value: "date_of_birth", label: "Date of Birth" },
  { value: "student_type", label: "Type (day/boarding)" },
  { value: "address", label: "Address" },
];

const STAFF_FIELDS = [
  { value: "__skip__", label: "— Skip —" },
  { value: "first_name", label: "First Name *" },
  { value: "last_name", label: "Last Name *" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "staff_id_number", label: "Staff ID" },
  { value: "gender", label: "Gender" },
  { value: "date_of_birth", label: "Date of Birth" },
  { value: "employment_date", label: "Employment Date" },
];

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

function autoMapColumns(csvHeaders: string[], fields: { value: string; label: string }[]): ColumnMapping[] {
  const fieldLookup: Record<string, string> = {};
  // Build a fuzzy lookup
  fields.forEach(f => {
    if (f.value === "__skip__") return;
    const key = f.value.replace(/_/g, "").toLowerCase();
    fieldLookup[key] = f.value;
    // Also map common aliases
    const label = f.label.replace(/\s*\*\s*$/, "").replace(/\s+/g, "").toLowerCase();
    fieldLookup[label] = f.value;
  });
  // Extra aliases
  fieldLookup["firstname"] = "first_name";
  fieldLookup["lastname"] = "last_name";
  fieldLookup["surname"] = "last_name";
  fieldLookup["dob"] = "date_of_birth";
  fieldLookup["dateofbirth"] = "date_of_birth";
  fieldLookup["studentid"] = "student_id_number";
  fieldLookup["staffid"] = "staff_id_number";
  fieldLookup["idnumber"] = "student_id_number";
  fieldLookup["emailaddress"] = "email";
  fieldLookup["phonenumber"] = "phone";
  fieldLookup["employmentdate"] = "employment_date";
  fieldLookup["hiredate"] = "employment_date";
  fieldLookup["type"] = "student_type";

  const usedFields = new Set<string>();
  return csvHeaders.map(h => {
    const normalized = h.replace(/[\s_-]/g, "").toLowerCase();
    const match = fieldLookup[normalized];
    if (match && !usedFields.has(match)) {
      usedFields.add(match);
      return { csvHeader: h, dbField: match };
    }
    return { csvHeader: h, dbField: "__skip__" };
  });
}

function validateRow(row: Record<string, string>, mode: ImportMode): string[] {
  const errors: string[] = [];
  if (!row.first_name?.trim()) errors.push("First name is required");
  if (!row.last_name?.trim()) errors.push("Last name is required");
  if (row.first_name && row.first_name.length > 100) errors.push("First name too long");
  if (row.last_name && row.last_name.length > 100) errors.push("Last name too long");
  if (mode === "staff" && row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push("Invalid email");
  }
  if (row.gender && !["Male", "Female", "Other", "male", "female", "other", "M", "F"].includes(row.gender)) {
    errors.push("Invalid gender");
  }
  return errors;
}

function normalizeGender(val: string): string | null {
  if (!val) return null;
  const lower = val.toLowerCase().trim();
  if (lower === "m" || lower === "male") return "Male";
  if (lower === "f" || lower === "female") return "Female";
  if (lower === "other") return "Other";
  return null;
}

export function CsvImportDialog({ open, onOpenChange, mode }: CsvImportDialogProps) {
  const { schoolId, orgId } = useAuth();
  const [importClassId, setImportClassId] = useState<string>("");

  // Imported students have to land in a class, or they are invisible to
  // attendance, exams and class-based invoicing.
  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes").select("id, name").eq("school_id", schoolId!).order("level_order");
      return data || [];
    },
    enabled: !!schoolId && open && mode === "students",
  });

  const { data: currentPeriod } = useQuery({
    queryKey: ["current-period", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, academic_years!inner(org_id)")
        .eq("is_current", true)
        .eq("academic_years.org_id", orgId!)
        .order("start_date")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId && open && mode === "students",
  });
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fields = mode === "students" ? STUDENT_FIELDS : STAFF_FIELDS;

  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState({ inserted: 0, skipped: 0 });

  const reset = useCallback(() => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMappings([]);
    setParsedRows([]);
    setResult({ inserted: 0, skipped: 0 });
    setImportClassId("");
  }, []);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) {
        toast({ title: "Invalid file", description: "No data found in the CSV.", variant: "destructive" });
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMappings(autoMapColumns(headers, fields));
      setStep("map");
    };
    reader.readAsText(file);
  }, [fields]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleMapChange = (csvHeader: string, dbField: string) => {
    setMappings(prev => prev.map(m => m.csvHeader === csvHeader ? { ...m, dbField } : m));
  };

  const processPreview = () => {
    const rows: ParsedRow[] = csvRows.map((row, idx) => {
      const data: Record<string, string> = {};
      mappings.forEach((m, colIdx) => {
        if (m.dbField !== "__skip__" && row[colIdx] !== undefined) {
          data[m.dbField] = row[colIdx];
        }
      });
      const errors = validateRow(data, mode);
      return { data, errors, rowNum: idx + 2 }; // +2 for 1-indexed + header row
    });
    setParsedRows(rows);
    setStep("preview");
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school selected");
      if (mode === "students") {
        if (!importClassId) throw new Error("Choose a class for these students");
        if (!currentPeriod) throw new Error("No current term is set. Set one under Settings → Academic Years first.");
      }
      const validRows = parsedRows.filter(r => r.errors.length === 0);
      if (validRows.length === 0) throw new Error("No valid rows to import");

      let inserted = 0;
      // Batch in groups of 50
      for (let i = 0; i < validRows.length; i += 50) {
        const batch = validRows.slice(i, i + 50);
        if (mode === "students") {
          const records = batch.map(r => ({
            first_name: r.data.first_name.trim(),
            last_name: r.data.last_name.trim(),
            student_id_number: r.data.student_id_number?.trim() || null,
            gender: normalizeGender(r.data.gender || "") || null,
            date_of_birth: r.data.date_of_birth?.trim() || null,
            student_type: r.data.student_type?.toLowerCase() === "boarding" ? "boarding" : "day",
            address: r.data.address?.trim() || null,
            school_id: schoolId,
          }));
          const { data: created, error } = await supabase
            .from("students")
            .insert(records)
            .select("id");
          if (error) throw error;

          // Enrol them, in the same step. Imported students used to be created
          // with no enrolment at all, so they showed in the Students list but
          // belonged to no class — invisible to attendance, exams and
          // class-based invoicing, with nothing to explain why.
          if (created?.length) {
            const { error: enrolError } = await supabase.from("enrolments").insert(
              created.map((student) => ({
                student_id: student.id,
                class_id: importClassId,
                academic_period_id: currentPeriod!.id,
              }))
            );
            if (enrolError) throw enrolError;
          }

          inserted += records.length;
        } else {
          const records = batch.map(r => ({
            first_name: r.data.first_name.trim(),
            last_name: r.data.last_name.trim(),
            email: r.data.email?.trim() || null,
            phone: r.data.phone?.trim() || null,
            staff_id_number: r.data.staff_id_number?.trim() || null,
            gender: normalizeGender(r.data.gender || "") || null,
            date_of_birth: r.data.date_of_birth?.trim() || null,
            employment_date: r.data.employment_date?.trim() || null,
            school_id: schoolId,
          }));
          const { error } = await supabase.from("staff").insert(records);
          if (error) throw error;
          inserted += records.length;
        }
      }

      return { inserted, skipped: parsedRows.length - validRows.length };
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: [mode === "students" ? "students" : "staff"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const validCount = parsedRows.filter(r => r.errors.length === 0).length;
  const errorCount = parsedRows.filter(r => r.errors.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import {mode === "students" ? "Students" : "Staff"} from CSV</DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/25 p-10 text-center transition-colors hover:border-primary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Drag & drop a CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Required columns: First Name, Last Name. Max 500 rows per import.
            </p>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found <strong>{csvRows.length}</strong> rows and <strong>{csvHeaders.length}</strong> columns. Map each CSV column to a field:
            </p>
            <div className="space-y-2">
              {mappings.map((m) => (
                <div key={m.csvHeader} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm font-mono text-muted-foreground">{m.csvHeader}</span>
                  <span className="text-muted-foreground">→</span>
                  <Select value={m.dbField} onValueChange={(v) => handleMapChange(m.csvHeader, v)}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fields.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={processPreview} disabled={!mappings.some(m => m.dbField === "first_name") || !mappings.some(m => m.dbField === "last_name")}>
                Preview Data
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> {validCount} valid
              </Badge>
              {errorCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" /> {errorCount} errors
                </Badge>
              )}
            </div>

            {mode === "students" && (
              <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
                <Label htmlFor="import-class">Enrol these students into</Label>
                <Select value={importClassId} onValueChange={setImportClassId}>
                  <SelectTrigger id="import-class" className="bg-background">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {currentPeriod
                    ? `They will be enrolled for ${currentPeriod.name}. Without a class they would not appear in attendance or exams.`
                    : "No current term is set. Set one under Settings → Academic Years before importing."}
                </p>
              </div>
            )}
            <ScrollArea className="h-[300px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-12">Row</TableHead>
                    <TableHead className="text-xs">First Name</TableHead>
                    <TableHead className="text-xs">Last Name</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 100).map((r) => (
                    <TableRow key={r.rowNum}>
                      <TableCell className="text-xs text-muted-foreground font-mono">{r.rowNum}</TableCell>
                      <TableCell className="text-sm">{r.data.first_name || "—"}</TableCell>
                      <TableCell className="text-sm">{r.data.last_name || "—"}</TableCell>
                      <TableCell>
                        {r.errors.length === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <span className="text-xs text-destructive">{r.errors.join(", ")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            {parsedRows.length > 100 && (
              <p className="text-xs text-muted-foreground">Showing first 100 of {parsedRows.length} rows.</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={
                  importMutation.isPending ||
                  validCount === 0 ||
                  (mode === "students" && (!importClassId || !currentPeriod))
                }
              >
                {importMutation.isPending ? "Importing…" : `Import ${validCount} ${mode === "students" ? "Students" : "Staff"}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <div>
              <p className="text-lg font-semibold">Import Complete</p>
              <p className="text-sm text-muted-foreground mt-1">
                Successfully imported <strong>{result.inserted}</strong> {mode === "students" ? "students" : "staff members"}.
                {result.skipped > 0 && <> <strong>{result.skipped}</strong> rows skipped due to errors.</>}
              </p>
            </div>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
