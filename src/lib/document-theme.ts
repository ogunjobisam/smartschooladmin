/**
 * Shared look for every document the app prints or emails.
 *
 * Anything a school hands to a parent, a bank or a student — invoice, receipt,
 * statement, payslip, transcript, letter, certificate, ID card — is generated as
 * a standalone HTML document. This module is the single place their design lives,
 * so they all carry the same letterhead, typography, spacing and a splash of the
 * school's own colours and logo.
 *
 * Colours come from the school record (`primary_color`, `accent_color`). Since
 * most call sites only pass name/address/logo, the branding context publishes the
 * selected school's palette here with `setDocumentPalette()` and every generator
 * picks it up automatically.
 */

export interface DocumentSchool {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  tagline?: string | null;
}

const FALLBACK_PRIMARY = "#0f172a";
const FALLBACK_ACCENT = "#3b82f6";
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

let palette: { primaryColor: string; accentColor: string } = {
  primaryColor: FALLBACK_PRIMARY,
  accentColor: FALLBACK_ACCENT,
};

/** Called by the branding context whenever the selected school changes. */
export function setDocumentPalette(next: { primaryColor?: string | null; accentColor?: string | null }) {
  palette = {
    primaryColor: normaliseHex(next.primaryColor, FALLBACK_PRIMARY),
    accentColor: normaliseHex(next.accentColor, FALLBACK_ACCENT),
  };
}

function normaliseHex(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!HEX.test(raw)) return fallback;
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return raw.toLowerCase();
}

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function toRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mix a colour toward white — used for tints that stay printable. */
function tint(hex: string, amount: number): string {
  const { r, g, b } = toRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Readable text colour on a brand-coloured fill. */
function readableOn(hex: string): string {
  const { r, g, b } = toRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0f172a" : "#ffffff";
}

export interface DocumentTheme {
  primary: string;
  accent: string;
  onPrimary: string;
  soft: string;
  softer: string;
  border: string;
}

export function documentTheme(school?: DocumentSchool | null): DocumentTheme {
  const primary = normaliseHex(school?.primaryColor, palette.primaryColor);
  const accent = normaliseHex(school?.accentColor, palette.accentColor);
  return {
    primary,
    accent,
    onPrimary: readableOn(primary),
    soft: tint(primary, 0.92),
    softer: tint(accent, 0.94),
    border: rgba(primary, 0.16),
  };
}

export type DocumentSize = "a4" | "a4-landscape" | "narrow";

interface DocumentCssOptions {
  size?: DocumentSize;
  /** Page width of the content column. Defaults per size. */
  maxWidth?: number;
}

/**
 * The whole stylesheet for a printed document: page setup, typography, tables,
 * cards, chips and the brand variables everything else refers to.
 */
export function documentCss(school: DocumentSchool | null | undefined, opts: DocumentCssOptions = {}): string {
  const t = documentTheme(school);
  const size = opts.size ?? "a4";
  const width = opts.maxWidth ?? (size === "narrow" ? 640 : size === "a4-landscape" ? 1100 : 840);
  const pageRule =
    size === "a4-landscape" ? "@page { size: A4 landscape; margin: 12mm; }" : "@page { size: A4; margin: 16mm; }";

  return `
  ${pageRule}
  :root {
    --brand: ${t.primary};
    --brand-accent: ${t.accent};
    --on-brand: ${t.onPrimary};
    --brand-soft: ${t.soft};
    --brand-softer: ${t.softer};
    --brand-border: ${t.border};
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e6ebf1;
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    background: #ffffff;
    font-size: 13px;
    line-height: 1.5;
    max-width: ${width}px;
    margin: 0 auto;
    padding: 28px 26px 40px;
  }
  h1, h2, h3 { margin: 0; line-height: 1.25; letter-spacing: -0.01em; }
  p { margin: 0; }
  .muted { color: var(--muted); }
  .mono { font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }

  /* Letterhead */
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .doc-brand { display: flex; gap: 14px; align-items: center; }
  .doc-logo { height: 58px; width: 58px; object-fit: contain; border-radius: 12px; background: #fff; border: 1px solid var(--brand-border); padding: 3px; }
  .doc-monogram {
    height: 58px; width: 58px; border-radius: 12px; background: var(--brand); color: var(--on-brand);
    display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;
  }
  .doc-school { font-size: 19px; font-weight: 700; color: var(--brand); }
  .doc-contact { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .doc-kicker { font-size: 10px; text-transform: uppercase; letter-spacing: .16em; color: var(--muted); }
  .doc-title { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .doc-meta { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .doc-rule { height: 4px; border-radius: 4px; margin: 14px 0 22px;
    background: linear-gradient(90deg, var(--brand) 0%, var(--brand) 55%, var(--brand-accent) 55%, var(--brand-accent) 100%); }

  /* Blocks */
  .card { border: 1px solid var(--brand-border); border-radius: 12px; padding: 16px 18px; background: var(--brand-soft); }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 22px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
  .value { font-weight: 600; margin-top: 3px; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em;
    color: var(--brand); margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--brand-border); }

  /* Tables */
  table.doc { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  table.doc thead th {
    text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
    color: var(--brand); background: var(--brand-soft); padding: 9px 12px; border-bottom: 2px solid var(--brand-border);
  }
  table.doc tbody td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.doc tbody tr:nth-child(even) td { background: rgba(15, 23, 42, 0.015); }
  table.doc .num { text-align: right; font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.doc tfoot td { padding: 11px 12px; font-weight: 700; border-top: 2px solid var(--brand); }

  .chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .05em; background: var(--brand-soft); color: var(--brand); }
  .chip-solid { background: var(--brand); color: var(--on-brand); }
  .chip-good { background: #dcfce7; color: #166534; }
  .chip-warn { background: #fef3c7; color: #92400e; }
  .chip-bad { background: #fee2e2; color: #991b1b; }

  .total-box { margin-top: 18px; margin-left: auto; min-width: 300px; border-radius: 12px; overflow: hidden;
    border: 1px solid var(--brand-border); }
  .total-box .row { display: flex; justify-content: space-between; gap: 20px; padding: 9px 14px; font-size: 12.5px; }
  .total-box .row + .row { border-top: 1px solid var(--line); }
  .total-box .row.headline { background: var(--brand); color: var(--on-brand); font-weight: 700; font-size: 15px; border-top: 0; }

  .doc-foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--brand-border);
    font-size: 10.5px; color: var(--muted); display: flex; justify-content: space-between; gap: 16px; }

  .sign-row { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 42px; }
  .sign-line { border-top: 1px solid var(--ink); padding-top: 6px; font-size: 11px; color: var(--muted); }

  .actions { margin-top: 26px; text-align: center; }
  .actions button { padding: 11px 24px; background: var(--brand); color: var(--on-brand); border: 0;
    border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
  @media print { .no-print { display: none !important; } body { padding: 0; } }
`;
}

export function logoHtml(school: DocumentSchool, size = 58): string {
  const style = size === 58 ? "" : ` style="height:${size}px;width:${size}px;font-size:${Math.round(size * 0.4)}px"`;
  if (school.logoUrl) {
    return `<img class="doc-logo" src="${esc(school.logoUrl)}" alt=""${style} />`;
  }
  const initial = (school.name || "S").trim().charAt(0).toUpperCase();
  return `<div class="doc-monogram"${style}>${esc(initial)}</div>`;
}

export interface LetterheadOptions {
  /** Small label above the document title, e.g. "Statement of account". */
  kicker?: string;
  /** Large right-hand identifier, e.g. an invoice number. */
  title?: string;
  /** Extra right-hand lines, already plain text. */
  meta?: (string | null | undefined)[];
  /** Rendered as-is on the right, below the meta lines (chips etc). */
  extra?: string;
  logoSize?: number;
}

/** Branded letterhead plus the two-tone rule that sits under it. */
export function letterheadHtml(school: DocumentSchool, opts: LetterheadOptions = {}): string {
  const contact = [school.email, school.phone].filter(Boolean).join(" • ");
  const meta = (opts.meta || []).filter(Boolean) as string[];
  return `
  <div class="doc-head">
    <div class="doc-brand">
      ${logoHtml(school, opts.logoSize ?? 58)}
      <div>
        <h1 class="doc-school">${esc(school.name)}</h1>
        ${school.tagline ? `<p class="doc-contact">${esc(school.tagline)}</p>` : ""}
        ${school.address ? `<p class="doc-contact">${esc(school.address)}</p>` : ""}
        ${contact ? `<p class="doc-contact">${esc(contact)}</p>` : ""}
      </div>
    </div>
    <div style="text-align:right">
      ${opts.kicker ? `<p class="doc-kicker">${esc(opts.kicker)}</p>` : ""}
      ${opts.title ? `<p class="doc-title">${esc(opts.title)}</p>` : ""}
      ${meta.map((line) => `<p class="doc-meta">${esc(line)}</p>`).join("")}
      ${opts.extra || ""}
    </div>
  </div>
  <div class="doc-rule"></div>`;
}

export function footerHtml(school: DocumentSchool, note?: string): string {
  const right = school.phone ? `Questions? Call ${esc(school.phone)}` : esc(school.email || "");
  return `<div class="doc-foot"><span>${esc(note || "Computer-generated document — no signature required.")}</span><span>${right}</span></div>`;
}

export function printButtonHtml(label = "Print / Save as PDF"): string {
  return `<div class="no-print actions"><button onclick="window.print()">${esc(label)}</button></div>`;
}

export interface DocumentShellOptions extends DocumentCssOptions {
  title: string;
  body: string;
  extraCss?: string;
}

/** Wrap a body fragment in a complete, brand-styled HTML document. */
export function documentShell(school: DocumentSchool | null | undefined, opts: DocumentShellOptions): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>${esc(opts.title)}</title>
<style>${documentCss(school, { size: opts.size, maxWidth: opts.maxWidth })}${opts.extraCss || ""}</style>
</head><body>
${opts.body}
</body></html>`;
}

/** Open a generated document in a new tab. Returns false if popups are blocked. */
export function openDocument(html: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

export function shortDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Status → chip class, shared so a paid invoice looks the same everywhere. */
export function statusChipClass(status?: string | null): string {
  const s = String(status || "").toLowerCase();
  if (["paid", "sent", "published", "approved", "present", "active", "completed"].includes(s)) return "chip chip-good";
  if (["partial", "pending", "draft", "submitted", "late"].includes(s)) return "chip chip-warn";
  if (["overdue", "failed", "cancelled", "absent", "expelled"].includes(s)) return "chip chip-bad";
  return "chip";
}

export function statusChipHtml(status?: string | null): string {
  if (!status) return "";
  return `<span class="${statusChipClass(status)}">${esc(String(status).replace(/_/g, " "))}</span>`;
}
