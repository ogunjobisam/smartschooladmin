/**
 * Preparing a school's crest before it is uploaded.
 *
 * Schools send what they have: a crest exported from Word with two inches of
 * white around it, a PNG saved from a letterhead, a screenshot. Uploaded raw,
 * the margin becomes part of the image, so the crest renders tiny inside its
 * own padding — in a 48px top bar that is the difference between a visible
 * badge and a speck.
 *
 * So the upload is pre-processed: trim the dead border, keep the proportions
 * exactly, and cap the dimensions. Three rules the rest of this file exists to
 * hold to:
 *
 *  1. **Never change the aspect ratio.** A crest is somebody's identity; a
 *     squashed one is worse than an untouched one. Every scale here is uniform,
 *     and `fitWithin` is the only place a size is computed.
 *  2. **Trim, never crop into the artwork.** The bounds come from finding the
 *     pixels that are *not* background, so nothing that was drawn is cut.
 *  3. **Keep transparency.** Output is PNG. Flattening a transparent crest onto
 *     white puts a white rectangle on the navy sidebar.
 */

/** Room left around the artwork after trimming, as a share of its longest side. */
const MARGIN_RATIO = 0.04;

/** Below this alpha a pixel is background regardless of its colour. */
const ALPHA_FLOOR = 12;

/**
 * How far a pixel may sit from the border colour and still count as background.
 * Generous, because a JPEG's "white" margin is never uniformly white — it is
 * flecked with compression noise a few levels off.
 */
const COLOUR_TOLERANCE = 18;

/** The longest side of the stored crest. Larger buys nothing the UI can show. */
export const MAX_CREST_PX = 512;

export const MAX_CREST_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_CREST_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Inclusive bounds → dimensions. */
export const boundsSize = (b: Bounds): Size => ({
  width: b.right - b.left + 1,
  height: b.bottom - b.top + 1,
});

function isBackground(
  data: Uint8ClampedArray,
  i: number,
  ref: [number, number, number] | null,
): boolean {
  if (data[i + 3] < ALPHA_FLOOR) return true;
  if (!ref) return false;
  return (
    Math.abs(data[i] - ref[0]) <= COLOUR_TOLERANCE &&
    Math.abs(data[i + 1] - ref[1]) <= COLOUR_TOLERANCE &&
    Math.abs(data[i + 2] - ref[2]) <= COLOUR_TOLERANCE
  );
}

/**
 * How light a corner must be to count as trimmable whitespace.
 *
 * Deliberately only white and near-white, not "whatever colour the corners
 * happen to share". A crest whose field bleeds to the edge — a navy banner with
 * gold lettering on it — has four matching corners too, and trimming *that*
 * removes the field and leaves the lettering floating. Rendering the four test
 * cases is what caught it: a 240×120 banner came back 238×78, gutted.
 *
 * ImageMagick's `-trim` has the same behaviour, so this is a deliberate
 * departure rather than a fix to a bug: the request was to remove whitespace,
 * and whitespace is what gets removed.
 */
const WHITE_FLOOR = 232;

/**
 * The reference background colour, taken from the four corners.
 *
 * Four matching near-white corners is the signal that there is a margin to trim.
 * Anything else — a photo, a coloured field, a gradient — returns null, and only
 * fully transparent pixels count as background, so the image is left alone
 * rather than eaten into.
 */
export function backgroundReference(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] | null {
  if (width < 2 || height < 2) return null;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const corners = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1),
  ];

  // A transparent corner is its own answer: alpha alone will do the trimming.
  if (corners.every((i) => data[i + 3] < ALPHA_FLOOR)) return null;

  const first = corners[0];
  const ref: [number, number, number] = [data[first], data[first + 1], data[first + 2]];
  if (ref.some((channel) => channel < WHITE_FLOOR)) return null;
  const agree = corners.every(
    (i) =>
      data[i + 3] >= ALPHA_FLOOR &&
      Math.abs(data[i] - ref[0]) <= COLOUR_TOLERANCE &&
      Math.abs(data[i + 1] - ref[1]) <= COLOUR_TOLERANCE &&
      Math.abs(data[i + 2] - ref[2]) <= COLOUR_TOLERANCE,
  );
  return agree ? ref : null;
}

/**
 * The smallest rectangle containing everything that is not background.
 *
 * Returns null when the image is entirely background — an empty or blank file,
 * where there is nothing to trim to and the caller should keep the original
 * rather than produce a zero-sized canvas.
 */
export function findContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Bounds | null {
  const ref = backgroundReference(data, width, height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBackground(data, (y * width + x) * 4, ref)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0 || bottom < 0) return null;
  return { left, top, right, bottom };
}

/**
 * Breathing room around the artwork, equal on all four sides.
 *
 * The margin is a share of the *longest* side rather than each axis, so a wide
 * crest does not end up with more space above than beside it — which would read
 * as the off-centre framing this whole exercise is meant to remove.
 */
export function padBounds(bounds: Bounds, width: number, height: number): Bounds {
  const { width: w, height: h } = boundsSize(bounds);
  const margin = Math.round(Math.max(w, h) * MARGIN_RATIO);
  return {
    left: Math.max(0, bounds.left - margin),
    top: Math.max(0, bounds.top - margin),
    right: Math.min(width - 1, bounds.right + margin),
    bottom: Math.min(height - 1, bounds.bottom + margin),
  };
}

/**
 * The largest size fitting inside `max` on both axes **with the ratio intact**.
 *
 * Never enlarges: blowing a 60px crest up to 512 only makes the blur bigger.
 * This is the single place a crest's dimensions are decided, so "not squished"
 * is one function's promise rather than a convention every call site must keep.
 */
export function fitWithin(width: number, height: number, max: number): Size {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function validateCrest(file: File): string | null {
  if (!ACCEPTED_CREST_TYPES.includes(file.type)) {
    return "Please choose a PNG, JPG, WebP or SVG image.";
  }
  if (file.size > MAX_CREST_BYTES) {
    return "That image is larger than 5MB. Please choose a smaller one.";
  }
  return null;
}

export interface PreparedCrest {
  file: File;
  /** What changed, for telling the person what happened to their file. */
  trimmed: boolean;
  scaled: boolean;
  from: Size;
  to: Size;
}

/**
 * Trim, scale and re-encode a crest, preserving its proportions.
 *
 * Returns the original untouched when there is nothing worth doing — an SVG
 * (already resolution-independent, and rasterising it would be a downgrade), a
 * blank image, or a browser without a 2D context. Every failure path keeps the
 * upload working rather than blocking it on cosmetics.
 */
export async function prepareCrest(file: File): Promise<PreparedCrest> {
  const unchanged = (size: Size): PreparedCrest => ({
    file,
    trimmed: false,
    scaled: false,
    from: size,
    to: size,
  });

  if (file.type === "image/svg+xml") return unchanged({ width: 0, height: 0 });

  let bitmap: ImageBitmap | HTMLImageElement;
  let sourceW: number;
  let sourceH: number;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    bitmap = img;
    sourceW = img.naturalWidth;
    sourceH = img.naturalHeight;
  } catch {
    URL.revokeObjectURL(url);
    return unchanged({ width: 0, height: 0 });
  }

  try {
    const source = document.createElement("canvas");
    source.width = sourceW;
    source.height = sourceH;
    const sctx = source.getContext("2d", { willReadFrequently: true });
    if (!sctx) return unchanged({ width: sourceW, height: sourceH });
    sctx.drawImage(bitmap, 0, 0);

    const { data } = sctx.getImageData(0, 0, sourceW, sourceH);
    const content = findContentBounds(data, sourceW, sourceH);
    if (!content) return unchanged({ width: sourceW, height: sourceH });

    const box = padBounds(content, sourceW, sourceH);
    const cropped = boundsSize(box);
    const out = fitWithin(cropped.width, cropped.height, MAX_CREST_PX);

    const target = document.createElement("canvas");
    target.width = out.width;
    target.height = out.height;
    const tctx = target.getContext("2d");
    if (!tctx) return unchanged({ width: sourceW, height: sourceH });
    tctx.imageSmoothingQuality = "high";
    // Source rect and destination rect share a ratio by construction — fitWithin
    // scaled the crop uniformly — so this draw cannot squash the artwork.
    tctx.drawImage(
      bitmap,
      box.left,
      box.top,
      cropped.width,
      cropped.height,
      0,
      0,
      out.width,
      out.height,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      target.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return unchanged({ width: sourceW, height: sourceH });

    const name = file.name.replace(/\.[^.]+$/, "") + ".png";
    return {
      file: new File([blob], name, { type: "image/png" }),
      trimmed: cropped.width < sourceW || cropped.height < sourceH,
      scaled: out.width !== cropped.width,
      from: { width: sourceW, height: sourceH },
      to: out,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
