import { useTheme } from "next-themes";
import { useCallback } from "react";
import type { ThemeMode } from "@/lib/theme";

/** What the person chose. `system` follows the operating system. */
export type ThemeSetting = "light" | "dark" | "system";

/**
 * Shared with the pre-paint script in index.html, which reads the same key
 * before React runs so the first frame is not the wrong colour.
 */
export const THEME_STORAGE_KEY = "theme";

/**
 * The one place the app asks which mode it is in.
 *
 * `mode` is the *resolved* mode and is never `undefined`, which matters more
 * than it looks: SchoolBrandingContext writes its tokens as inline styles, and
 * inline styles beat the `.dark` class selector. A single render with the wrong
 * mode paints light values onto a dark document and the app is half lit.
 * next-themes' `resolvedTheme` is undefined until it has mounted, so the class
 * already on the document is the fallback — the pre-paint script put it there
 * before React existed.
 *
 * This is a per-device preference in localStorage, deliberately NOT a column on
 * `schools`: one administrator turning the lights out must not darken the app
 * for everybody at their school.
 */
export function useThemeMode(): {
  mode: ThemeMode;
  setting: ThemeSetting;
  setSetting: (s: ThemeSetting) => void;
  toggle: () => void;
} {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const mode: ThemeMode =
    resolvedTheme === "dark"
      ? "dark"
      : resolvedTheme === "light"
        ? "light"
        : typeof document !== "undefined" && document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";

  const toggle = useCallback(
    () => setTheme(mode === "dark" ? "light" : "dark"),
    [mode, setTheme],
  );

  return {
    mode,
    setting: (theme ?? "system") as ThemeSetting,
    setSetting: setTheme as (s: ThemeSetting) => void,
    toggle,
  };
}
