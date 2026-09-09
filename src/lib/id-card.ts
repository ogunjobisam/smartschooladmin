import QRCode from "qrcode";

export interface IdCardData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  holderName: string;
  holderKind: "Student" | "Staff";
  idNumber: string;
  subtitle: string;
  photoUrl?: string | null;
  extraRows: { label: string; value: string }[];
  validUntil?: string | null;
  /** Absolute URL to the holder's profile inside the app — encoded into the QR code. */
  profileUrl?: string | null;
  /** Pre-rendered QR data URL (see buildProfileQr). */
  qrDataUrl?: string | null;
}

export interface IdCardRenderOptions {
  /** Add 3mm bleed around each card plus corner crop marks so trimming never shifts content. */
  cutGuides?: boolean;
  /** Render for on-screen preview (no print button / hints). */
  preview?: boolean;
}

/** Generate a QR code data URL pointing at the holder's profile. */
export async function buildProfileQr(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      margin: 0,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

export const CR80 = { width: 85.6, height: 54, bleed: 3 };

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Full standalone HTML document containing the CR80 front (page 1) and back (page 2). */
export function buildIdCardHtml(data: IdCardData, opts: IdCardRenderOptions = {}) {
  const { cutGuides = true, preview = false } = opts;
  const brand = data.primaryColor || "#1e293b";
  const initials = data.holderName.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const pageW = cutGuides ? CR80.width + CR80.bleed * 2 : CR80.width;
  const pageH = cutGuides ? CR80.height + CR80.bleed * 2 : CR80.height;

  const photoHtml = data.photoUrl
    ? `<img src="${esc(data.photoUrl)}" alt="${esc(data.holderName)}" class="photo" />`
    : `<div class="photo photo-fallback">${esc(initials)}</div>`;

  const logoHtml = data.logoUrl
    ? `<img src="${esc(data.logoUrl)}" alt="" class="logo" />`
    : `<div class="logo logo-fallback">${esc(data.schoolName[0] || "S")}</div>`;

  const qrFront = data.qrDataUrl
    ? `<img src="${data.qrDataUrl}" alt="Profile QR code" class="qr-front" />`
    : "";

  const qrBack = data.qrDataUrl
    ? `<div class="qr-back"><img src="${data.qrDataUrl}" alt="Profile QR code" /><small>Scan to verify</small></div>`
    : "";

  const rows = data.extraRows
    .map((r) => `<div class="row"><span class="k">${esc(r.label)}</span><span class="v">${esc(r.value)}</span></div>`)
    .join("");

  const marks = cutGuides
    ? `<span class="mark tl"></span><span class="mark tr"></span><span class="mark bl"></span><span class="mark br"></span>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(data.holderKind)} ID — ${esc(data.holderName)}</title>
<style>
  :root { --brand: ${brand}; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#0f172a; margin:0; padding:${preview ? "0" : "24px"}; background:${preview ? "transparent" : "#eef2f7"}; }
  .sheet { display:flex; flex-wrap:wrap; gap:${preview ? "16px" : "18px"}; }
  .page { width:${pageW}mm; height:${pageH}mm; position:relative; display:flex; align-items:center; justify-content:center; background:#fff; }
  .card {
    width:${CR80.width}mm; height:${CR80.height}mm; border-radius:3.2mm; overflow:hidden; background:#fff;
    position:relative; box-shadow:0 6px 20px rgba(15,23,42,.14);
  }
  .mark { position:absolute; width:${CR80.bleed}mm; height:${CR80.bleed}mm; }
  .mark:before, .mark:after { content:""; position:absolute; background:#94a3b8; }
  .mark:before { width:${CR80.bleed}mm; height:.2mm; top:50%; }
  .mark:after { height:${CR80.bleed}mm; width:.2mm; left:50%; }
  .mark.tl { top:0; left:0 } .mark.tr { top:0; right:0 } .mark.bl { bottom:0; left:0 } .mark.br { bottom:0; right:0 }

  /* ---------- front ---------- */
  .band { height:15mm; background:linear-gradient(135deg, var(--brand) 0%, rgba(0,0,0,.45) 320%); color:#fff; padding:2.6mm 4mm; display:flex; align-items:center; gap:2.6mm; position:relative; overflow:hidden; }
  .band:after { content:""; position:absolute; top:-6mm; right:-8mm; width:26mm; height:26mm; border-radius:50%; background:rgba(255,255,255,.12); }
  .logo { height:9mm; width:9mm; object-fit:contain; border-radius:1.6mm; background:#fff; flex:none; }
  .logo-fallback { display:flex; align-items:center; justify-content:center; color:var(--brand); font-weight:800; font-size:11pt; }
  .school { margin:0; font-size:8.4pt; font-weight:800; line-height:1.15; }
  .kind { margin:.3mm 0 0; font-size:5.6pt; letter-spacing:.16em; text-transform:uppercase; opacity:.9; }
  .body { padding:3.4mm 4mm; display:flex; gap:3.2mm; height:calc(${CR80.height}mm - 15mm - 5mm); }
  .photo { height:26mm; width:21mm; object-fit:cover; border-radius:1.6mm; border:.4mm solid #fff; box-shadow:0 0 0 .3mm #cbd5e1; flex:none; }
  .photo-fallback { display:flex; align-items:center; justify-content:center; background:#e2e8f0; color:#475569; font-size:16pt; font-weight:800; }
  .name { margin:0; font-size:10pt; font-weight:800; line-height:1.15; }
  .sub { margin:.6mm 0 1.8mm; font-size:6.6pt; color:#64748b; }
  .idbox { display:inline-block; padding:.8mm 2mm; border-radius:1.2mm; background:rgba(15,23,42,.04); border:.25mm solid rgba(15,23,42,.12); margin-bottom:1.4mm; }
  .idbox .k { display:block; font-size:5.2pt; letter-spacing:.14em; text-transform:uppercase; color:#64748b; }
  .idbox .v { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:8.4pt; font-weight:700; color:var(--brand); }
  .row { display:flex; gap:2mm; align-items:baseline; }
  .row .k { font-size:5.6pt; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; min-width:13mm; }
  .row .v { font-size:6.7pt; font-weight:600; }
  .qr-front { width:13mm; height:13mm; align-self:flex-end; flex:none; border:.3mm solid #e2e8f0; border-radius:1mm; background:#fff; padding:.4mm; }
  .foot { position:absolute; left:0; right:0; bottom:0; height:5mm; background:#f1f5f9; border-top:.25mm solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; padding:0 4mm; font-size:5.4pt; color:#64748b; letter-spacing:.06em; text-transform:uppercase; }

  /* ---------- back ---------- */
  .back { padding:4mm; display:flex; flex-direction:column; justify-content:space-between; }
  .stripe { position:absolute; top:6mm; left:0; right:0; height:8mm; background:#0f172a; }
  .back-body { margin-top:16mm; display:flex; gap:3mm; align-items:flex-start; }
  .back h4 { margin:0 0 1.2mm; font-size:6.4pt; letter-spacing:.14em; text-transform:uppercase; color:var(--brand); }
  .back p { margin:0; font-size:5.7pt; color:#475569; line-height:1.45; }
  .qr-back { flex:none; text-align:center; }
  .qr-back img { width:15mm; height:15mm; display:block; }
  .qr-back small { display:block; margin-top:.6mm; font-size:4.6pt; color:#94a3b8; letter-spacing:.06em; text-transform:uppercase; }
  .sign { display:flex; align-items:flex-end; justify-content:space-between; gap:3mm; }
  .sign .line { flex:1; border-bottom:.3mm solid #94a3b8; height:4mm; min-width:26mm; }
  .sign small { font-size:5.2pt; color:#94a3b8; display:block; margin-top:.8mm; letter-spacing:.08em; text-transform:uppercase; }
  .valid { font-size:5.4pt; color:#64748b; white-space:nowrap; text-align:right; }

  .no-print { margin-top:22px; }
  .hint { font-size:12px; color:#64748b; margin:10px 0 0; }

  @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
  @media print {
    body { background:#fff; padding:0; margin:0; }
    .sheet { display:block; gap:0; }
    .no-print, .hint { display:none !important; }
    .page { page-break-after:always; break-after:page; }
    .page:last-child { page-break-after:auto; break-after:auto; }
    .card { box-shadow:none; }
  }
</style></head><body>
  <div class="sheet">
    <div class="page">
      ${marks}
      <div class="card" data-card="front">
        <div class="band">
          ${logoHtml}
          <div style="min-width:0">
            <p class="school">${esc(data.schoolName)}</p>
            <p class="kind">${esc(data.holderKind)} Identity Card</p>
          </div>
        </div>
        <div class="body">
          ${photoHtml}
          <div style="min-width:0;flex:1">
            <p class="name">${esc(data.holderName)}</p>
            <p class="sub">${esc(data.subtitle)}</p>
            <div class="idbox"><span class="k">ID Number</span><span class="v">${esc(data.idNumber)}</span></div>
            ${rows}
          </div>
          ${qrFront}
        </div>
        <div class="foot">
          <span>${data.validUntil ? `Valid until ${esc(data.validUntil)}` : "Property of the school"}</span>
          <span>${esc(data.holderKind)}</span>
        </div>
      </div>
    </div>

    <div class="page">
      ${marks}
      <div class="card back" data-card="back">
        <div class="stripe"></div>
        <div class="back-body">
          <div style="min-width:0">
            <h4>Conditions of use</h4>
            <p>
              This card remains the property of ${esc(data.schoolName)} and must be carried on school premises at all
              times. It is not transferable. If found, please return it to the school office${data.schoolAddress ? ` at ${esc(data.schoolAddress)}` : ""}${data.schoolPhone ? ` or call ${esc(data.schoolPhone)}` : ""}.
            </p>
          </div>
          ${qrBack}
        </div>
        <div class="sign">
          <div style="flex:1">
            <div class="line"></div>
            <small>Authorised signature</small>
          </div>
          <span class="valid">${esc(data.idNumber)}${data.validUntil ? `<br/>Valid until ${esc(data.validUntil)}` : ""}</span>
        </div>
      </div>
    </div>
  </div>
${preview ? "" : `
  <div class="no-print">
    <button onclick="window.print()" style="padding:10px 24px;background:${brand};color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">Print ID card</button>
    <p class="hint">Page size is ${pageW} × ${pageH} mm${cutGuides ? ` (CR80 card plus ${CR80.bleed}mm bleed and crop marks)` : " (exact CR80 card size)"} — front on page 1, back on page 2. In the print dialog choose scale 100% and margins “None”.</p>
  </div>`}
</body></html>`;
}

/** Open a print window for the ID card. */
export function printIdCard(data: IdCardData, opts: IdCardRenderOptions = {}) {
  openDocument(buildIdCardHtml(data, opts));
}
