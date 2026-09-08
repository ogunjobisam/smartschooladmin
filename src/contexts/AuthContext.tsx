import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { diagnoseError, type ErrorDiagnosis } from "@/lib/errors";
import { previewableRoles } from "@/lib/roles";

interface SchoolOption {
  id: string;
  name: string;
}

interface OrgOption {
  id: string;
  name: string;
}

interface RoleRow {
  role: string;
  org_id: string | null;
  school_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  /**
   * Every role the user holds in the organisation they are working in.
   * `userRole` is the most senior of these and drives navigation and gating.
   */
  userRoles: string[];
  /** The role actually granted to this account, ignoring any preview. */
  realRole: string | null;
  /** Every granted role in this organisation, ignoring any preview. */
  realRoles: string[];
  /** The role currently being previewed, or null when working as yourself. */
  viewAsRole: string | null;
  /** Start or stop previewing the app as a more junior role. */
  setViewAsRole: (role: string | null) => void;
  orgId: string | null;
  schoolId: string | null;
  currency: string;
  schools: SchoolOption[];
  /** Every organisation this account holds a role in, for the workspace switcher. */
  orgs: OrgOption[];
  /**
   * True when the account spans more than one organisation (or more than one
   * school) and the user has not yet said which one they are signing into.
   */
  needsWorkspaceChoice: boolean;
  roleError: ErrorDiagnosis | null;
  retryRole: () => void;
  setSchoolId: (id: string) => void;
  /** Switch organisation. Resets the school to one inside that organisation. */
  setOrgId: (id: string) => void;
  /** Records the current org/school as the deliberate choice for this account. */
  confirmWorkspace: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, userRole: null, userRoles: [], realRole: null, realRoles: [],
  viewAsRole: null, setViewAsRole: () => {}, orgId: null, schoolId: null,
  currency: "NGN", schools: [], orgs: [], needsWorkspaceChoice: false, roleError: null,
  retryRole: () => {}, setSchoolId: () => {}, setOrgId: () => {}, confirmWorkspace: () => {}, signOut: async () => {},
});

const orgKey = (userId: string) => `smartschool.workspace.org.${userId}`;
const schoolKey = (userId: string) => `smartschool.workspace.school.${userId}`;
const viewAsKey = (userId: string) => `smartschool.viewAs.${userId}`;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable — the choice simply won't survive a reload */
  }
}

/** Most senior role first, matching the rank order the database returns. */
function rolesForOrg(rows: RoleRow[], activeOrgId: string | null) {
  return rows.filter((r) => r.org_id === activeOrgId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [schoolId, setSchoolIdState] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [currency, setCurrency] = useState("NGN");
  const [roleError, setRoleError] = useState<ErrorDiagnosis | null>(null);
  const [roleAttempt, setRoleAttempt] = useState(0);
  const [workspaceConfirmed, setWorkspaceConfirmed] = useState(false);

  const retryRole = useCallback(() => setRoleAttempt((n) => n + 1), []);

  const resetAccount = () => {
    setRoleRows([]);
    setOrgIdState(null);
    setSchoolIdState(null);
    setOrgs([]);
    setSchools([]);
    setRoleError(null);
    setWorkspaceConfirmed(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        resetAccount();
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

  // Keyed on the user id, not the user object: a token refresh hands us a new
  // object for the same person, and re-running this would reset the workspace
  // switcher while someone is working in another school.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchRole = async () => {
      setLoading(true);
      try {
        // get_my_roles returns every role the user holds, most senior first —
        // across every organisation, which is what makes the switcher possible.
        const { data, error } = await supabase.rpc("get_my_roles");
        if (error) throw error;
        if (cancelled) return;

        setRoleError(null);
        const rows = (Array.isArray(data) ? data : data ? [data] : []) as RoleRow[];
        setRoleRows(rows);

        const orgIds = [...new Set(rows.map((r) => r.org_id).filter((id): id is string => !!id))];

        if (orgIds.length === 0) {
          setOrgs([]);
          setOrgIdState(null);
          return;
        }

        const { data: orgRows } = await supabase
          .from("organisation_groups")
          .select("id, name, currency")
          .in("id", orgIds)
          .order("name");
        if (cancelled) return;

        const options = (orgRows || []).map((o) => ({ id: o.id, name: o.name }));
        setOrgs(options.length ? options : orgIds.map((id) => ({ id, name: "Organisation" })));

        // Honour a previous choice as long as the account still has that role.
        const stored = readStored(orgKey(userId));
        const initialOrg = stored && orgIds.includes(stored) ? stored : orgIds[0];
        setWorkspaceConfirmed(!!stored && orgIds.includes(stored));
        setOrgIdState((current) => (current && orgIds.includes(current) ? current : initialOrg));
      } catch (err) {
        // Never leave the app stuck behind a spinner — but never swallow this
        // either. ProtectedRoute shows the diagnosis instead of pushing a
        // working account into the org-creation wizard.
        console.error("Failed to load user role:", err);
        if (!cancelled) {
          setRoleRows([]);
          setOrgIdState(null);
          setRoleError(diagnoseError(err, "Could not read your role."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRole();
    return () => { cancelled = true; };
  }, [userId, roleAttempt]);

  // Schools and currency follow the organisation currently being worked in.
  useEffect(() => {
    if (!orgId || !userId) {
      setSchools([]);
      return;
    }
    let cancelled = false;

    const loadOrg = async () => {
      const [{ data: orgSchools }, { data: orgData }] = await Promise.all([
        supabase.from("schools").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("organisation_groups").select("currency").eq("id", orgId).maybeSingle(),
      ]);
      if (cancelled) return;

      // A school-scoped role (principal, bursar, teacher…) only ever switches
      // between the schools it was granted. Org-level roles see all of them.
      const scoped = rolesForOrg(roleRows, orgId);
      const allowedSchoolIds = scoped.map((r) => r.school_id).filter((id): id is string => !!id);
      const orgWide = scoped.some((r) => !r.school_id);
      const list = (orgSchools || []).filter((s) => orgWide || allowedSchoolIds.includes(s.id));

      setSchools(list);
      if (orgData?.currency) setCurrency(orgData.currency);

      const storedSchool = readStored(schoolKey(userId));
      setSchoolIdState((current) => {
        if (current && list.some((s) => s.id === current)) return current;
        if (storedSchool && list.some((s) => s.id === storedSchool)) return storedSchool;
        return allowedSchoolIds[0] ?? list[0]?.id ?? null;
      });
    };

    loadOrg();
    return () => { cancelled = true; };
  }, [orgId, userId, roleRows]);

  const activeRoles = useMemo(() => rolesForOrg(roleRows, orgId), [roleRows, orgId]);
  const realRoles = useMemo(() => activeRoles.map((r) => r.role), [activeRoles]);
  const realRole = realRoles[0] ?? null;

  // Previewing another role changes what the interface offers, never what the
  // database will hand over: row-level security still answers to the real
  // account. Only a role more junior than your own may be previewed.
  const [viewAsRole, setViewAsRoleState] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setViewAsRoleState(null); return; }
    const stored = readStored(viewAsKey(userId));
    setViewAsRoleState(stored && previewableRoles(realRole).includes(stored) ? stored : null);
  }, [userId, realRole]);

  const setViewAsRole = useCallback((role: string | null) => {
    const next = role && previewableRoles(realRole).includes(role) ? role : null;
    setViewAsRoleState(next);
    if (userId) writeStored(viewAsKey(userId), next);
  }, [userId, realRole]);

  const userRoles = useMemo(() => (viewAsRole ? [viewAsRole] : realRoles), [viewAsRole, realRoles]);
  const userRole = userRoles[0] ?? null;

  const setSchoolId = useCallback((id: string) => {
    setSchoolIdState(id);
    if (userId) writeStored(schoolKey(userId), id);
  }, [userId]);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    setSchoolIdState(null);
    if (userId) {
      writeStored(orgKey(userId), id);
      writeStored(schoolKey(userId), null);
    }
  }, [userId]);

  const confirmWorkspace = useCallback(() => {
    if (userId) {
      writeStored(orgKey(userId), orgId);
      writeStored(schoolKey(userId), schoolId);
    }
    setWorkspaceConfirmed(true);
  }, [userId, orgId, schoolId]);

  // Only ask when there is a real decision to make: several organisations, or
  // several schools inside one. A single-school account never sees this.
  const needsWorkspaceChoice =
    !loading && !!user && !workspaceConfirmed && (orgs.length > 1 || schools.length > 1);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    resetAccount();
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, userRole, userRoles, orgId, schoolId, currency, schools, orgs,
        needsWorkspaceChoice, roleError, retryRole, setSchoolId, setOrgId, confirmWorkspace, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
