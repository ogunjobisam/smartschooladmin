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

/**
 * Render `html` and save it as a multi-page A4 PDF.
 *
 * @param fileName without the .pdf extension.
 */
export async function downloadHtmlAsPdf(html: string, fileName: string): Promise<void> {
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

    let offset = 0;
    let page = 0;
    while (offset < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
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
}
