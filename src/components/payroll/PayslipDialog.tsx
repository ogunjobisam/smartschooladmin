import { useCallback, useMemo, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { buildPayslipHtml, payslipFileName, printPayslip, type PayslipData } from "@/lib/payslip";
import { downloadHtmlAsPdf } from "@/lib/pdf-export";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PayslipData | null;
}

/**
 * Shows one payslip and lets the holder keep it.
 *
 * The document is rendered into an iframe rather than into the page, so what is
 * previewed, printed and downloaded is byte-for-byte the same document. The
 * preview frame grows to the document's own height so the whole payslip is
 * visible, and the PDF is captured from a separate full-height render — a fixed
 * 560px frame used to clip the saved file halfway down the page.
 */
export function PayslipDialog({ open, onOpenChange, data }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [frameHeight, setFrameHeight] = useState(600);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(
    () => (data ? buildPayslipHtml(data, { preview: true }) : ""),
    [data],
  );

  /** Match the frame to its content so nothing is cut off or scrolled away. */
  const fitFrame = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const height = Math.max(
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
    );
    if (height > 0) setFrameHeight(height + 8);
  }, []);

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadHtmlAsPdf(buildPayslipHtml(data, { preview: true }), payslipFileName(data), {
        // One sheet per employee, always.
        singlePage: true,
      });
    } catch (e) {
      toast.error("Could not build the PDF", {
        description: e instanceof Error ? e.message : "Please try printing instead.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    if (!data) return;
    if (!printPayslip(data)) {
      toast.error("Could not open the print window", {
        description: "Your browser blocked the pop-up. Allow pop-ups for this site, or download the PDF instead.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payslip{data ? ` — ${data.periodLabel}` : ""}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.staffName}. Download a PDF to keep, or print it.`
              : "No payslip selected."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3">
          <iframe
            ref={frameRef}
            title="Payslip preview"
            srcDoc={html}
            onLoad={fitFrame}
            style={{ height: frameHeight }}
            className="w-full rounded-md border-0 bg-white"
          />
        </div>


        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="gap-1.5" onClick={handlePrint} disabled={!data}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button className="gap-1.5" onClick={handleDownload} disabled={downloading || !data}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
