import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, schoolThemeVars } from "@/lib/theme";

interface SchoolBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  tagline: string | null;
}

const defaultBranding: SchoolBranding = {
  name: "Smart School Admin",
  logoUrl: null,
  primaryColor: DEFAULT_PRIMARY,
  accentColor: DEFAULT_ACCENT,
  tagline: null,
};

interface SchoolBrandingContextType {
  branding: SchoolBranding;
  loading: boolean;
  refetch: () => void;
}

const SchoolBrandingContext = createContext<SchoolBrandingContextType>({
  branding: defaultBranding,
  loading: true,
  refetch: () => {},
});

export function SchoolBrandingProvider({ children }: { children: ReactNode }) {
  const { schoolId } = useAuth();
  const [branding, setBranding] = useState<SchoolBranding>(defaultBranding);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    if (!schoolId) {
      setBranding(defaultBranding);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("schools")
      .select("name, logo_url, primary_color, accent_color, tagline")
      .eq("id", schoolId)
      .maybeSingle();

    if (data) {
      setBranding({
        name: data.name,
        logoUrl: data.logo_url,
        primaryColor: data.primary_color || defaultBranding.primaryColor,
        accentColor: data.accent_color || defaultBranding.accentColor,
        tagline: data.tagline,
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
  // These are light-mode values. Nothing in the app sets .dark today; when
  // something does, this needs a dark branch, and inline styles would win over
  // the .dark class until it has one — hence the guard.
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("dark")) return;
    const vars = schoolThemeVars(branding.primaryColor, branding.accentColor);
    for (const [token, value] of Object.entries(vars)) {
      root.style.setProperty(token, value);
    }
    return () => {
      for (const token of Object.keys(vars)) root.style.removeProperty(token);
    };
  }, [branding.primaryColor, branding.accentColor]);

  return (
    <SchoolBrandingContext.Provider value={{ branding, loading, refetch: fetchBranding }}>
      {children}
    </SchoolBrandingContext.Provider>
  );
}

export const useSchoolBranding = () => useContext(SchoolBrandingContext);
