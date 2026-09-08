/**
 * The SmartSchoolAdmin logo, from the official brand kit.
 *
 * `variant` picks the lockup: the full horizontal logo, the square mark on its
 * own, or the stacked version. `tone` swaps to the white artwork for use on the
 * teal brand background. Always rendered as one word: SmartSchoolAdmin.
 */

type LogoVariant = "full" | "mark" | "stacked" | "wordmark";
type LogoTone = "colour" | "white";

const sources: Record<LogoVariant, Record<LogoTone, string>> = {
  full: { colour: "/brand/logo-full.svg", white: "/brand/logo-full-white.svg" },
  mark: { colour: "/brand/logo-mark.svg", white: "/brand/logo-mark-white.svg" },
  stacked: { colour: "/brand/logo-stacked.svg", white: "/brand/logo-stacked.svg" },
  wordmark: { colour: "/brand/wordmark.svg", white: "/brand/wordmark-white.svg" },
};

interface LogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  className?: string;
  /** Accessible label; pass "" for decorative use beside visible text. */
  alt?: string;
}

export function Logo({ variant = "full", tone = "colour", className, alt = "SmartSchoolAdmin" }: LogoProps) {
  return (
    <img
      src={sources[variant][tone]}
      alt={alt}
      className={className}
      draggable={false}
      loading="eager"
      decoding="async"
    />
  );
}

export default Logo;
