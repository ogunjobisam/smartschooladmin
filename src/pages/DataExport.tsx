import { useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EXPORT_DATASETS, runExport, type ExportClient, type ExportProgress } from "@/lib/data-export";
import { logAudit } from "@/lib/audit";

const ALL_KEYS = EXPORT_DATASETS.map((d) => d.key);

function downloadZip(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking straight away cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function DataExport() {
  const { orgId, user } = useAuth();
  const [selected, setSelected] = useState<string[]>(ALL_KEYS);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);

  const allSelected = selected.length === ALL_KEYS.length;

  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));

  const start = async () => {
    if (!orgId || selected.length === 0) return;
    setRunning(true);
    setProgress(null);
    try {
      const now = new Date();
      const result = await runExport({
        client: supabase as unknown as ExportClient,
        orgId,
        datasetKeys: selected,
        exportedBy: user?.email ?? null,
        now,
        onProgress: setProgress,
      });
      const scope = allSelected ? "full" : "partial";
      downloadZip(result.zip, `smartschool-${scope}-export-${now.toISOString().slice(0, 10)}.zip`);
      await logAudit({
        orgId,
        userId: user?.id,
        action: "export",
        entityType: "data_export",
        detail: `Exported ${selected.length} of ${ALL_KEYS.length} data sets (${result.totalRows.toLocaleString()} rows)`,
        newValues: { datasets: selected, counts: result.counts },
      });
      toast.success(`Export ready — ${result.totalRows.toLocaleString()} rows downloaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? `Export failed: ${error.message}` : "Export failed.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const percent = progress ? Math.round((progress.tableIndex / progress.tableCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Export"
        description="Download your school's records as spreadsheets — everything, or just the parts you need."
      />

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          The export contains personal data about pupils, families and staff. Keep the file somewhere
          safe and share it only with people entitled to see it. Staff bank details and uploaded files
          are never included.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">What to include</CardTitle>
            <CardDescription>Each set becomes a folder of CSV files that open in Excel or Google Sheets.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => setSelected(allSelected ? [] : ALL_KEYS)}
          >
            {allSelected ? "Clear all" : "Select all"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {EXPORT_DATASETS.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50">
              <Checkbox
                className="mt-0.5"
                checked={selected.includes(d.key)}
                disabled={running}
                onCheckedChange={(v) => toggle(d.key, v === true)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{d.label}</span>
                <span className="block text-xs text-muted-foreground">{d.description}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      {running && (
        <div className="space-y-2">
          <Progress value={percent} />
          <p className="text-xs text-muted-foreground">
            {progress
              ? `Reading ${progress.table.replace(/_/g, " ")} (${progress.tableIndex + 1} of ${progress.tableCount})${progress.rows ? ` — ${progress.rows.toLocaleString()} rows` : ""}`
              : "Starting…"}
          </p>
        </div>
      )}

      <Button onClick={start} disabled={running || selected.length === 0 || !orgId}>
        <Download className="mr-2 h-4 w-4" />
        {running ? "Preparing export…" : allSelected ? "Download everything" : "Download selected"}
      </Button>
    </div>
  );
}
