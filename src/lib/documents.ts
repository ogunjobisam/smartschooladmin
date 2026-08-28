import { supabase } from "@/integrations/supabase/client";

/** Private bucket holding student, staff, invoice and payroll documents. */
export const DOCUMENTS_BUCKET = "school-documents";

/** Public bucket holding school branding logos only. */
export const ASSETS_BUCKET = "school-assets";

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Rows written before documents moved to a private bucket stored an absolute
 * public URL. Newer rows store a storage path.
 */
export function isLegacyPublicUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

export function storagePathFor(schoolId: string, entityType: string, entityId: string, fileName: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : undefined;
  const safeName = `${Date.now()}${ext ? `.${ext}` : ""}`;
  return `${schoolId}/documents/${entityType}/${entityId}/${safeName}`;
}

/**
 * A short-lived URL for opening a document.
 *
 * Documents live in a private bucket, so there is no permanent link to hand out —
 * which is the point: student medical and identification files should not be
 * readable by anyone who happens to have the URL.
 */
export async function getDocumentUrl(fileUrl: string): Promise<string> {
  if (isLegacyPublicUrl(fileUrl)) return fileUrl;

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(fileUrl, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not open this document");
  }
  return data.signedUrl;
}

/** Remove the underlying object. Legacy rows still point at the old public bucket. */
export async function removeDocumentObject(fileUrl: string): Promise<void> {
  if (isLegacyPublicUrl(fileUrl)) {
    const [, path] = fileUrl.split(`/${ASSETS_BUCKET}/`);
    if (path) await supabase.storage.from(ASSETS_BUCKET).remove([path]);
    return;
  }
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([fileUrl]);
}
