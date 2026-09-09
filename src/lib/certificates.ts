import { DOCUMENT_VIEWPORT_META, documentTheme, openDocument, type DocumentSchool } from "@/lib/document-theme";
/**
 * Printable output for the achievement wall.
 *
 * A published recognition has two paper forms, and schools use both: a
 * certificate the child takes home and frames, and a letter the head signs and
 * files. Both are generated from the same record so the wording, the date and
 * the spelling of the name cannot drift between them.
 */

export type RecognitionSubject = "student" | "staff";

export interface RecognitionCategory {
  value: string;
  label: string;
  /** Which kind of person the category is meant for. */
  applies: RecognitionSubject[];
  /** Wording used on the certificate under the title. */
  citation: string;
}

export const RECOGNITION_CATEGORIES: RecognitionCategory[] = [
  {
    value: "best_in_class",
    label: "Best in Class",
    applies: ["student"],
    citation: "in recognition of the highest overall performance in the class",
  },
  {
    value: "best_graduating",
    label: "Best Graduating Student",
    applies: ["student"],
    citation: "in recognition of outstanding academic achievement across the graduating year",
  },
  {
    value: "subject_prize",
    label: "Subject Prize",
    applies: ["student"],
    citation: "for distinguished achievement in this subject",
  },
  {
    value: "attendance",
    label: "Attendance Award",
    applies: ["student", "staff"],
    citation: "for an exemplary record of punctuality and attendance",
  },
  {
    value: "conduct",
    label: "Conduct & Character",
    applies: ["student"],
    citation: "for conduct that sets an example to the whole school",
  },
  {
    value: "leadership",
    label: "Leadership",
    applies: ["student", "staff"],
    citation: "for leadership shown in the service of the school community",
  },
  {
    value: "teacher_of_term",
    label: "Teacher of the Term",
    applies: ["staff"],
    citation: "in appreciation of outstanding teaching this term",
  },
  {
    value: "long_service",
    label: "Long Service",
    applies: ["staff"],
    citation: "in grateful recognition of long and faithful service to the school",
  },
  {
    value: "staff_award",
    label: "Staff Commendation",
    applies: ["staff"],
    citation: "in appreciation of dedicated service to the school",
  },
  {
    value: "prefect",
    label: "Prefect Appointment",
    applies: ["student"],
    citation: "having been appointed to serve the school in this office",
  },
  { value: "other", label: "Other award", applies: ["student", "staff"], citation: "in recognition of this achievement" },
];

export function categoryLabel(value: string | null | undefined): string {
  return RECOGNITION_CATEGORIES.find((c) => c.value === value)?.label ?? "Award";
}

export function categoriesFor(subject: RecognitionSubject): RecognitionCategory[] {
  return RECOGNITION_CATEGORIES.filter((c) => c.applies.includes(subject));
}

export interface CertificateSchool {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  tagline?: string | null;
}

export interface CertificateRecipient {
  name: string;
  subjectType: RecognitionSubject;
  idNumber?: string | null;
  className?: string | null;
  title: string;
  category?: string | null;
  description?: string | null;
  awardDate?: string | null;
  periodName?: string | null;
  subjectName?: string | null;
  /** Square award photo, already signed/loadable by the browser. */
  photoUrl?: string | null;
}

export type CertificateKind = "certificate" | "letter";

export interface CertificateOptions {
  kind: CertificateKind;
  signatoryName?: string;
  signatoryRole?: string;
  /** Optional second signature line, e.g. the head of the parents' association. */
  countersignName?: string;
  countersignRole?: string;
  /** Extra sentence added to the letter, in the school's own words. */
  note?: string;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function longDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function citationFor(r: CertificateRecipient): string {
  const base = RECOGNITION_CATEGORIES.find((c) => c.value === r.category)?.citation
    ?? "in recognition of this achievement";
  if (r.category === "subject_prize" && r.subjectName) {
    return `for distinguished achievement in ${r.subjectName}`;
  }
  return base;
}

function contextLine(r: CertificateRecipient): string {
  const bits = [r.className, r.periodName, r.subjectName].filter((b) => b && b !== "—");
  return bits.join(" · ");
}

function signatureBlock(opts: CertificateOptions): string {
  const one = `
    <div style="text-align:center;min-width:200px">
      <div style="border-top:1px solid #94a3b8;margin-bottom:6px"></div>
      <div style="font-size:13px;font-weight:600">${esc(opts.signatoryName || "")}</div>
      <div style="font-size:11px;color:#64748b">${esc(opts.signatoryRole || "Head of School")}</div>
    </div>`;
  const two = opts.countersignName
    ? `
    <div style="text-align:center;min-width:200px">
      <div style="border-top:1px solid #94a3b8;margin-bottom:6px"></div>
      <div style="font-size:13px;font-weight:600">${esc(opts.countersignName)}</div>
      <div style="font-size:11px;color:#64748b">${esc(opts.countersignRole || "")}</div>
    </div>`
    : "";
  return `<div style="display:flex;gap:48px;justify-content:center;margin-top:44px">${one}${two}</div>`;
}

function certificateHtml(r: CertificateRecipient, opts: CertificateOptions, school: CertificateSchool): string {
  const logo = school.logoUrl
    ? `<img src="${esc(school.logoUrl)}" alt="" class="logo" />`
    : "";
  const context = contextLine(r);
  const photo = r.photoUrl
    ? `<img src="${esc(r.photoUrl)}" alt="" class="photo" />`
    : "";

  return `
  <section class="sheet certificate">
    <div class="frame">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
      <div class="inner">
        <header class="crest">
          ${logo}
          <div>
            <div class="school">${esc(school.name)}</div>
            ${school.tagline ? `<div class="tagline">${esc(school.tagline)}</div>` : ""}
          </div>
        </header>

        <div class="kicker">Certificate of Achievement</div>
        <div class="rule"><span></span>&#10038;<span></span></div>

        <div class="body">
          ${photo}
          <div class="body-text">
            <div class="awarded">This certificate is proudly presented to</div>
            <div class="name">${esc(r.name)}</div>
            ${context ? `<div class="context">${esc(context)}</div>` : ""}
            <div class="title">${esc(r.title)}</div>
            <div class="citation">${esc(citationFor(r))}</div>
            ${r.description ? `<div class="note">${esc(r.description)}</div>` : ""}
          </div>
        </div>

        <div class="seal">
          <div class="seal-inner">
            <span>Awarded</span>
            <strong>${esc(longDate(r.awardDate) || longDate(new Date().toISOString()))}</strong>
          </div>
        </div>

        ${signatureBlock(opts)}
        ${r.idNumber ? `<div class="ref">Ref: ${esc(r.idNumber)}</div>` : ""}
      </div>
    </div>
  </section>`;
}

function letterHtml(r: CertificateRecipient, opts: CertificateOptions, school: CertificateSchool): string {
  const isStaff = r.subjectType === "staff";
  const salutation = isStaff ? `Dear ${r.name},` : "Dear Parent or Guardian,";
  const context = contextLine(r);

  const body = isStaff
    ? `<p>It is my pleasure to inform you that you have been recognised with the <strong>${esc(r.title)}</strong>${
        r.periodName && r.periodName !== "—" ? ` for ${esc(r.periodName)}` : ""
      }, ${esc(citationFor(r))}.</p>
       <p>This recognition has been entered in the school's records and a certificate accompanies this letter.</p>`
    : `<p>It is my pleasure to inform you that <strong>${esc(r.name)}</strong>${
        r.className && r.className !== "—" ? ` of ${esc(r.className)}` : ""
      } has been awarded the <strong>${esc(r.title)}</strong>${
        r.periodName && r.periodName !== "—" ? ` for ${esc(r.periodName)}` : ""
      }, ${esc(citationFor(r))}.</p>
       <p>We are proud of this achievement and hope you will join us in congratulating your child. A certificate accompanies this letter for your records.</p>`;

  const extra = opts.note?.trim()
    ? `<p>${esc(opts.note.trim()).replace(/\n/g, "<br/>")}</p>`
    : "";

  return `
  <section class="sheet letter">
    <header style="border-bottom:3px solid var(--brand);padding-bottom:12px;margin-bottom:24px;display:flex;gap:14px;align-items:center">
      ${school.logoUrl ? `<img src="${esc(school.logoUrl)}" alt="" style="height:48px;border-radius:8px" />` : ""}
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--brand)">${esc(school.name)}</div>
        <div style="font-size:11px;color:#64748b">${[school.address, school.phone, school.email].filter(Boolean).map(esc).join(" · ")}</div>
      </div>
    </header>
    ${r.photoUrl ? `<img src="${esc(r.photoUrl)}" alt="" style="float:right;width:84px;height:84px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;margin:0 0 12px 16px" />` : ""}
    <div style="font-size:12px;color:#64748b;margin-bottom:18px">${esc(longDate(r.awardDate) || longDate(new Date().toISOString()))}</div>
    <p style="margin:0 0 14px">${esc(salutation)}</p>
    <p style="margin:0 0 14px"><strong>Subject: ${esc(r.title)}</strong></p>
    ${body}
    ${extra}
    ${r.description ? `<p style="color:#334155">${esc(r.description)}</p>` : ""}
    ${
      r.idNumber || context
        ? `<p style="font-size:12px;color:#64748b">${[r.idNumber ? `ID: ${esc(r.idNumber)}` : "", esc(context)]
            .filter(Boolean)
            .join(" · ")}</p>`
        : ""
    }
    <p style="margin:24px 0 0">Yours sincerely,</p>
    ${signatureBlock(opts)}
  </section>`;
}

export function buildCertificatesDocument(
  recipients: CertificateRecipient[],
  opts: CertificateOptions,
  school: CertificateSchool,
): string {
  const label = opts.kind === "certificate" ? "certificate" : "letter";
  const body = recipients
    .map((r) => (opts.kind === "certificate" ? certificateHtml(r, opts, school) : letterHtml(r, opts, school)))
    .join("");

  const t = documentTheme(school as unknown as DocumentSchool);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${DOCUMENT_VIEWPORT_META}<title>${esc(`${school.name} — ${label}s`)}</title>
<style>
  :root { --brand: ${t.primary}; --brand-accent: ${t.accent}; --on-brand: ${t.onPrimary}; --brand-soft: ${t.soft}; --brand-border: ${t.border}; }
  @page { size: ${opts.kind === "certificate" ? "A4 landscape" : "A4"}; margin: ${opts.kind === "certificate" ? "0" : "18mm"}; }
  @media print {
    .no-print { display: none; }
    body { padding: 0; background: #fff; }
    .sheet { page-break-after: always; box-shadow: none; margin: 0; }
    .certificate { width: 297mm; height: 210mm; padding: 0; }
  }
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; color: #1f2937; background: #eef1f6; margin: 0; padding: 24px 16px; }
  .sheet { background: #fff; margin: 0 auto 24px; box-shadow: 0 6px 24px rgba(15,23,42,.14); }
  .letter { padding: 32px; max-width: 780px; }
  @media screen and (max-width: 760px) {
    body { padding: 12px 8px; }
    .letter { padding: 18px 16px; }
    .scale-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .certificate { transform: scale(.34); transform-origin: top left; }
    .sheet.certificate { width: 100%; height: calc(210mm * .34); overflow: hidden; }
  }
  .letter p { line-height: 1.7; margin: 0 0 12px; }

  /* Certificate: full A4 landscape sheet, one award per page. */
  .certificate { width: 297mm; height: 210mm; padding: 0; box-sizing: border-box; }
  .certificate .frame {
    position: relative; box-sizing: border-box; margin: 8mm; height: calc(100% - 16mm);
    border: 2px solid #b08d3f; outline: 6px solid #f6efe0; outline-offset: -10px;
    background:
      radial-gradient(circle at 12% 12%, rgba(176,141,63,.10), transparent 46%),
      radial-gradient(circle at 88% 88%, rgba(176,141,63,.10), transparent 46%),
      #fffdf8;
  }
  .certificate .frame::before, .certificate .frame::after {
    content: ''; position: absolute; left: 0; right: 0; height: 5mm;
    background: linear-gradient(90deg, var(--brand) 0%, var(--brand) 62%, var(--brand-accent) 62%, var(--brand-accent) 100%);
    opacity: .92;
  }
  .certificate .frame::before { top: 0; }
  .certificate .frame::after { bottom: 0; }
  .certificate .inner { position: relative; height: 100%; box-sizing: border-box; padding: 16mm 22mm 12mm; text-align: center; display: flex; flex-direction: column; }
  .certificate .corner { position: absolute; width: 22px; height: 22px; border: 2px solid #b08d3f; }
  .certificate .corner.tl { top: 8px; left: 8px; border-right: 0; border-bottom: 0; }
  .certificate .corner.tr { top: 8px; right: 8px; border-left: 0; border-bottom: 0; }
  .certificate .corner.bl { bottom: 8px; left: 8px; border-right: 0; border-top: 0; }
  .certificate .corner.br { bottom: 8px; right: 8px; border-left: 0; border-top: 0; }

  .certificate .crest { display: flex; gap: 12px; align-items: center; justify-content: center; }
  .certificate .logo { height: 52px; }
  .certificate .school { font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--brand); }
  .certificate .tagline { font-size: 11px; color: #8a7a52; font-style: italic; letter-spacing: .04em; }
  .certificate .kicker { margin-top: 14px; font-family: Georgia, serif; font-size: 15px; letter-spacing: .34em; text-transform: uppercase; color: #b08d3f; }
  .certificate .rule { display: flex; align-items: center; justify-content: center; gap: 10px; color: #b08d3f; font-size: 12px; margin: 8px 0 6px; }
  .certificate .rule span { display: block; width: 90px; height: 1px; background: linear-gradient(90deg, transparent, #b08d3f); }
  .certificate .rule span:last-child { background: linear-gradient(90deg, #b08d3f, transparent); }

  .certificate .body { display: flex; align-items: center; justify-content: center; gap: 26px; flex: 1; }
  .certificate .body-text { max-width: 700px; }
  .certificate .photo { width: 34mm; height: 34mm; object-fit: cover; border-radius: 4px; border: 2px solid #e4d7b4; box-shadow: 0 2px 6px rgba(15,23,42,.12); }
  .certificate .awarded { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #8a7a52; }
  .certificate .name { font-family: Georgia, 'Times New Roman', serif; font-size: 40px; font-weight: 700; line-height: 1.15; margin: 6px 0 2px; color: var(--brand); }
  .certificate .context { font-size: 12px; color: #64748b; }
  .certificate .title { margin: 14px 0 4px; font-size: 19px; font-weight: 600; letter-spacing: .02em; color: var(--brand); }
  .certificate .citation { font-size: 13px; line-height: 1.6; color: #475569; font-style: italic; }
  .certificate .note { font-size: 12px; color: #64748b; margin-top: 8px; }

  .certificate .seal { display: flex; justify-content: center; margin-top: 4px; }
  .certificate .seal-inner { width: 26mm; height: 26mm; border-radius: 50%; border: 2px solid #b08d3f; background: #fdf8ec; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
  .certificate .seal-inner span { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: #8a7a52; }
  .certificate .seal-inner strong { font-size: 9px; text-align: center; padding: 0 4px; color: #6b5a32; }
  .certificate .ref { position: absolute; bottom: 6mm; right: 10mm; font-size: 9px; color: #94a3b8; }
</style></head><body>
  <div class="no-print" style="text-align:center;margin:0 0 20px">
    <button onclick="window.print()" style="padding:10px 24px;background:var(--brand);color:var(--on-brand);border:none;border-radius:8px;font-size:14px;cursor:pointer">
      Print ${recipients.length} ${label}${recipients.length === 1 ? "" : "s"}
    </button>
  </div>
  ${body}
</body></html>`;
}

export function printCertificates(
  recipients: CertificateRecipient[],
  opts: CertificateOptions,
  school: CertificateSchool,
): boolean {
  if (recipients.length === 0) return false;
  return openDocument(buildCertificatesDocument(recipients, opts, school));
}
