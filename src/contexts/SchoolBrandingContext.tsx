import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, schoolThemeVars } from "@/lib/theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { setDocumentSchoolProfile } from "@/lib/document-theme";

interface SchoolBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

const defaultBranding: SchoolBranding = {
  name: "SmartSchoolAdmin",
  logoUrl: null,
  primaryColor: DEFAULT_PRIMARY,
  accentColor: DEFAULT_ACCENT,
  tagline: null,
  address: null,
  phone: null,
  email: null,
};

/** Candidate colours being tried out in Settings, not yet saved. */
export interface BrandingPreview {
  primaryColor: string;
  accentColor: string;
}

interface SchoolBrandingContextType {
  branding: SchoolBranding;
  loading: boolean;
  refetch: () => void;
  /**
   * Paint the whole app in colours that have not been saved, so someone
   * choosing them can see what they are choosing. Pass null to put the saved
   * colours back — and do it on unmount, or they walk away from Settings with
   * a theme that is not their school's.
   */
  previewColors: (colors: BrandingPreview | null) => void;
}

const SchoolBrandingContext = createContext<SchoolBrandingContextType>({
  branding: defaultBranding,
  loading: true,
  refetch: () => {},
  previewColors: () => {},
});

export function SchoolBrandingProvider({ children }: { children: ReactNode }) {
  const { schoolId } = useAuth();
  const [branding, setBranding] = useState<SchoolBranding>(defaultBranding);
  const [preview, setPreview] = useState<BrandingPreview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    if (!schoolId) {
      setBranding(defaultBranding);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("schools")
      .select("name, logo_url, primary_color, accent_color, tagline, address, phone, email")
      .eq("id", schoolId)
      .maybeSingle();

    if (data) {
      setBranding({
        name: data.name,
        logoUrl: data.logo_url,
        primaryColor: data.primary_color || defaultBranding.primaryColor,
        accentColor: data.accent_color || defaultBranding.accentColor,
        tagline: data.tagline,
        address: data.address,
        phone: data.phone,
        email: data.email,
      });
    } else {
      setBranding(defaultBranding);
    }
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Repaint the chrome in the school's own colours.
  //
  // This used to write --school-primary and --school-accent, which nothing in
  // the app read: a school could pick maroon in Settings and still see navy
  // everywhere. It now writes the real shadcn tokens, derived by
  // schoolThemeVars, so the royal *structure* is the product and the colours
  // belong to the school. A school that has chosen nothing gets the navy and
  // gold defaults, which are exactly the values already in :root.
  //
  // These are inline styles, so they beat the .dark class selector — which is
  // why the mode has to be an input here rather than something the stylesheet
  // is left to settle. React runs the cleanup and the new effect in one commit,
  // and both modes produce the same set of keys (asserted in theme.test.ts), so
  // a flip cannot strand a stale token or paint a frame half-lit.
  const primaryColor = preview?.primaryColor ?? branding.primaryColor;
  const accentColor = preview?.accentColor ?? branding.accentColor;
  const { mode } = useThemeMode();

  useEffect(() => {
    const root = document.documentElement;
    const vars = schoolThemeVars(primaryColor, accentColor, mode);
    for (const [token, value] of Object.entries(vars)) {
      root.style.setProperty(token, value);
    }
    return () => {
      for (const token of Object.keys(vars)) root.style.removeProperty(token);
    };
  }, [primaryColor, accentColor, mode]);

  // Printed and emailed documents are generated outside React, so they read the
  // school's letterhead from this module-level publisher rather than from
  // context. Kept separate from the theme effect above because it follows the
  // *saved* branding: a colour being tried out in Settings should repaint the
  // screen, not the next invoice someone prints.
  useEffect(() => {
    setDocumentSchoolProfile({
      name: branding.name,
      address: branding.address,
      phone: branding.phone,
      email: branding.email,
      logoUrl: branding.logoUrl,
      tagline: branding.tagline,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
    });
  }, [branding]);

  return (
    <SchoolBrandingContext.Provider
      value={{ branding, loading, refetch: fetchBranding, previewColors: setPreview }}
    >
      {children}
    </SchoolBrandingContext.Provider>
  );
}

export const useSchoolBranding = () => useContext(SchoolBrandingContext);
