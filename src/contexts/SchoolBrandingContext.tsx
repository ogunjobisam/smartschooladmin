import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  primaryColor: "#1e293b",
  accentColor: "#3b82f6",
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

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function SchoolBrandingProvider({ children }: { children: ReactNode }) {
  const { schoolId } = useAuth();
  const [branding, setBranding] = useState<SchoolBranding>(defaultBranding);
  const [loading, setLoading] = useState(true);

  const fetchBranding = async () => {
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
  };

  useEffect(() => {
    fetchBranding();
  }, [schoolId]);

  // Apply CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--school-primary", hexToHsl(branding.primaryColor));
    root.style.setProperty("--school-accent", hexToHsl(branding.accentColor));
    return () => {
      root.style.removeProperty("--school-primary");
      root.style.removeProperty("--school-accent");
    };
  }, [branding.primaryColor, branding.accentColor]);

  return (
    <SchoolBrandingContext.Provider value={{ branding, loading, refetch: fetchBranding }}>
      {children}
    </SchoolBrandingContext.Provider>
  );
}

export const useSchoolBranding = () => useContext(SchoolBrandingContext);
