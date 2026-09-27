import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // text-* on these three resolves to the ink, bg-* and border-* to the
      // fill. A status colour has to be both a filled badge carrying white text
      // and ink legible on a pale card, and one value cannot do both — the same
      // split --gold and --gold-ink already make. Doing it here rather than at
      // 171 call sites means the readable value is what you get by default.
      textColor: ({ theme }: { theme: (path: string) => Record<string, string> }) => ({
        ...theme("colors"),
        destructive: { ...theme("colors.destructive"), DEFAULT: "hsl(var(--destructive-ink))" },
        success: { ...theme("colors.success"), DEFAULT: "hsl(var(--success-ink))" },
        warning: { ...theme("colors.warning"), DEFAULT: "hsl(var(--warning-ink))" },
      }),
      fontFamily: {
        // Inter leads because it is the face the app actually loads and the
        // one `body` sets; Plus Jakarta Sans stays in the stack so `font-sans`
        // still names what main chose if it is ever loaded.
        sans: ["Inter", '"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        // One line to revisit if the ceremonial face ever changes. Body text
        // deliberately stays on the sans in `body`.
        display: ["Cinzel", "Georgia", "Times New Roman", "serif"],
      },
      colors: {
        // Gold is decorative (rules, edge bars, tiles). `gold.ink` is the
        // darkened variant that is legible as text on the cream ground, and
        // `gold.foreground` is the ink the landing page sets on a gold fill.
        gold: {
          DEFAULT: "hsl(var(--gold))",
          ink: "hsl(var(--gold-ink))",
          soft: "hsl(var(--gold-soft))",
          foreground: "hsl(var(--gold-foreground))",
          // For anything sitting on, or filling against, --primary.
          "on-primary": "hsl(var(--gold-on-primary))",
        },
        // The validated accent ramp — chart series and coloured icon tiles draw
        // from the same five. Fixed order; see the note in src/index.css.
        // The icon plaque. Dark in both modes — see tones.ts.
        tile: "hsl(var(--tile))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        brand: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          ice: "hsl(var(--brand-ice))",
          mint: "hsl(var(--brand-mint))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          ink: "hsl(var(--destructive-ink))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          ink: "hsl(var(--success-ink))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          ink: "hsl(var(--warning-ink))",
        },
        coral: {
          DEFAULT: "hsl(var(--coral))",
          foreground: "hsl(var(--coral-foreground))",
        },
        teal: {
          DEFAULT: "hsl(var(--teal))",
          foreground: "hsl(var(--teal-foreground))",
        },
        violet: {
          DEFAULT: "hsl(var(--violet))",
          foreground: "hsl(var(--violet-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          muted: "hsl(var(--sidebar-muted))",
        },
      },
      boxShadow: {
        // Cards sit on cream, not grey, so the shadow needs a warm cast and
        // less spread than shadcn's default or it reads as dirt.
        // --shadow-color, not --primary: --primary inverts to a pale colour in
        // dark mode, which would turn every one of these into a halo.
        royal: "0 1px 2px hsl(var(--shadow-color) / 0.04), 0 8px 24px -12px hsl(var(--shadow-color) / 0.18)",
        tile: "0 4px 12px -4px hsl(var(--shadow-color) / 0.35)",
      },
      borderRadius: {
        brand: "14px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
