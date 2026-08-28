import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { usePhotoUrl } from "@/hooks/usePhotoUrl";
import { removePhotoObject, uploadPhoto, validatePhoto } from "@/lib/photos";

interface PhotoUploadProps {
  /** Current stored path (or legacy absolute URL). */
  value: string | null | undefined;
  /** Where a newly chosen file should be filed. */
  pathFor: (file: File) => string;
  /** Persist the new path — or null when the photo is removed. */
  onSaved: (path: string | null) => Promise<void>;
  /** Shown when there is no photo. */
  fallback: string;
  label?: string;
  hint?: string;
  size?: "sm" | "lg";
  /** Read-only viewers still see the photo, just no controls. */
  editable?: boolean;
}

/**
 * Avatar plus the controls to change it. Used for students, staff and a user's
 * own account, so the caller decides where the file is filed and how the new
 * path is saved.
 */
export function PhotoUpload({
  value, pathFor, onSaved, fallback, label = "Photo", hint, size = "lg", editable = true,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const signedUrl = usePhotoUrl(value);

  const dimension = size === "lg" ? "h-24 w-24" : "h-14 w-14";

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const problem = validatePhoto(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const previous = value;
    try {
      const path = await uploadPhoto(pathFor(file), file);
      await onSaved(path);
      // Only bin the old file once the new one is safely recorded.
      if (previous && previous !== path) await removePhotoObject(previous);
      toast.success(`${label} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not upload the ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await onSaved(null);
      await removePhotoObject(value);
      toast.success(`${label} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not remove the ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className={`${dimension} rounded-lg border border-border`}>
        <AvatarImage src={signedUrl} alt={label} className="object-cover" />
        <AvatarFallback className="rounded-lg bg-muted text-base font-medium">{fallback}</AvatarFallback>
      </Avatar>

      {editable && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {value ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" className="gap-2 text-destructive" disabled={busy} onClick={clear}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {hint ?? "JPG, PNG or WebP, up to 5MB. A square head-and-shoulders photo works best."}
          </p>
        </div>
      )}
    </div>
  );
}
