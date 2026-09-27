import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { admissionsUrl, slugProblem, toSlug } from "@/lib/admissions";
import { getErrorMessage } from "@/lib/errors";

interface AdmissionsSettingsTabProps {
  schoolId: string | null;
  canManage: boolean;
}

/**
 * The controls behind the public application page: its address, whether it is
 * accepting applications, and what it says at the top.
 */
export function AdmissionsSettingsTab({ schoolId, canManage }: AdmissionsSettingsTabProps) {
  const queryClient = useQueryClient();

  const { data: school, isLoading } = useQuery({
    queryKey: ["school-admissions-settings", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, admissions_slug, admissions_open, admissions_intro")
        .eq("id", schoolId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const [slug, setSlug] = useState("");
  const [intro, setIntro] = useState("");

  useEffect(() => {
    if (!school) return;
    setSlug(school.admissions_slug || toSlug(school.name));
    setIntro(school.admissions_intro || "");
  }, [school]);

  const save = useMutation({
    mutationFn: async (patch: { admissions_slug?: string; admissions_open?: boolean; admissions_intro?: string | null }) => {
      const { error } = await supabase.from("schools").update(patch).eq("id", schoolId!);
      if (error) {
        // The slug index is unique across every school on the platform.
        if (error.code === "23505") {
          throw new Error("Another school already uses that link. Try a different one.");
        }
        // Rejected by schools_validate_web_address(); its message is written
        // for the office, so show it as it is.
        if (error.code === "23514") throw new Error(error.message);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Admissions settings saved");
      queryClient.invalidateQueries({ queryKey: ["school-admissions-settings"] });
      queryClient.invalidateQueries({ queryKey: ["school-admissions"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not save admissions settings")),
  });

  if (isLoading || !school) return <Skeleton className="h-64 w-full" />;

  const cleanedSlug = toSlug(slug);
  // Deliberately the slug the school has saved, not the one being typed: a link
  // built from unsaved input points nowhere, which is how Copy and Open came to
  // hand out `/apply/` with nothing after it.
  const savedSlug = school.admissions_slug;
  const publicUrl = savedSlug ? admissionsUrl(savedSlug, window.location.origin) : null;
  const unsavedSlug = cleanedSlug !== (savedSlug ?? "");
  const slugError = cleanedSlug ? slugProblem(cleanedSlug, savedSlug) : null;

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy", { description: publicUrl });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Public application form</CardTitle>
        <CardDescription>
          Share one link and applications land in Admissions instead of in a notebook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Accepting applications</p>
            <p className="text-xs text-muted-foreground">
              When this is off the page still loads, but tells families to contact the
              school instead of taking their details.
            </p>
          </div>
          <Switch
            checked={school.admissions_open}
            disabled={!canManage || save.isPending}
            onCheckedChange={(checked) => save.mutate({ admissions_open: checked })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admissions-slug">Application link</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{window.location.origin}/apply/</span>
            <Input
              id="admissions-slug"
              className="h-9 w-56"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canManage}
            />
          </div>
          {cleanedSlug !== slug && slug !== "" && (
            <p className="text-xs text-muted-foreground">Will be saved as <code>{cleanedSlug}</code>.</p>
          )}
          {slugError && <p className="text-xs text-destructive">{slugError}</p>}
          {unsavedSlug && cleanedSlug !== "" && !slugError && (
            <p className="text-xs text-warning-foreground">
              Save before sharing — the link below still points at the address you had before.
            </p>
          )}
          {!publicUrl && (
            <p className="text-xs text-muted-foreground">
              Save a link before sharing it.
            </p>
          )}
          {publicUrl && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" asChild>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admissions-intro">What the page says</Label>
          <Textarea
            id="admissions-intro"
            rows={3}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            disabled={!canManage}
            placeholder="Admissions are open for the 2026/2027 session. Toddler through Primary 6."
          />
        </div>

        {canManage && (
          <Button
            className="gap-1.5"
            disabled={save.isPending || !cleanedSlug || !!slugError}
            onClick={() => save.mutate({ admissions_slug: cleanedSlug, admissions_intro: intro.trim() || null })}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
