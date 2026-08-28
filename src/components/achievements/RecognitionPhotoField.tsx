import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/common/ImageCropDialog";
import { usePhotoUrl } from "@/hooks/usePhotoUrl";
import {
  recognitionPhotoPath, removePhotoObject, uploadPhoto, validatePhoto,
} from "@/lib/photos";

interface Props {
  /** The recognition the photo belongs to (generated before the row is saved). */
  recognitionId: string;
  schoolId: string | null;
  value: string | null;
  onChange: (path: string | null) => Promise<void> | void;
  fallback?: string;
  size?: "sm" | "lg";
}

/**
 * Award photo with a square crop step. The wall and the certificates both show
 * the same square, so cropping here is what keeps the page looking tidy.
 */
export function RecognitionPhotoField({
  recognitionId, schoolId, value, onChange, fallback = "🏅", size = "lg",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = usePhotoUrl(value);

  const dimension = size === "lg" ? "h-20 w-20" : "h-12 w-12";

  const choose = (file: File | undefined) => {
    if (!file) return;
    const problem = validatePhoto(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setPicked(file);
    setCropOpen(true);
    if (inputRef.current) inputRef.current.value = "";
  };

  const save = async (cropped: File) => {
    if (!schoolId) {
      toast.error("Choose a school first");
      return;
    }
    setBusy(true);
    const previous = value;
    try {
      const path = await uploadPhoto(recognitionPhotoPath(schoolId, recognitionId, cropped), cropped);
      await onChange(path);
      if (previous && previous !== path) await removePhotoObject(previous);
      toast.success("Award photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the photo");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await onChange(null);
      await removePhotoObject(value);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Avatar className={`${dimension} rounded-lg border border-border`}>
        <AvatarImage src={url} alt="Award photo" className="object-cover" />
        <AvatarFallback className="rounded-lg bg-muted text-lg">{fallback}</AvatarFallback>
      </Avatar>

      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <Button type="button" size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {value ? "Change photo" : "Add photo"}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" className="gap-2 text-destructive" disabled={busy} onClick={clear}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        {size === "lg" && (
          <p className="text-xs text-muted-foreground">
            JPG, PNG or WebP up to 5MB. You will crop it to a square before it is saved.
          </p>
        )}
      </div>

      <ImageCropDialog open={cropOpen} onOpenChange={setCropOpen} file={picked} onCropped={save} />
    </div>
  );
}
