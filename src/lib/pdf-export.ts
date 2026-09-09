/**
 * Turn one of our generated HTML documents into a PDF file.
 *
 * The previous approach captured the on-screen preview iframe, which is only a
 * few hundred pixels tall — html2canvas clipped the capture to that viewport, so
 * the saved payslip arrived cut off halfway down. Here the document is rendered
 * once more into a detached, full-height A4-width iframe, images and fonts are
 * awaited, and the capture is paged across as many A4 sheets as it needs.
 */

/** A4 portrait in millimetres. */
const A4 = { width: 210, height: 297 };
/** A4 width at 96dpi — the pixel width the document is laid out at. */
const PAGE_PX = 794;

async function renderOffscreen(html: string, widthPx: number): Promise<{
  frame: HTMLIFrameElement;
  doc: Document;
}> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:100px;border:0;background:#fff;`;
  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
    // Safari occasionally fires load before srcdoc is applied.
    window.setTimeout(resolve, 1500);
  });

  const doc = frame.contentDocument!;
  // Grow the frame to the full document height so nothing is outside the
  // capture viewport.
  const height = Math.max(
    doc.documentElement.scrollHeight,
    doc.body?.scrollHeight ?? 0,
    200,
  );
  frame.style.height = `${height}px`;

  // Wait for the school logo and web fonts before snapshotting.
  const images = Array.from(doc.images);
  await Promise.all(
    images.map(
      (img) =>
        img.complete ||
        new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          window.setTimeout(resolve, 3000);
        }),
    ),
  );
  try {
    await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* fonts API unavailable — the fallback stack is fine */
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  return { frame, doc };
}

/** Height of the last row that still has ink on it, so blank tails never spill
 * onto a second sheet. */
function inkedHeight(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.height;
  const step = 4;
  for (let y = canvas.height - 1; y >= 0; y -= step) {
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, y, canvas.width, 1).data;
    } catch {
      return canvas.height;
    }
    for (let i = 0; i < data.length; i += 16) {
      // Anything meaningfully darker than paper counts as content.
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) {
        return Math.min(canvas.height, y + step * 2);
      }
    }
  }
  return canvas.height;
}

export interface PdfExportOptions {
  /**
   * Keep the whole document on one A4 sheet, shrinking it to fit if it runs a
   * little long. Payslips use this: one sheet per employee, always.
   */
  singlePage?: boolean;
  /** Don't shrink below this factor; past it the document is paged instead. */
  minScale?: number;
}

/**
 * Render `html` and save it as an A4 PDF.
 *
 * @param fileName without the .pdf extension.
 */
export async function downloadHtmlAsPdf(
  html: string,
  fileName: string,
  options: PdfExportOptions = {},
): Promise<void> {
  // Kept out of the main bundle: neither library is needed until someone asks
  // for a file.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const { frame, doc } = await renderOffscreen(html, PAGE_PX);
  try {
    const target = doc.body;
    const fullHeight = Math.max(target.scrollHeight, doc.documentElement.scrollHeight);

    const canvas = await html2canvas(target, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      width: PAGE_PX,
      height: fullHeight,
      windowWidth: PAGE_PX,
      windowHeight: fullHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    // Millimetres of document per page, expressed in canvas pixels.
    const pxPerMm = canvas.width / A4.width;
    const pageHeightPx = Math.floor(A4.height * pxPerMm);
    const contentHeight = Math.max(1, inkedHeight(canvas));

    const minScale = options.minScale ?? 0.62;
    if (options.singlePage && contentHeight / pageHeightPx <= 1 / minScale) {
      // One sheet: place the trimmed capture, scaled down only if it needs it,
      // and centred horizontally so the margins stay even.
      const scale = Math.min(1, pageHeightPx / contentHeight);
      const widthMm = A4.width * scale;
      const heightMm = (contentHeight / pxPerMm) * scale;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = contentHeight;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, 0, canvas.width, contentHeight, 0, 0, canvas.width, contentHeight);
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.95),
        "JPEG",
        (A4.width - widthMm) / 2,
        0,
        widthMm,
        heightMm,
      );
      pdf.save(`${fileName}.pdf`);
      return;
    }

    let offset = 0;
    let page = 0;
    while (offset < contentHeight) {
      const sliceHeight = Math.min(pageHeightPx, contentHeight - offset);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (page > 0) pdf.addPage();
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.95),
        "JPEG",
        0,
        0,
        A4.width,
        (sliceHeight / pxPerMm),
      );

      offset += sliceHeight;
      page += 1;
    }

    pdf.save(`${fileName}.pdf`);
  } finally {
    frame.remove();
  }

