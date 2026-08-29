import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Printer, Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { buildIdCardHtml, buildProfileQr, printIdCard, CR80, IdCardData } from "@/lib/id-card";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: IdCardData;
}

export function IdCardDialog({ open, onOpenChange, data }: Props) {
  const [cutGuides, setCutGuides] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    if (!open || !data.profileUrl) { setQr(null); return; }
    buildProfileQr(data.profileUrl).then((url) => { if (active) setQr(url); });
    return () => { active = false; };
  }, [open, data.profileUrl]);

  const card = useMemo<IdCardData>(() => ({ ...data, qrDataUrl: qr }), [data, qr]);
  const html = useMemo(() => buildIdCardHtml(card, { cutGuides, preview: true }), [card, cutGuides]);

  const handleDownload = async () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pages = Array.from(doc.querySelectorAll<HTMLElement>(".page"));
      const w = cutGuides ? CR80.width + CR80.bleed * 2 : CR80.width;
      const h = cutGuides ? CR80.height + CR80.bleed * 2 : CR80.height;
      const pdf = new jsPDF({ unit: "mm", format: [w, h], orientation: "landscape" });

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          backgroundColor: "#ffffff",
          scale: 4,
          useCORS: true,
          logging: false,
        });
        if (i > 0) pdf.addPage([w, h], "landscape");
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, w, h);
      }

      const safe = data.holderName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      pdf.save(`id-card-${safe}.pdf`);
    } catch (e) {
      toast({
        title: "Could not build the PDF",
        description: e instanceof Error ? e.message : "Please try printing instead.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data.holderKind} ID card</DialogTitle>
          <DialogDescription>
            Live preview at true CR80 size (85.6 × 54 mm). Front is page 1, back is page 2.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3">
          <iframe
            ref={frameRef}
            title="ID card preview"
            srcDoc={html}
            className="h-[520px] w-full rounded-md border-0 bg-transparent"
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="cut-guides" className="text-sm">Cut guides &amp; 3 mm bleed</Label>
            <p className="text-xs text-muted-foreground">
              Adds crop marks and a safe bleed so trimming never shifts the artwork.
            </p>
          </div>
          <Switch id="cut-guides" checked={cutGuides} onCheckedChange={setCutGuides} />
        </div>

        {!data.profileUrl && (
          <p className="text-xs text-muted-foreground">No profile link available, so the QR code is omitted.</p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="gap-1.5" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
          <Button className="gap-1.5" onClick={() => printIdCard(card, { cutGuides })}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          When printing, set scale to 100% and margins to “None” so the card keeps its exact size.
        </p>
      </DialogContent>
    </Dialog>
  );
}
