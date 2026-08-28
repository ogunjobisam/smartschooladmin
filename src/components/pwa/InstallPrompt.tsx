import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  hasDismissedInstall, isStandalone, rememberInstallDismissed,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa";

/**
 * A one-line offer to install the app, shown only when the browser says it can
 * and the user has not waved it away before.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || hasDismissedInstall()) return;

    const onPrompt = (e: Event) => {
      // Chromium shows its own mini-infobar unless this is prevented.
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!event) return null;

  const dismiss = () => {
    rememberInstallDismissed();
    setEvent(null);
  };

  const install = async () => {
    await event.prompt();
    await event.userChoice;
    // The event can only be used once, whichever way the choice went.
    setEvent(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm">
      <Download className="h-4 w-4 text-primary" />
      <span className="flex-1">
        Install Smart School on this device — it opens like an app and works on a
        weak connection.
      </span>
      <Button size="sm" onClick={install}>Install</Button>
      <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Not now">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
