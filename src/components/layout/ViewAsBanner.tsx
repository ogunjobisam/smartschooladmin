import { Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { roleLabel } from "@/lib/roles";

/**
 * Always visible while a senior user is previewing a junior role — the preview
 * hides most of the menu, so this is the only reliable way back out.
 */
export function ViewAsBanner() {
  const { viewAsRole, setViewAsRole, realRole } = useAuth();
  if (!viewAsRole) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-accent/10 px-4 py-2 text-xs sm:text-sm">
      <Eye className="h-4 w-4 text-accent" />
      <span>
        Viewing as <strong>{roleLabel(viewAsRole)}</strong>
        <span className="hidden sm:inline"> — you are still signed in as {roleLabel(realRole || "")}, so the records shown are your own.</span>
      </span>
      <div className="ml-auto flex items-center gap-3">
        <Link to="/roles" className="text-xs font-medium text-accent underline-offset-2 hover:underline">
          Roles
        </Link>
        <button
          onClick={() => setViewAsRole(null)}
          className="inline-flex items-center gap-1 rounded border border-accent/30 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
        >
          <EyeOff className="h-3.5 w-3.5" /> Exit
        </button>
      </div>
    </div>
  );
}
