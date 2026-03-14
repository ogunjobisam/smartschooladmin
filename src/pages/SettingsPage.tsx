import { useState, useRef } from "react";
import { Settings, Upload, Loader2, Plus, Trash2, Building2, GraduationCap, Receipt, Calendar, AlertTriangle, BookOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export default function SettingsPage() {
  const { userRole, schoolId, orgId } = useAuth();
  const { branding, refetch } = useSchoolBranding();
  const queryClient = useQueryClient();
  const canEditBranding = userRole === "super_admin" || userRole === "proprietor" || userRole === "group_admin";
  const canManage = userRole === "super_admin" || userRole === "proprietor" || userRole === "group_admin" || userRole === "principal";

  // ── Branding state ──
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor);
  const [accentColor, setAccentColor] = useState(branding.accentColor);
  const [tagline, setTagline] = useState(branding.tagline || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── School profile state ──
  const { data: school, isLoading: schoolLoading } = useQuery({
    queryKey: ["school-profile", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data } = await supabase.from("schools").select("*").eq("id", schoolId).maybeSingle();
      return data;
    },
    enabled: !!schoolId,
  });

  const [schoolName, setSchoolName] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolPhone, setSchoolPhone] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Sync school data to form when loaded
  const schoolDataLoaded = useRef(false);
  if (school && !schoolDataLoaded.current) {
    setSchoolName(school.name || "");
    setSchoolEmail(school.email || "");
    setSchoolPhone(school.phone || "");
    setSchoolAddress(school.address || "");
    schoolDataLoaded.current = true;
  }

  // ── Classes ──
  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("*").eq("school_id", schoolId).order("level_order");
      return data || [];
    },
    enabled: !!schoolId,
  });

  const [newClassName, setNewClassName] = useState("");
  const [newClassOrder, setNewClassOrder] = useState("");
  const [addingClass, setAddingClass] = useState(false);

  // ── Fee Categories ──
  const { data: feeCategories, isLoading: feeCatsLoading } = useQuery({
    queryKey: ["fee-categories", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("fee_categories").select("*").eq("org_id", orgId).order("name");
      return data || [];
    },
    enabled: !!orgId,
  });

  const [newFeeCatName, setNewFeeCatName] = useState("");
  const [newFeeCatDesc, setNewFeeCatDesc] = useState("");
  const [addingFeeCat, setAddingFeeCat] = useState(false);

  // ── Academic Years & Periods ──
  const { data: academicYears, isLoading: yearsLoading } = useQuery({
    queryKey: ["academic-years", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("academic_years")
        .select("*, academic_periods(*)")
        .eq("org_id", orgId)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!orgId,
  });

  const [newYearName, setNewYearName] = useState("");
  const [newYearStart, setNewYearStart] = useState("");
  const [newYearEnd, setNewYearEnd] = useState("");
  const [addingYear, setAddingYear] = useState(false);

  // ── Handlers ──

  const handleSaveBranding = async () => {
    if (!schoolId) return;
    setSaving(true);
    const { error } = await supabase
      .from("schools")
      .update({ primary_color: primaryColor, accent_color: accentColor, tagline: tagline || null })
      .eq("id", schoolId);
    setSaving(false);
    if (error) toast.error("Failed to save branding");
    else { toast.success("Branding updated"); refetch(); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !schoolId) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${schoolId}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage.from("school-assets").upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Upload failed: " + uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("school-assets").getPublicUrl(path);
    const { error: updateError } = await supabase.from("schools").update({ logo_url: urlData.publicUrl }).eq("id", schoolId);
    setUploading(false);
    if (updateError) toast.error("Failed to update logo URL");
    else { toast.success("Logo uploaded"); refetch(); }
  };

  const handleSaveProfile = async () => {
    if (!schoolId) return;
    setSavingProfile(true);
    const { error } = await supabase.from("schools").update({
      name: schoolName, email: schoolEmail || null, phone: schoolPhone || null, address: schoolAddress || null,
    }).eq("id", schoolId);
    setSavingProfile(false);
    if (error) toast.error("Failed to save profile");
    else { toast.success("School profile updated"); refetch(); queryClient.invalidateQueries({ queryKey: ["school-profile"] }); }
  };

  const handleAddClass = async () => {
    if (!schoolId || !newClassName.trim()) return;
    setAddingClass(true);
    const { error } = await supabase.from("classes").insert({
      school_id: schoolId, name: newClassName.trim(), level_order: parseInt(newClassOrder) || 0,
    });
    setAddingClass(false);
    if (error) toast.error("Failed to add class");
    else { toast.success("Class added"); setNewClassName(""); setNewClassOrder(""); queryClient.invalidateQueries({ queryKey: ["classes"] }); }
  };

  const handleDeleteClass = async (id: string) => {
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) toast.error("Failed to delete class — it may have students enrolled");
    else { toast.success("Class deleted"); queryClient.invalidateQueries({ queryKey: ["classes"] }); }
  };

  const handleAddFeeCategory = async () => {
    if (!orgId || !newFeeCatName.trim()) return;
    setAddingFeeCat(true);
    const { error } = await supabase.from("fee_categories").insert({
      org_id: orgId, name: newFeeCatName.trim(), description: newFeeCatDesc.trim() || null,
    });
    setAddingFeeCat(false);
    if (error) toast.error("Failed to add fee category");
    else { toast.success("Fee category added"); setNewFeeCatName(""); setNewFeeCatDesc(""); queryClient.invalidateQueries({ queryKey: ["fee-categories"] }); }
  };

  const handleDeleteFeeCategory = async (id: string) => {
    const { error } = await supabase.from("fee_categories").delete().eq("id", id);
    if (error) toast.error("Cannot delete — category may be in use");
    else { toast.success("Fee category deleted"); queryClient.invalidateQueries({ queryKey: ["fee-categories"] }); }
  };

  const handleAddAcademicYear = async () => {
    if (!orgId || !newYearName.trim() || !newYearStart || !newYearEnd) return;
    setAddingYear(true);
    const { error } = await supabase.from("academic_years").insert({
      org_id: orgId, name: newYearName.trim(), start_date: newYearStart, end_date: newYearEnd,
    });
    setAddingYear(false);
    if (error) toast.error("Failed to add academic year");
    else { toast.success("Academic year added"); setNewYearName(""); setNewYearStart(""); setNewYearEnd(""); queryClient.invalidateQueries({ queryKey: ["academic-years"] }); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your school and platform settings." />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="fees">Fee Categories</TabsTrigger>
          <TabsTrigger value="academic">Academic Years</TabsTrigger>
        </TabsList>

        {/* ── General Tab ── */}
        <TabsContent value="general" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> School Profile</CardTitle>
              <CardDescription>Update your school's contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {schoolLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>School Name</Label>
                      <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} disabled={!canManage} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} placeholder="info@school.ng" disabled={!canManage} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={schoolPhone} onChange={(e) => setSchoolPhone(e.target.value)} placeholder="+234..." disabled={!canManage} />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} disabled={!canManage} />
                    </div>
                  </div>
                  {canManage && (
                    <Button onClick={handleSaveProfile} disabled={savingProfile}>
                      {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Profile
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Add School ── */}
          {(userRole === "super_admin" || userRole === "proprietor") && (
            <AddSchoolCard orgId={orgId} queryClient={queryClient} />
          )}

          {/* ── Danger Zone ── */}
          {(userRole === "super_admin" || userRole === "proprietor") && (
            <DangerZoneCard schoolId={schoolId} orgId={orgId} schoolName={school?.name || schoolName} queryClient={queryClient} />
          )}
        </TabsContent>

        {/* ── Branding Tab ── */}
        <TabsContent value="branding" className="space-y-6 pt-4">
          {!canEditBranding ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Only proprietors and group admins can manage school branding.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>How your sidebar header will look</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 rounded-lg p-4" style={{ backgroundColor: primaryColor }}>
                    {branding.logoUrl ? (
                      <Avatar className="h-9 w-9 rounded-lg">
                        <AvatarImage src={branding.logoUrl} alt="School logo" />
                        <AvatarFallback className="rounded-lg" style={{ backgroundColor: accentColor, color: "#fff" }}>{branding.name[0]}</AvatarFallback>
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
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? "Uploading…" : "Upload Logo"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

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
                        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-10 cursor-pointer rounded border border-input" />
                        <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Accent Color</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-10 cursor-pointer rounded border border-input" />
                        <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="flex-1" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Tagline</Label>
                    <Input placeholder="e.g. Excellence in Education" value={tagline} onChange={(e) => setTagline(e.target.value)} />
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

        {/* ── Classes Tab ── */}
        <TabsContent value="classes" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4" /> Classes</CardTitle>
              <CardDescription>Manage classes/grade levels for this school</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {classesLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  {classes && classes.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Class Name</TableHead>
                          <TableHead className="text-xs">Order</TableHead>
                          {canManage && <TableHead className="text-xs w-16" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classes.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="text-muted-foreground">{c.level_order}</TableCell>
                            {canManage && (
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteClass(c.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No classes configured yet.</p>
                  )}

                  {canManage && (
                    <>
                      <Separator />
                      <div className="flex items-end gap-3">
                        <div className="flex-1 space-y-2">
                          <Label>Class Name</Label>
                          <Input placeholder="e.g. JSS 1" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
                        </div>
                        <div className="w-24 space-y-2">
                          <Label>Order</Label>
                          <Input type="number" placeholder="0" value={newClassOrder} onChange={(e) => setNewClassOrder(e.target.value)} />
                        </div>
                        <Button onClick={handleAddClass} disabled={addingClass || !newClassName.trim()} size="sm" className="gap-1.5">
                          {addingClass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Add
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Subjects Tab ── */}
        <TabsContent value="subjects" className="space-y-6 pt-4">
          <SubjectsTab schoolId={schoolId} canManage={canManage} />
        </TabsContent>

        {/* ── Fee Categories Tab ── */}
        <TabsContent value="fees" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4" /> Fee Categories</CardTitle>
              <CardDescription>Define the types of fees your organisation charges</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {feeCatsLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  {feeCategories && feeCategories.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                          {canManage && <TableHead className="text-xs w-16" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feeCategories.map((fc) => (
                          <TableRow key={fc.id}>
                            <TableCell className="font-medium">{fc.name}</TableCell>
                            <TableCell className="text-muted-foreground">{fc.description || "—"}</TableCell>
                            {canManage && (
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteFeeCategory(fc.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No fee categories configured yet.</p>
                  )}

                  {canManage && (
                    <>
                      <Separator />
                      <div className="flex items-end gap-3">
                        <div className="flex-1 space-y-2">
                          <Label>Category Name</Label>
                          <Input placeholder="e.g. Tuition" value={newFeeCatName} onChange={(e) => setNewFeeCatName(e.target.value)} />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Label>Description</Label>
                          <Input placeholder="Optional description" value={newFeeCatDesc} onChange={(e) => setNewFeeCatDesc(e.target.value)} />
                        </div>
                        <Button onClick={handleAddFeeCategory} disabled={addingFeeCat || !newFeeCatName.trim()} size="sm" className="gap-1.5">
                          {addingFeeCat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Add
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Academic Years Tab ── */}
        <TabsContent value="academic" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Calendar className="h-4 w-4" /> Academic Years</CardTitle>
              <CardDescription>Define academic years and their terms/periods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {yearsLoading ? (
                <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : (
                <>
                  {academicYears && academicYears.length > 0 ? (
                    <div className="space-y-4">
                      {academicYears.map((year: any) => (
                        <div key={year.id} className="rounded-lg border p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold">{year.name}</h4>
                              <p className="text-xs text-muted-foreground">{year.start_date} — {year.end_date}</p>
                            </div>
                            {year.is_current && (
                              <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-medium text-success">Current</span>
                            )}
                          </div>
                          {year.academic_periods && year.academic_periods.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {year.academic_periods.map((p: any) => (
                                <div key={p.id} className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5 text-xs">
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-muted-foreground">{p.start_date} — {p.end_date}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No academic years configured yet.</p>
                  )}

                  {canManage && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end">
                        <div className="space-y-2">
                          <Label>Year Name</Label>
                          <Input placeholder="e.g. 2025/2026" value={newYearName} onChange={(e) => setNewYearName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Input type="date" value={newYearStart} onChange={(e) => setNewYearStart(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>End Date</Label>
                          <Input type="date" value={newYearEnd} onChange={(e) => setNewYearEnd(e.target.value)} />
                        </div>
                        <Button onClick={handleAddAcademicYear} disabled={addingYear || !newYearName.trim() || !newYearStart || !newYearEnd} size="sm" className="gap-1.5">
                          {addingYear ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Add Year
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DangerZoneCard({ schoolId, orgId, schoolName, queryClient }: { schoolId: string | null; orgId: string | null; schoolName: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    if (!schoolId || !orgId) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("delete-demo-data", {
        body: { school_id: schoolId, org_id: orgId },
      });
      if (res.error) throw new Error(res.error.message);
      const result = res.data;
      toast.success(`Deleted ${result.total_deleted} records successfully`);
      queryClient.invalidateQueries();
      setOpen(false);
      setConfirmText("");
    } catch (err: any) {
      toast.error("Failed to delete data: " + (err.message || "Unknown error"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <AlertTriangle className="h-4 w-4" /> Danger Zone
        </CardTitle>
        <CardDescription>Irreversible actions — proceed with caution</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete all school data</p>
            <p className="text-xs text-muted-foreground">Remove all students, staff, invoices, payments, and related records from this school.</p>
          </div>
          <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmText(""); }}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">Delete All Data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>all students, staff, guardians, invoices, payments, payroll data, and approval records</strong> for this school. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2 py-2">
                <Label className="text-sm">
                  Type <span className="font-semibold text-destructive">{schoolName}</span> to confirm:
                </Label>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={schoolName} />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={confirmText !== schoolName || deleting}
                  onClick={handleDelete}
                >
                  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete Everything
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function AddSchoolCard({ orgId, queryClient }: { orgId: string | null; queryClient: ReturnType<typeof useQueryClient> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!orgId || !name.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("schools").insert({ org_id: orgId, name: name.trim() });
      if (error) throw error;
      toast.success(`School "${name.trim()}" created`);
      queryClient.invalidateQueries();
      setOpen(false);
      setName("");
      // Reload to pick up new school in switcher
      window.location.reload();
    } catch (err: any) {
      toast.error("Failed to add school: " + (err.message || "Unknown error"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4" /> Multi-School Management
        </CardTitle>
        <CardDescription>Add another school to your organisation</CardDescription>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add School
          </Button>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>School Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bright Stars Primary" />
            </div>
            <Button onClick={handleAdd} disabled={adding || !name.trim()} size="sm">
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setName(""); }}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Subjects Tab Component ──
function SubjectsTab({ schoolId, canManage }: { schoolId: string | null; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["subjects", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("subjects").select("*").eq("school_id", schoolId).order("name");
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Fetch class_subjects for the selected class
  const { data: classSubjects = [] } = useQuery({
    queryKey: ["class-subjects", selectedClassId],
    queryFn: async () => {
      if (!selectedClassId) return [];
      const { data } = await supabase
        .from("class_subjects" as any)
        .select("id, subject_id")
        .eq("class_id", selectedClassId);
      return (data as any[]) || [];
    },
    enabled: !!selectedClassId,
  });

  const classSubjectIds = new Set(classSubjects.map((cs: any) => cs.subject_id));

  const handleAdd = async () => {
    if (!schoolId || !newName.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("subjects").insert({
      school_id: schoolId, name: newName.trim(), short_code: newCode.trim() || null,
    });
    setAdding(false);
    if (error) toast.error("Failed to add subject");
    else { toast.success("Subject added"); setNewName(""); setNewCode(""); queryClient.invalidateQueries({ queryKey: ["subjects"] }); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) toast.error("Cannot delete — subject may be in use");
    else { toast.success("Subject deleted"); queryClient.invalidateQueries({ queryKey: ["subjects"] }); }
  };

  const handleToggleClassSubject = async (subjectId: string) => {
    if (!selectedClassId) return;
    if (classSubjectIds.has(subjectId)) {
      // Remove
      const link = classSubjects.find((cs: any) => cs.subject_id === subjectId);
      if (link) {
        await supabase.from("class_subjects" as any).delete().eq("id", (link as any).id);
      }
    } else {
      // Add
      await supabase.from("class_subjects" as any).insert({
        class_id: selectedClassId,
        subject_id: subjectId,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["class-subjects", selectedClassId] });
  };

  const handleAssignAll = async () => {
    if (!selectedClassId) return;
    const toAdd = subjects.filter((s: any) => !classSubjectIds.has(s.id));
    if (toAdd.length === 0) return;
    await supabase.from("class_subjects" as any).insert(
      toAdd.map((s: any) => ({ class_id: selectedClassId, subject_id: s.id }))
    );
    queryClient.invalidateQueries({ queryKey: ["class-subjects", selectedClassId] });
    toast.success(`Assigned ${toAdd.length} subjects`);
  };

  return (
    <div className="space-y-6">
      {/* Subject list card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" /> Subjects</CardTitle>
          <CardDescription>Manage subjects taught in this school</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <>
              {subjects.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Subject Name</TableHead>
                      <TableHead className="text-xs">Code</TableHead>
                      {canManage && <TableHead className="text-xs w-16" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjects.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.short_code || "—"}</TableCell>
                        {canManage && (
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">No subjects configured yet.</p>
              )}

              {canManage && (
                <>
                  <Separator />
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-2">
                      <Label>Subject Name</Label>
                      <Input placeholder="e.g. Mathematics" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    </div>
                    <div className="w-24 space-y-2">
                      <Label>Code</Label>
                      <Input placeholder="MATH" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
                    </div>
                    <Button onClick={handleAdd} disabled={adding || !newName.trim()} size="sm" className="gap-1.5">
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Add
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Class-Subject assignment card */}
      {canManage && subjects.length > 0 && classes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" /> Assign Subjects to Class
            </CardTitle>
            <CardDescription>Select a class and toggle which subjects it offers. Only assigned subjects appear in exams.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-[200px]">
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedClassId && (
                <Button variant="outline" size="sm" onClick={handleAssignAll}>
                  Assign All
                </Button>
              )}
            </div>

            {selectedClassId ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {subjects.map((s: any) => {
                  const assigned = classSubjectIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleToggleClassSubject(s.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        assigned
                          ? "border-primary bg-primary/5 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                        assigned ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                      }`}>
                        {assigned && "✓"}
                      </span>
                      {s.short_code || s.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a class above to manage its subjects.</p>
            )}

            {selectedClassId && (
              <p className="text-xs text-muted-foreground">
                {classSubjectIds.size} of {subjects.length} subjects assigned to this class
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
