import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

const FRAME = 264; // on-screen crop window, in px
const OUTPUT = 720; // exported square, in px

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The file the user picked. */
  file: File | null;
  /** Receives the cropped square image, ready to upload. */
  onCropped: (file: File) => Promise<void> | void;
  title?: string;
  description?: string;
}

/**
 * Square crop for award photos. Every image on the wall and on a certificate is
 * the same shape, so a portrait snapped on a phone does not sit next to a
 * landscape one and make the page look untidy. Drag to position, slide to zoom.
 */
export function ImageCropDialog({
  open, onOpenChange, file, onCropped,
  title = "Position the photo",
  description = "Drag to move and zoom until the face fills the frame. The photo is saved as a square.",
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = natural ? FRAME / Math.min(natural.w, natural.h) : 1;
  const scale = base * zoom;
  const dispW = natural ? natural.w * scale : FRAME;
  const dispH = natural ? natural.h * scale : FRAME;

  const clamp = useCallback(
    (next: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(FRAME - dispW, next.x)),
      y: Math.min(0, Math.max(FRAME - dispH, next.y)),
    }),
    [dispW, dispH],
  );

  // Keep the picture covering the frame whenever the zoom changes.
  useEffect(() => {
    setOffset((prev) => clamp(prev));
  }, [clamp]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    const b = FRAME / Math.min(img.naturalWidth, img.naturalHeight);
    setOffset({
      x: (FRAME - img.naturalWidth * b) / 2,
      y: (FRAME - img.naturalHeight * b) / 2,
    });
  };

  const startDrag = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(
      clamp({
        x: drag.current.ox + (e.clientX - drag.current.x),
        y: drag.current.oy + (e.clientY - drag.current.y),
      }),
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  const confirm = async () => {
    if (!src || !natural || !file) return;
    setBusy(true);
    try {
      const image = new Image();
      image.src = src;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser could not process the image");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);

      const sourceSize = FRAME / scale;
      ctx.drawImage(
        image,
        -offset.x / scale,
        -offset.y / scale,
        sourceSize,
        sourceSize,
        0,
        0,
        OUTPUT,
        OUTPUT,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Your browser could not process the image");

      const cropped = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
      await onCropped(cropped);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative overflow-hidden rounded-lg border bg-muted"
            style={{ width: FRAME, height: FRAME, touchAction: "none", cursor: "grab" }}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {src && (
              <img
                src={src}
                alt=""
                draggable={false}
                onLoad={onImageLoad}
                className="select-none"
                style={{
                  position: "absolute",
                  left: offset.x,
                  top: offset.y,
                  width: dispW,
                  height: dispH,
                  maxWidth: "none",
                }}
              />
            )}
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-border" />
          </div>

          <div className="flex w-full items-center gap-3">
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.01}
              onValueChange={([v]) => setZoom(v)}
              aria-label="Zoom"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || !natural}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Use photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
