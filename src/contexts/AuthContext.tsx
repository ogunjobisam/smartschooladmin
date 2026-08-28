import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { diagnoseError, type ErrorDiagnosis } from "@/lib/errors";

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
  /**
   * Set when the role lookup itself failed, as opposed to succeeding and
   * finding no organisation. The two look identical downstream — both leave
   * orgId null — but they need opposite treatment: one is a new user who
   * should onboard, the other is a working account that cannot be read.
   */
  roleError: ErrorDiagnosis | null;
  retryRole: () => void;
  setSchoolId: (id: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, userRole: null, orgId: null, schoolId: null, currency: "NGN", schools: [], roleError: null, retryRole: () => {}, setSchoolId: () => {}, signOut: async () => {},
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
  const [roleError, setRoleError] = useState<ErrorDiagnosis | null>(null);
  const [roleAttempt, setRoleAttempt] = useState(0);

  const retryRole = useCallback(() => setRoleAttempt((n) => n + 1), []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setUserRole(null);
        setOrgId(null);
        setSchoolId(null);
        setSchools([]);
        setRoleError(null);
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

  // Fetch role, org and schools when the signed-in user changes.
  //
  // Keyed on the user id, not the user object: a token refresh hands us a new
  // object for the same person, and re-running this would reset the school
  // switcher back to the default while someone is working in another school.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchRole = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_my_role');
        if (error) throw error;
        if (cancelled) return;

        setRoleError(null);
        const row = Array.isArray(data) ? data[0] : data;
        setUserRole(row?.role ?? null);
        setOrgId(row?.org_id ?? null);

        // Fetch all schools in org for the switcher + org currency
        if (row?.org_id) {
          const [{ data: orgSchools }, { data: orgData }] = await Promise.all([
            supabase.from('schools').select('id, name').eq('org_id', row.org_id).order('name'),
            supabase.from('organisation_groups').select('currency').eq('id', row.org_id).maybeSingle(),
          ]);
          if (cancelled) return;

          setSchools(orgSchools || []);
          if (orgData?.currency) setCurrency(orgData.currency);

          // Pick an initial school, but never override one already chosen.
          setSchoolId((current) => current ?? row.school_id ?? orgSchools?.[0]?.id ?? null);
        }
      } catch (err) {
        // Never leave the app stuck behind a spinner — but never swallow this
        // either. Failing quietly here sent people with working accounts into
        // the org-creation wizard with nothing on screen to explain it, which
        // reads as "I cannot sign in" and leaves no evidence outside the
        // browser console. ProtectedRoute shows the diagnosis instead.
        console.error('Failed to load user role:', err);
        if (!cancelled) {
          setUserRole(null);
          setOrgId(null);
          setRoleError(diagnoseError(err, 'Could not read your role.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRole();
    return () => { cancelled = true; };
  }, [userId, roleAttempt]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setOrgId(null);
    setSchoolId(null);
    setSchools([]);
    setRoleError(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, orgId, schoolId, currency, schools, roleError, retryRole, setSchoolId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
