import { useQuery } from "@tanstack/react-query";
import { getPhotoUrl, getPhotoUrls } from "@/lib/photos";

/** Signed photo link for one stored path. Refreshed well before it expires. */
export function usePhotoUrl(path: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["photo-url", path],
    queryFn: () => getPhotoUrl(path),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });
  return data ?? undefined;
}

/** Signed photo links for a list (student and staff tables), keyed by path. */
export function usePhotoUrls(paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).sort().join("|");
  const { data } = useQuery({
    queryKey: ["photo-urls", key],
    queryFn: () => getPhotoUrls(paths),
    enabled: !!key,
    staleTime: 30 * 60 * 1000,
  });
  return data ?? {};
}
