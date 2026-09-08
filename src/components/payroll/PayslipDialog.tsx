import { useMemo, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { buildPayslipHtml, payslipFileName, printPayslip, type PayslipData } from "@/lib/payslip";

/** A4 portrait, in millimetres — the paper a payslip is filed on. */
const A4 = { width: 210, height: 297 };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PayslipData | null;
}

/**
 * Shows one payslip and lets the holder keep it.
 *
 * The document is rendered into an iframe rather than into the page, so what is
 * previewed, printed and downloaded is byte-for-byte the same document — the
 * previous version scraped the app's own DOM, which meant the printed copy looked
 * nothing like the screen and carried none of the school's branding.
 */
export function PayslipDialog({ open, onOpenChange, data }: Props) {
  const [downloading, setDownloading] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(
    () => (data ? buildPayslipHtml(data, { preview: true }) : ""),
    [data],
  );

  const handleDownload = async () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !data) return;
    setDownloading(true);
    try {
      // Kept out of the main bundle: neither library is needed until someone
      // actually asks for a file.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(doc.body, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true, // the school logo is served from the assets bucket
        logging: false,
      });

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const width = A4.width;
      let height = (canvas.height / canvas.width) * width;
      let x = 0;
      // A payslip is a single page, but scale to fit rather than crop if a long
      // school name or address ever pushes it over — losing the net pay off the
      // bottom edge would be far worse than a slightly smaller document.
      if (height > A4.height) {
        const shrink = A4.height / height;
        height = A4.height;
        x = (A4.width - width * shrink) / 2;
      }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", x, 0, width, height);
      pdf.save(`${payslipFileName(data)}.pdf`);
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
            className="h-[560px] w-full rounded-md border-0 bg-white"
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
