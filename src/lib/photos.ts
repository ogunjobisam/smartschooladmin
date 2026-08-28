import { supabase } from "@/integrations/supabase/client";

/**
 * Private bucket holding people photos: students, staff and personal account
 * pictures. Deliberately not the public assets bucket — a child's photograph
 * should not be readable by anyone who guesses the URL.
 */
export const PHOTOS_BUCKET = "profile-photos";

/** Signed links are cheap to mint, so keep them short-lived. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PhotoSubject = "students" | "staff";

function extensionFor(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (fromName && fromName.length <= 5) return fromName;
  return file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
}

/** Photos of school members are filed under the school so staff access follows it. */
export function schoolPhotoPath(schoolId: string, subject: PhotoSubject, subjectId: string, file: File): string {
  return `${schoolId}/${subject}/${subjectId}-${Date.now()}.${extensionFor(file)}`;
}

/** A user's own account picture is filed under them, not a school. */
export function accountPhotoPath(userId: string, file: File): string {
  return `users/${userId}/avatar-${Date.now()}.${extensionFor(file)}`;
}

export function validatePhoto(file: File): string | null {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG or WebP image.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return "That image is larger than 5MB. Please choose a smaller one.";
  }
  return null;
}

/** Legacy rows (and school logos) stored an absolute public URL rather than a path. */
export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Turns a stored photo path into something an `<img>` can load.
 * Returns null rather than throwing: a missing photo is not an error worth
 * interrupting a page for.
 */
export async function getPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (isAbsoluteUrl(path)) return path;

  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Resolve several photos at once, keyed by the stored path. */
export async function getPhotoUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p && !isAbsoluteUrl(p))));
  const result: Record<string, string> = {};
  for (const path of paths) {
    if (path && isAbsoluteUrl(path)) result[path] = path;
  }
  if (!unique.length) return result;

  const { data } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  data?.forEach((entry, index) => {
    const path = unique[index];
    if (entry.signedUrl) result[path] = entry.signedUrl;
  });
  return result;
}

export async function uploadPhoto(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}

/** Best-effort removal — a stale object is harmless next to a broken save. */
export async function removePhotoObject(path: string | null | undefined): Promise<void> {
  if (!path || isAbsoluteUrl(path)) return;
  await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
}

export function initialsFrom(...parts: (string | null | undefined)[]): string {
  const letters = parts
    .map((p) => p?.trim()?.[0])
    .filter(Boolean)
    .join("");
  return (letters || "?").slice(0, 2).toUpperCase();
}
