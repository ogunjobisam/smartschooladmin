import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, Upload, Eye } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { assertWrote } from "@/lib/writes";
import {
  documentShell,
  letterheadHtml,
  footerHtml,
  openDocument,
  printButtonHtml,
  type DocumentSchool,
} from "@/lib/document-theme";

const PRESETS: { label: string; primary: string; accent: string }[] = [
  { label: "Navy & blue", primary: "#1e293b", accent: "#3b82f6" },
  { label: "Forest & lime", primary: "#14532d", accent: "#65a30d" },
  { label: "Burgundy & gold", primary: "#7f1d1d", accent: "#d97706" },
  { label: "Indigo & teal", primary: "#312e81", accent: "#0d9488" },
];

export default function SchoolProfile() {
  const { userRole, schoolId } = useAuth();
  const { branding, refetch } = useSchoolBranding();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit =
    userRole === "super_admin" ||
    userRole === "proprietor" ||
    userRole === "group_admin" ||
    userRole === "principal" ||
    userRole === "school_admin";

  const { data: school, isLoading } = useQuery({
    queryKey: ["school-profile", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data } = await supabase.from("schools").select("*").eq("id", schoolId).maybeSingle();
      return data;
    },
    enabled: !!schoolId,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [tagline, setTagline] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e293b");
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!school || filledFor.current === school.id) return;
    setName(school.name || "");
    setEmail(school.email || "");
    setPhone(school.phone || "");
    setAddress(school.address || "");
    setTagline(school.tagline || "");
    setPrimaryColor(school.primary_color || "#1e293b");
    setAccentColor(school.accent_color || "#3b82f6");
    filledFor.current = school.id;
  }, [school]);

  const previewSchool: DocumentSchool = {
    name: name || "Your school name",
    address: address || null,
    phone: phone || null,
    email: email || null,
    tagline: tagline || null,
    logoUrl: school?.logo_url || branding.logoUrl,
    primaryColor,
    accentColor,
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!name.trim()) {
      toast.error("Please enter the school name");
      return;
    }
    setSaving(true);
    try {
      await assertWrote(
        supabase
          .from("schools")
          .update({
            name: name.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            address: address.trim() || null,
            tagline: tagline.trim() || null,
            primary_color: primaryColor,
            accent_color: accentColor,
          })
          .eq("id", schoolId)
          .select("id"),
        "save the school profile",
      );
      toast.success("School profile saved — every document now uses these details");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["school-profile"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save the school profile"));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !schoolId) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${schoolId}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("school-assets")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("school-assets").getPublicUrl(path);
    try {
      await assertWrote(
        supabase.from("schools").update({ logo_url: `${urlData.publicUrl}?v=${Date.now()}` }).eq("id", schoolId).select("id"),
        "attach the new logo to your school",
      );
      toast.success("Logo updated");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["school-profile"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save the logo"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openPreview = () => {
    const html = documentShell(previewSchool, {
      title: `${previewSchool.name} — letterhead preview`,
      body: `
        ${letterheadHtml(previewSchool, {
          kicker: "Sample document",
          title: "INV-000123",
          meta: ["Issued today", "Due in 14 days"],
        })}
        <div class="card"><p class="label">How this looks</p>
        <p class="value">Every invoice, receipt, statement, payslip, report card, transcript, letter, certificate and ID card uses this heading, these contact details and these colours.</p></div>
        <table class="doc"><thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
        <tbody><tr><td>Tuition — sample term</td><td class="num">120,000.00</td></tr>
        <tr><td>Transport</td><td class="num">15,000.00</td></tr></tbody>
        <tfoot><tr><td>Total</td><td class="num">135,000.00</td></tr></tfoot></table>
        ${footerHtml(previewSchool)}
        ${printButtonHtml()}`,
    });
    if (!openDocument(html)) toast.error("Allow pop-ups to see the preview");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="School profile"
        description="Your school's name, contact details, logo and colours — used on every page and every document you print or email."
        icon={Building2}
      />

      {!canEdit && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            You can view your school's details here, but only school leadership can change them.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
            <CardDescription>These appear at the top of every document and in emails to parents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sp-name">School name</Label>
              <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-tagline">Motto or tagline</Label>
              <Input
                id="sp-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Excellence in Education"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-address">Address</Label>
              <Textarea
                id="sp-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Street, city, state"
                disabled={!canEdit}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sp-phone">Phone</Label>
                <Input
                  id="sp-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234..."
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-email">Email</Label>
                <Input
                  id="sp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="office@yourschool.com"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sp-primary">Main colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="sp-primary"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    disabled={!canEdit}
                    className="h-10 w-14 cursor-pointer rounded border bg-background"
                  />
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={!canEdit} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-accent">Highlight colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="sp-accent"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    disabled={!canEdit}
                    className="h-10 w-14 cursor-pointer rounded border bg-background"
                  />
                  <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} disabled={!canEdit} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setPrimaryColor(p.primary);
                    setAccentColor(p.accent);
                  }}
                  className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: p.primary }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: p.accent }} />
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={handleSave} disabled={!canEdit || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save profile
              </Button>
              <Button variant="outline" onClick={openPreview} className="gap-2">
                <Eye className="h-4 w-4" /> Preview a document
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
              <CardDescription>Square images work best. Shown on documents and ID cards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16 rounded-xl border">
                  {previewSchool.logoUrl ? (
                    <AvatarImage src={previewSchool.logoUrl} alt={`${name} logo`} className="object-contain" />
                  ) : null}
                  <AvatarFallback className="rounded-xl text-lg">{(name || "S").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={!canEdit || uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {previewSchool.logoUrl ? "Replace logo" : "Upload logo"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Letterhead</CardTitle>
              <CardDescription>How the top of your documents will look.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-white p-4 text-[11px] leading-snug text-slate-900">
                <div className="flex items-center gap-3">
                  {previewSchool.logoUrl ? (
                    <img
                      src={previewSchool.logoUrl}
                      alt=""
                      className="h-11 w-11 rounded-lg border object-contain p-0.5"
                    />
                  ) : (
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-base font-bold text-white"
                      style={{ background: primaryColor }}
                    >
                      {(name || "S").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold" style={{ color: primaryColor }}>
                      {previewSchool.name}
                    </p>
                    {tagline && <p className="truncate text-slate-500">{tagline}</p>}
                    {address && <p className="truncate text-slate-500">{address}</p>}
                    {(phone || email) && (
                      <p className="truncate text-slate-500">{[email, phone].filter(Boolean).join(" • ")}</p>
                    )}
                  </div>
                </div>
                <div
                  className="mt-3 h-1 rounded"
                  style={{ background: `linear-gradient(90deg, ${primaryColor} 55%, ${accentColor} 55%)` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
