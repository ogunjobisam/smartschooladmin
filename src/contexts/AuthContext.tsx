import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface SchoolOption {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  orgId: string | null;
  schoolId: string | null;
  currency: string;
  schools: SchoolOption[];
  setSchoolId: (id: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, userRole: null, orgId: null, schoolId: null, currency: "NGN", schools: [], setSchoolId: () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [currency, setCurrency] = useState("NGN");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setUserRole(null);
        setOrgId(null);
        setSchoolId(null);
        setSchools([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch role, org, schools when user changes
  useEffect(() => {
    if (!user) return;
    
    const fetchRole = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role, org_id, school_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      setUserRole(data?.role ?? null);
      setOrgId(data?.org_id ?? null);

      // Fetch all schools in org for the switcher + org currency
      if (data?.org_id) {
        const [{ data: orgSchools }, { data: orgData }] = await Promise.all([
          supabase.from('schools').select('id, name').eq('org_id', data.org_id).order('name'),
          supabase.from('organisation_groups').select('currency').eq('id', data.org_id).maybeSingle(),
        ]);
        setSchools(orgSchools || []);
        if (orgData?.currency) setCurrency(orgData.currency);

        // Set initial school
        if (data?.school_id) {
          setSchoolId(data.school_id);
        } else if (orgSchools && orgSchools.length > 0) {
          setSchoolId(orgSchools[0].id);
        }
      }
      setLoading(false);
    };
    fetchRole();
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setOrgId(null);
    setSchoolId(null);
    setSchools([]);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, orgId, schoolId, currency, schools, setSchoolId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
