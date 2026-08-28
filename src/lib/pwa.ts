/**
 * Progressive web app plumbing.
 *
 * A phone is the only computer many Nigerian school offices have, and an
 * installed app opens without a browser bar and survives a lost signal long
 * enough to finish a page you already had open.
 */

/** The event Chromium fires when it is willing to offer an install. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "smartschool.install-dismissed";

/**
 * Registers the service worker.
 *
 * Only in a production build: in dev the worker would cache Vite's module
 * graph and serve stale code long after a change, which is a miserable way to
 * lose an afternoon.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // A failed registration must never break the app — it only costs offline.
      console.warn("Service worker registration failed:", error);
    });
  });
}

/** Whether the app is already running installed rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari predates the standard and still reports it here.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function hasDismissedInstall(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Private browsing and locked-down devices throw rather than return null.
    return false;
  }
}

export function rememberInstallDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Nothing to do; the prompt simply reappears next time.
  }
}
