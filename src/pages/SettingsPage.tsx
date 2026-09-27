import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Settings, Upload, Loader2, Plus, Trash2, Building2, GraduationCap, Receipt, Calendar, AlertTriangle, BookOpen, Sparkles, Send, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdmissionsSettingsTab } from "@/components/settings/AdmissionsSettingsTab";
import { NoticesCard } from "@/components/settings/NoticesCard";
import { IdFormatCard } from "@/components/settings/IdFormatCard";
import { BrandColorsCard } from "@/components/settings/BrandColorsCard";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { SCHOOL_SECTIONS, sectionLabel, sortBySection, type SchoolSection } from "@/lib/sections";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { assertWrote } from "@/lib/writes";
import { COUNTRIES, CURRENCIES, currencyForCountry } from "@/lib/currencies";
import { formatCurrency } from "@/lib/format";

const SETTINGS_TABS = ["general", "branding", "classes", "subjects", "fees", "academic", "admissions", "notifications", "addons"];

export default function SettingsPage() {
  const { userRole, schoolId, orgId } = useAuth();
  const { branding, loading: brandingLoading, refetch } = useSchoolBranding();
  const queryClient = useQueryClient();
  // Group-level only: buying add-ons spends the organisation's money.
  const canManageAddons = userRole === "super_admin" || userRole === "proprietor" || userRole === "group_admin";
  // school_admin is granted manage rights by row-level security on classes,
  // notices and applications, so leaving it out here locked the role out of
  // settings it was allowed to change.
  const canManage = userRole === "super_admin" || userRole === "proprietor" || userRole === "group_admin" || userRole === "principal" || userRole === "school_admin";
  // A school runs its own identity — name, logo, colours — without waiting on
  // the group. Row-level security on `schools` and the school-assets bucket
  // permits exactly these roles.
  const canEditBranding = canManage;

  // ── Branding state ──
  // Hydrated from the fetched branding rather than initialised from it: on a
  // hard reload straight into Settings the fetch is still in flight at first
  // render, so this used to hold the defaults and saving wrote them over the
  // school's real tagline.
  const [tagline, setTagline] = useState(branding.tagline || "");
  const taglineHydrated = useRef(false);
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

  // Fill the form from whichever school is selected.
  //
  // This used to be a bare `if` in the render body guarded by a ref that was
  // never reset, which had two consequences. The form filled once and then
  // never again, so switching school left the previous school's details in the
  // boxes — and saving would have renamed the new school to the old one's name.
  // And if the first load returned nothing, the ref stayed unset but the boxes
  // stayed empty, so an existing school looked like one that had never been
  // named and invited you to type it in again.
  //
  // Keyed on the school id, so every switch refills and a reload repairs
  // itself.
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!school || filledFor.current === school.id) return;
    setSchoolName(school.name || "");
    setSchoolEmail(school.email || "");
    setSchoolPhone(school.phone || "");
    setSchoolAddress(school.address || "");
    filledFor.current = school.id;
  }, [school]);

  // ── Classes ──
  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("*").eq("school_id", schoolId).order("level_order");
      return sortBySection(data || []);
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

  // ── Period state ──
  const [newPeriodYearId, setNewPeriodYearId] = useState<string | null>(null);
  const [newPeriodName, setNewPeriodName] = useState("");
  const [newPeriodStart, setNewPeriodStart] = useState("");
  const [newPeriodEnd, setNewPeriodEnd] = useState("");
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [togglingCurrent, setTogglingCurrent] = useState<string | null>(null);

  // ── Handlers ──

  useEffect(() => {
    if (brandingLoading || taglineHydrated.current) return;
    taglineHydrated.current = true;
    setTagline(branding.tagline || "");
  }, [brandingLoading, branding.tagline]);

  const saveBranding = async (patch: TablesUpdate<"schools">, what: string) => {
    if (!schoolId) return;
    await assertWrote(
      supabase.from("schools").update(patch).eq("id", schoolId).select("id"),
      `save the ${what}`,
    );
    refetch();
  };

  const handleSaveColors = async (primary: string, accent: string) => {
    try {
      await saveBranding({ primary_color: primary, accent_color: accent }, "colours");
      toast.success("Colours updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save colours"));
      throw err; // keep the card dirty so the change is not silently lost
    }
  };

  const handleSaveTagline = async () => {
    setSaving(true);
    try {
      await saveBranding({ tagline: tagline || null }, "tagline");
      toast.success("Tagline updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save tagline"));
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
    const { error: uploadError } = await supabase.storage.from("school-assets").upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Upload failed: " + uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("school-assets").getPublicUrl(path);
    try {
      await assertWrote(
        supabase.from("schools").update({ logo_url: urlData.publicUrl }).eq("id", schoolId).select("id"),
        "attach the new logo to your school",
      );
      toast.success("Logo uploaded");
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update logo URL"));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!schoolId) return;
    setSavingProfile(true);
    try {
      await assertWrote(
        supabase.from("schools").update({
          name: schoolName, email: schoolEmail || null, phone: schoolPhone || null, address: schoolAddress || null,
        }).eq("id", schoolId).select("id"),
        "save the school profile",
      );
      toast.success("School profile updated");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["school-profile"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save profile"));
    } finally {
      setSavingProfile(false);
    }
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
    try {
      await assertWrote(
        supabase.from("classes").delete().eq("id", id).select("id"),
        "delete this class",
      );
      toast.success("Class deleted");
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete class — it may have students enrolled"));
    }
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
    try {
      await assertWrote(
        supabase.from("fee_categories").delete().eq("id", id).select("id"),
        "delete this fee category",
      );
      toast.success("Fee category deleted");
      queryClient.invalidateQueries({ queryKey: ["fee-categories"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Cannot delete — category may be in use"));
    }
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

  const handleAddPeriod = async (yearId: string) => {
    if (!newPeriodName.trim() || !newPeriodStart || !newPeriodEnd) return;
    setAddingPeriod(true);
    const { error } = await supabase.from("academic_periods").insert({
      academic_year_id: yearId, name: newPeriodName.trim(), start_date: newPeriodStart, end_date: newPeriodEnd,
    });
    setAddingPeriod(false);
    if (error) toast.error("Failed to add period");
    else {
      toast.success("Period added");
      setNewPeriodName(""); setNewPeriodStart(""); setNewPeriodEnd(""); setNewPeriodYearId(null);
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    }
  };

  const handleSetClassSection = async (classId: string, section: SchoolSection | null) => {
    try {
      await assertWrote(
        supabase.from("classes").update({ section }).eq("id", classId).select("id"),
        "update the section",
      );
      queryClient.invalidateQueries({ queryKey: ["classes", schoolId] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update the section"));
    }
  };

  const handleToggleCurrentPeriod = async (periodId: string) => {
    setTogglingCurrent(periodId);

    // Clear across every year in the organisation, not just the one being
    // edited. Clearing per-year left two terms current at once, which the rest
    // of the app cannot represent: student enrolment, attendance and exams each
    // pick "the" current term and would silently disagree about which.
    const currentIds = (academicYears || [])
      .flatMap((y) => y.academic_periods || [])
      .filter((p) => p.is_current && p.id !== periodId)
      .map((p) => p.id);

    if (currentIds.length > 0) {
      await supabase.from("academic_periods").update({ is_current: false }).in("id", currentIds);
    }
    const { error } = await supabase.from("academic_periods").update({ is_current: true }).eq("id", periodId);

    setTogglingCurrent(null);
    if (error) {
      toast.error("Could not set the current term: " + error.message);
      return;
    }
    toast.success("Current term updated");
    queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    queryClient.invalidateQueries({ queryKey: ["current-period"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-periods"] });
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab && SETTINGS_TABS.includes(requestedTab) ? requestedTab : "general";
  const setTab = (value: string) => setSearchParams({ tab: value }, { replace: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your school and platform settings." />

      {/* Controlled by ?tab= so other pages can deep-link straight to the
          setting they are telling the user to change. */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="fees">Fee Categories</TabsTrigger>
          <TabsTrigger value="academic">Academic Years</TabsTrigger>
          <TabsTrigger value="admissions">Admissions</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="addons">Add-ons</TabsTrigger>
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
                      <Label htmlFor="school-name">School Name</Label>
                      <Input id="school-name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} disabled={!canManage} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="school-email">Email</Label>
                      <Input id="school-email" type="email" value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} placeholder="info@school.ng" disabled={!canManage} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="school-phone">Phone</Label>
                      <Input id="school-phone" value={schoolPhone} onChange={(e) => setSchoolPhone(e.target.value)} placeholder="+234..." disabled={!canManage} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="school-address">Address</Label>
                      <Input id="school-address" value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} disabled={!canManage} />
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

          {/* ── Currency & Region ── */}
          <CurrencyCard orgId={orgId} canManage={canManageAddons} />

          {/* ── ID Numbering ── */}
          <IdFormatCard schoolId={schoolId} schoolName={school?.name || schoolName} orgId={orgId} canManage={canManage} />

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
                Only school leadership and group owners can manage school branding.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* No mock preview card: the app itself repaints as the colours
                  change, which is a truer preview than a swatch of a sidebar
                  header could ever be. */}
              <BrandColorsCard onSave={handleSaveColors} />

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
                  <CardTitle className="text-base">Tagline</CardTitle>
                  <CardDescription>Sits under the school name in the sidebar and on printed documents</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="e.g. Excellence in Education"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                  />
                  <Button onClick={handleSaveTagline} disabled={saving || tagline === (branding.tagline || "")}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save tagline
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
                          <TableHead className="text-xs">Section</TableHead>
                          <TableHead className="text-xs">Order</TableHead>
                          <TableHead className="text-xs">Teachers</TableHead>
                          {canManage && <TableHead className="text-xs w-16" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classes.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell>
                              {canManage ? (
                                <Select
                                  value={c.section ?? "none"}
                                  onValueChange={(v) => handleSetClassSection(c.id, v === "none" ? null : (v as SchoolSection))}
                                >
                                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Unassigned</SelectItem>
                                    {SCHOOL_SECTIONS.map((sec) => (
                                      <SelectItem key={sec.value} value={sec.value}>{sec.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm text-muted-foreground">{sectionLabel(c.section)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{c.level_order}</TableCell>
                            <TableCell>
                              <ClassTeacherPicker classId={c.id} className={c.name} canManage={canManage} />
                            </TableCell>
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
        <TabsContent value="admissions" className="space-y-6 pt-4">
          <AdmissionsSettingsTab schoolId={schoolId} canManage={canManage} />
          <NoticesCard schoolId={schoolId} canManage={canManage} />
        </TabsContent>

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
                      {academicYears.map((year) => (
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
                              {year.academic_periods.map((p) => (
                                <div key={p.id} className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{p.name}</span>
                                    {p.is_current && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">Current</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{p.start_date} — {p.end_date}</span>
                                    {canManage && !p.is_current && (
                                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" disabled={togglingCurrent === p.id} onClick={() => handleToggleCurrentPeriod(p.id)}>
                                        {togglingCurrent === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set Current"}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {canManage && (
                            newPeriodYearId === year.id ? (
                              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4 items-end rounded border bg-muted/30 p-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Period Name</Label>
                                  <Input placeholder="e.g. Term 1" value={newPeriodName} onChange={(e) => setNewPeriodName(e.target.value)} className="h-8 text-xs" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Start</Label>
                                  <Input type="date" value={newPeriodStart} onChange={(e) => setNewPeriodStart(e.target.value)} className="h-8 text-xs" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">End</Label>
                                  <Input type="date" value={newPeriodEnd} onChange={(e) => setNewPeriodEnd(e.target.value)} className="h-8 text-xs" />
                                </div>
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => handleAddPeriod(year.id)} disabled={addingPeriod || !newPeriodName.trim() || !newPeriodStart || !newPeriodEnd}>
                                    {addingPeriod ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setNewPeriodYearId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" className="mt-2 h-7 gap-1 text-xs" onClick={() => setNewPeriodYearId(year.id)}>
                                <Plus className="h-3 w-3" /> Add Period
                              </Button>
                            )
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
        {/* -- Notifications Tab -- */}
        <TabsContent value="notifications" className="space-y-6 pt-4">
          <MessageOutboxCard canManage={canManage} />
        </TabsContent>

        {/* -- Add-ons Tab -- */}
        <TabsContent value="addons" className="space-y-6 pt-4">
          <AiAddonCard orgId={orgId} canManage={canManageAddons} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DangerZoneCard({ schoolId, orgId, schoolName, queryClient }: { schoolId: string | null; orgId: string | null; schoolName: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);

  // Seeding is for a school with nothing in it yet. The function itself reuses
  // any students and staff it finds rather than duplicating them, but it still
  // adds guardians, fee schedules, invoices and applications — so on a school
  // with real pupils it would mix invented records in among them, and there is
  // no way to tell the two apart afterwards.
  const { data: studentCount, isLoading: countingStudents } = useQuery({
    queryKey: ["danger-zone-student-count", schoolId],
    queryFn: async () => {
      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!);
      return count ?? 0;
    },
    enabled: !!schoolId,
  });

  const hasStudents = (studentCount ?? 0) > 0;

  const handleSeed = async () => {
    if (!schoolId || !orgId) return;
    setSeeding(true);
    try {
      const res = await supabase.functions.invoke("seed-demo-data", {
        body: { school_id: schoolId, org_id: orgId },
      });
      if (res.error) throw new Error(res.error.message);
      const counts = res.data?.counts;
      toast.success(
        counts
          ? `Seeded ${counts.students} students, ${counts.staff} staff and ${counts.invoices} invoices`
          : "Demo data seeded",
      );
      queryClient.invalidateQueries();
      setSeedOpen(false);
    } catch (err) {
      toast.error("Could not seed demo data: " + getErrorMessage(err, "Unknown error"));
    } finally {
      setSeeding(false);
    }
  };

  const handleDelete = async () => {
    if (!schoolId || !orgId) return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("delete-demo-data", {
        body: { school_id: schoolId, org_id: orgId },
      });
      if (res.error) throw new Error(res.error.message);
      const result = res.data;
      toast.success(`Deleted ${result.total_deleted} records successfully`);
      queryClient.invalidateQueries();
      setOpen(false);
      setConfirmText("");
    } catch (err) {
      toast.error("Failed to delete data: " + getErrorMessage(err, "Unknown error"));
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
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Seed demo data</p>
            <p className="text-xs text-muted-foreground">
              {hasStudents
                ? "Only available while the school is empty — this one already has students."
                : "Fill this school with sample students, staff, fees, exams, payroll and a bus route, so you can see it populated."}
            </p>
          </div>
          <AlertDialog open={seedOpen} onOpenChange={setSeedOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={countingStudents || hasStudents || !schoolId}>
                {countingStudents ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                Seed Demo Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fill {schoolName} with sample data?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-left">
                    <p>This creates invented records so you can see the app populated:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      <li>Students, with guardians linked to them</li>
                      <li>Staff, with salaries, bank details and a payroll run</li>
                      <li>Subjects, exams and scores, and a term of attendance</li>
                      <li>Fee schedules, invoices and payments</li>
                      <li>A bus route with riders, and admission enquiries</li>
                    </ul>
                    <p>
                      Every one of them is made up. Use <strong>Delete All Data</strong> below to
                      clear them again before the school takes on real pupils.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={seeding}>Cancel</AlertDialogCancel>
                <Button onClick={handleSeed} disabled={seeding}>
                  {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {seeding ? "Seeding…" : "Seed demo data"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Separator />

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
    } catch (err) {
      toast.error("Failed to add school: " + getErrorMessage(err, "Unknown error"));
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
        .from("class_subjects")
        .select("id, subject_id")
        .eq("class_id", selectedClassId);
      return data || [];
    },
    enabled: !!selectedClassId,
  });

  const classSubjectIds = new Set(classSubjects.map((cs) => cs.subject_id));

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
      const link = classSubjects.find((cs) => cs.subject_id === subjectId);
      if (link) {
        await supabase.from("class_subjects").delete().eq("id", link.id);
      }
    } else {
      // Add
      await supabase.from("class_subjects").insert({
        class_id: selectedClassId,
        subject_id: subjectId,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["class-subjects", selectedClassId] });
  };

  const handleAssignAll = async () => {
    if (!selectedClassId) return;
    const toAdd = subjects.filter((s) => !classSubjectIds.has(s.id));
    if (toAdd.length === 0) return;
    await supabase.from("class_subjects").insert(
      toAdd.map((s) => ({ class_id: selectedClassId, subject_id: s.id }))
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
                    {subjects.map((s) => (
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
                    {classes.map((c) => (
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
                {subjects.map((s) => {
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

/**
 * The organisation's country and billing currency. Chosen once at setup and,
 * until now, unchangeable — a group set up as "United Kingdom" was stuck
 * showing £ on every fee, invoice and payslip.
 */
function CurrencyCard({ orgId, canManage }: { orgId: string | null; canManage: boolean }) {
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: org, isLoading } = useQuery({
    queryKey: ["org-currency", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("organisation_groups")
        .select("country, currency")
        .eq("id", orgId!)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (!org) return;
    setCountry(org.country || "");
    setCurrency(org.currency || "NGN");
  }, [org]);

  const handleCountry = (code: string) => {
    setCountry(code);
    const suggested = currencyForCountry(code);
    if (suggested) setCurrency(suggested);
  };

  const dirty = !!org && (country !== (org.country || "") || currency !== (org.currency || ""));

  const save = async () => {
    if (!orgId) return;
    setConfirmOpen(false);
    setSaving(true);
    const { error } = await supabase
      .from("organisation_groups")
      .update({ country, currency })
      .eq("id", orgId);
    setSaving(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not save the currency."));
      return;
    }
    toast.success("Currency updated — reloading so every page uses it");
    // The currency is read once when the workspace loads and threaded through
    // every document and export, so a full reload is the honest way to apply it.
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" /> Currency &amp; Region
        </CardTitle>
        <CardDescription>
          The currency used for fees, invoices, receipts, payslips and reports across this
          organisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={country} onValueChange={handleCountry} disabled={!canManage}>
                  <SelectTrigger><SelectValue placeholder="Select a country" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={!canManage}>
                  <SelectTrigger><SelectValue placeholder="Select a currency" /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Changing the currency changes the symbol shown everywhere. Amounts already recorded
              keep their figures — they are not converted. Your SmartSchoolAdmin subscription and
              SMS bundles are always charged in Naira and are not affected.
            </p>

            {canManage ? (
              <div className="flex items-center gap-3">
                <Button onClick={() => setConfirmOpen(true)} disabled={!dirty || saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Currency
                </Button>
                {currency && (
                  <span className="text-xs text-muted-foreground">
                    Example: {formatCurrency(250000, currency)}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only a proprietor or group owner can change the currency.
              </p>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change currency to {currency}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every fee, invoice, receipt, statement and payslip will show {currency} from now on.
              Existing figures are not converted, and the app will reload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={save}>Change currency</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AiAddonCard({ orgId, canManage }: { orgId: string | null; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-addon-settings", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("organisation_groups")
        .select("ai_addon_enabled, ai_monthly_limit")
        .eq("id", orgId!)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  const { data: usage } = useQuery({
    queryKey: ["ai-addon-usage", orgId],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .eq("status", "succeeded")
        .gte("created_at", monthStart.toISOString());
      return count ?? 0;
    },
    enabled: !!orgId,
  });

  const toggle = async (enabled: boolean) => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organisation_groups")
      .update({ ai_addon_enabled: enabled })
      .eq("id", orgId);
    setSaving(false);
    if (error) {
      toast.error("Could not update the add-on: " + error.message);
      return;
    }
    toast.success(enabled ? "AI Analysis add-on enabled" : "AI Analysis add-on disabled");
    queryClient.invalidateQueries({ queryKey: ["ai-addon-settings", orgId] });
    queryClient.invalidateQueries({ queryKey: ["ai-entitlement", orgId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> AI Analysis
        </CardTitle>
        <CardDescription>
          Written analysis of academic performance, report card comments, fee collection and
          staffing, generated from your own data. Billed separately from your subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {settings?.ai_addon_enabled ? "Active" : "Not active"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {settings?.ai_addon_enabled
                    ? `${usage ?? 0} of ${settings.ai_monthly_limit} analyses used this month.`
                    : "Turn on to make AI analysis available across the app."}
                </p>
              </div>
              <Switch
                checked={!!settings?.ai_addon_enabled}
                disabled={!canManage || saving}
                onCheckedChange={toggle}
              />
            </div>
            {!canManage && (
              <p className="text-xs text-muted-foreground">
                Only a proprietor or group admin can change the add-on.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface OutboxSenderState {
  email_configured: boolean;
  sender: string;
  sender_is_default: boolean;
}

function MessageOutboxCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [requeueing, setRequeueing] = useState(false);
  // Learned from the last send — the function reports which sender it used.
  const [senderState, setSenderState] = useState<OutboxSenderState | null>(null);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["outbox-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_outbox_summary");
      if (error) throw error;
      return data || [];
    },
  });

  const countFor = (status: string) => summary.find((r) => r.status === status)?.count ?? 0;
  const queued = countFor("queued");
  const sent = countFor("sent");
  const failed = countFor("failed");

  const sendNow = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-message-queue", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSenderState({
        email_configured: !!data.email_configured,
        sender: data.sender ?? "",
        sender_is_default: !!data.sender_is_default,
      });

      if (data.sent > 0) toast.success(`Sent ${data.sent} message${data.sent === 1 ? "" : "s"}`);
      if (data.failed > 0) toast.error(`${data.failed} message${data.failed === 1 ? "" : "s"} could not be delivered`);
      if (data.sent === 0 && data.failed === 0) {
        toast.info(
          !data.email_configured
            ? "No email provider is configured yet, so messages are still waiting."
            : data.deferred > 0
              // Deferred means the provider refused the sender, not the message.
              ? "The email provider would not accept the sender, so messages are still waiting."
              : "Nothing waiting to send"
        );
      }
      queryClient.invalidateQueries({ queryKey: ["outbox-summary"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not send queued messages"));
    } finally {
      setSending(false);
    }
  };

  const requeueFailed = async () => {
    setRequeueing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-message-queue", {
        body: { action: "requeue" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        `${data.requeued} message${data.requeued === 1 ? "" : "s"} put back in the queue`,
        { description: "Fix the sender first, then send again." }
      );
      queryClient.invalidateQueries({ queryKey: ["outbox-summary"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not requeue the failed messages"));
    } finally {
      setRequeueing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" /> Outbox
        </CardTitle>
        <CardDescription>
          Fee reminders, invites and announcements are queued here before they go out.
          Delivery needs the <code>RESEND_API_KEY</code> function secret. Nothing sends on
          a schedule yet, so use the button below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Waiting", value: queued },
                { label: "Sent", value: sent },
                { label: "Failed", value: failed },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="font-mono text-xl font-semibold tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>

            {senderState && (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  senderState.sender_is_default || !senderState.email_configured
                    ? "border-warning/40 bg-warning/5"
                    : "bg-muted/40"
                }`}
              >
                {!senderState.email_configured ? (
                  <p>
                    No email provider yet. Set the <code>RESEND_API_KEY</code> function secret,
                    then send again — nothing has been lost, the messages are still waiting.
                  </p>
                ) : senderState.sender_is_default ? (
                  <p>
                    Sending as <strong>{senderState.sender}</strong>, the provider&rsquo;s test
                    sender. It only reaches the address that owns the email account — everyone
                    else is refused, and those messages stay queued rather than failing. Whoever
                    runs this platform needs to verify a sending domain before parents receive
                    anything; nothing is lost until they do.
                  </p>
                ) : (
                  <p>
                    Messages go out from <strong>{senderState.sender}</strong> under your
                    school&rsquo;s name, and replies come back to your school&rsquo;s own address.
                    Set that address under <strong>Settings → General</strong>.
                  </p>
                )}
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={sendNow} disabled={sending || queued === 0} size="sm" className="gap-1.5">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send {queued > 0 ? queued : ""} queued message{queued === 1 ? "" : "s"}
                </Button>
                {failed > 0 && (
                  <Button
                    onClick={requeueFailed}
                    disabled={requeueing}
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                  >
                    {requeueing && <Loader2 className="h-4 w-4 animate-spin" />}
                    Try {failed} failed message{failed === 1 ? "" : "s"} again
                  </Button>
                )}
              </div>
            )}

            {failed > 0 && (
              <p className="text-xs text-muted-foreground">
                Failed messages were rejected by the provider — usually a bad address.
                They are not retried automatically, but you can put them back in the
                queue once the cause is fixed.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Assigns teachers to one class.
 *
 * Teachers only see the students, registers and scores of classes they are
 * assigned to, so a teacher with nothing assigned here sees nothing at all —
 * this is where that is put right.
 */
function ClassTeacherPicker({ classId, className, canManage }: { classId: string; className: string; canManage: boolean }) {
  const { schoolId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: assigned = [] } = useQuery({
    queryKey: ["class-teachers", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("class_teachers")
        .select("id, staff_id, staff(id, first_name, last_name)")
        .eq("class_id", classId);
      return data || [];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["assignable-teachers", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId!)
        .eq("employment_status", "active")
        .order("last_name");
      return data || [];
    },
    enabled: !!schoolId && open,
  });

  const assignedIds = new Set(assigned.map((a) => a.staff_id));

  const toggle = async (staffId: string) => {
    setBusy(true);
    const existing = assigned.find((a) => a.staff_id === staffId);
    const { error } = existing
      ? await supabase.from("class_teachers").delete().eq("id", existing.id)
      : await supabase.from("class_teachers").insert({ class_id: classId, staff_id: staffId });
    setBusy(false);

    if (error) {
      toast.error("Could not update teachers: " + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["class-teachers", classId] });
  };

  const names = assigned
    .map((a) => {
      const staff = a.staff;
      return staff ? `${staff.first_name} ${staff.last_name}` : null;
    })
    .filter(Boolean) as string[];

  if (!canManage) {
    return <span className="text-sm text-muted-foreground">{names.join(", ") || "—"}</span>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs font-normal">
          <Users className="h-3 w-3" />
          {names.length === 0 ? <span className="text-muted-foreground">Assign</span> : names.join(", ")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Teachers for {className}</DialogTitle>
          <DialogDescription>
            A teacher sees only the students, registers and results of the classes they
            are assigned to.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {teachers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active staff in this school yet.
            </p>
          ) : (
            teachers.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <Checkbox
                  checked={assignedIds.has(t.id)}
                  disabled={busy}
                  onCheckedChange={() => toggle(t.id)}
                />
                <span className="text-sm">{t.last_name}, {t.first_name}</span>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
