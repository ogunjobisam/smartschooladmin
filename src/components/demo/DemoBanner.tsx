import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FlaskConical, Clock } from "lucide-react";
import {
  clearDemoSession, formatTimeLeft, requestDemoCleanup,
} from "@/lib/demo";

/**
 * Sits above the app while a demo session is running.
 *
 * The countdown is honest about what happens at the end: the sandbox and
 * everything in it is deleted, so nothing a visitor types here survives.
 */
export function DemoBanner() {
  const { orgId, signOut } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  const { data: demo } = useQuery({
    queryKey: ["demo-org", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("organisation_groups")
        .select("is_demo, demo_expires_at")
        .eq("id", orgId!)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const expiresAt = demo?.is_demo && demo.demo_expires_at ? new Date(demo.demo_expires_at) : null;

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (!expiresAt || expiresAt.getTime() > now) return;
    // Time is up: ask the server to erase the sandbox, then drop the session.
    (async () => {
      await requestDemoCleanup();
      clearDemoSession();
      await signOut();
      navigate("/?demo=expired", { replace: true });
    })();
  }, [expiresAt, now, signOut, navigate]);

  if (!expiresAt) return null;

  const endDemo = async () => {
    await requestDemoCleanup();
    clearDemoSession();
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-accent/10 px-4 py-2 text-sm">
      <FlaskConical className="h-4 w-4 shrink-0 text-accent" />
      <span className="font-medium">Demo session</span>
      <span className="text-muted-foreground">
        Sample data only — this sandbox and everything you change in it is deleted when the timer ends.
      </span>
      <span className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formatTimeLeft(expiresAt.getTime() - now)} left
        </span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={endDemo}>
          End demo
        </Button>
      </span>
    </div>
  );
}
