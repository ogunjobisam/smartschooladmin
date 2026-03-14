import { useState, useRef } from "react";
import { Settings, Upload, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2 } from "lucide-react";

export default function SettingsPage() {
  const { userRole, schoolId } = useAuth();
  const { branding, refetch } = useSchoolBranding();
  const canEditBranding = userRole === "proprietor" || userRole === "group_admin";

  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor);
  const [accentColor, setAccentColor] = useState(branding.accentColor);
  const [tagline, setTagline] = useState(branding.tagline || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveBranding = async () => {
    if (!schoolId) return;
    setSaving(true);
    const { error } = await supabase
      .from("schools")
      .update({
        primary_color: primaryColor,
        accent_color: accentColor,
        tagline: tagline || null,
      })
      .eq("id", schoolId);
    setSaving(false);
    if (error) {
      toast.error("Failed to save branding");
    } else {
      toast.success("Branding updated");
      refetch();
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

    const { error: updateError } = await supabase
      .from("schools")
      .update({ logo_url: urlData.publicUrl })
      .eq("id", schoolId);

    setUploading(false);
    if (updateError) {
      toast.error("Failed to update logo URL");
    } else {
      toast.success("Logo uploaded");
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your school and platform settings." />

      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="space-y-6 pt-4">
          {!canEditBranding ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Only proprietors and group admins can manage school branding.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Live Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>How your sidebar header will look</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="flex items-center gap-3 rounded-lg p-4"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {branding.logoUrl ? (
                      <Avatar className="h-9 w-9 rounded-lg">
                        <AvatarImage src={branding.logoUrl} alt="School logo" />
                        <AvatarFallback className="rounded-lg" style={{ backgroundColor: accentColor, color: "#fff" }}>
                          {branding.name[0]}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: accentColor }}>
                        <Building2 className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">{branding.name}</p>
                      {tagline && <p className="text-[11px] text-white/70">{tagline}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Logo Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">School Logo</CardTitle>
                  <CardDescription>Upload a logo (PNG, JPG, SVG — max 2MB)</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                  {branding.logoUrl ? (
                    <Avatar className="h-16 w-16 rounded-lg">
                      <AvatarImage src={branding.logoUrl} alt="Current logo" />
                      <AvatarFallback className="rounded-lg bg-muted">{branding.name[0]}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? "Uploading…" : "Upload Logo"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Colors & Tagline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Colors & Tagline</CardTitle>
                  <CardDescription>Customize your school's brand colors</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Primary Color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded border border-input"
                        />
                        <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Accent Color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded border border-input"
                        />
                        <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="flex-1" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Tagline</Label>
                    <Input
                      placeholder="e.g. Excellence in Education"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSaveBranding} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Branding
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="general" className="pt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Settings className="mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold">General Settings coming soon</h3>
              <p className="text-sm text-muted-foreground">School profile, academic configuration, fee rules, and payroll settings.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
