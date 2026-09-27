import { describe, it, expect } from "vitest";
import {
  backgroundReference,
  boundsSize,
  findContentBounds,
  fitWithin,
  padBounds,
  validateCrest,
  MAX_CREST_PX,
} from "@/lib/crest";

/**
 * Build RGBA pixel data for a test image: a `fill` background with an opaque
 * `mark` rectangle inside it, which is the shape of every crest-with-a-margin
 * this code exists to trim.
 */
function image(
  width: number,
  height: number,
  fill: [number, number, number, number],
  mark?: { left: number; top: number; right: number; bottom: number; colour?: [number, number, number, number] },
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(fill, i * 4);
  }
  if (mark) {
    const colour = mark.colour ?? [10, 20, 90, 255];
    for (let y = mark.top; y <= mark.bottom; y++) {
      for (let x = mark.left; x <= mark.right; x++) {
        data.set(colour, (y * width + x) * 4);
      }
    }
  }
  return data;
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

describe("findContentBounds", () => {
  it("finds the artwork inside a white margin", () => {
    const data = image(20, 20, WHITE, { left: 6, top: 4, right: 13, bottom: 15 });
    expect(findContentBounds(data, 20, 20)).toEqual({ left: 6, top: 4, right: 13, bottom: 15 });
  });

  it("finds it inside a transparent margin", () => {
    const data = image(20, 20, CLEAR, { left: 2, top: 9, right: 17, bottom: 11 });
    expect(findContentBounds(data, 20, 20)).toEqual({ left: 2, top: 9, right: 17, bottom: 11 });
  });

  it("tolerates the compression noise a JPEG's white margin actually has", () => {
    // A real "white" margin is never 255,255,255 everywhere.
    const data = image(16, 16, [250, 252, 249, 255], { left: 5, top: 5, right: 10, bottom: 10 });
    data.set([247, 255, 251, 255], 0);
    data.set([252, 248, 255, 255], (15 * 16 + 15) * 4);
    expect(findContentBounds(data, 16, 16)).toEqual({ left: 5, top: 5, right: 10, bottom: 10 });
  });

  it("returns null for a blank image, rather than an empty rectangle", () => {
    // The caller keeps the original in this case. A zero-sized canvas would
    // throw, and cropping a blank file to nothing is not an improvement.
    expect(findContentBounds(image(8, 8, WHITE), 8, 8)).toBeNull();
    expect(findContentBounds(image(8, 8, CLEAR), 8, 8)).toBeNull();
  });

  it("keeps the edges when the artwork runs right up to them", () => {
    // A band spanning the full width: there is nothing to trim horizontally, and
    // the bounds must say so rather than shaving the artwork.
    const data = image(10, 10, CLEAR, { left: 0, top: 3, right: 9, bottom: 6 });
    expect(findContentBounds(data, 10, 10)).toEqual({ left: 0, top: 3, right: 9, bottom: 6 });
  });

  it("treats a blank white image as having nothing to trim", () => {
    // Every corner is white, so every pixel is background. Returning null is
    // what makes the caller keep the original instead of cropping to nothing.
    expect(findContentBounds(image(10, 10, WHITE), 10, 10)).toBeNull();
  });

  it("leaves a crest whose coloured field bleeds to the edges completely alone", () => {
    // A navy banner with gold lettering: four matching corners, but the navy is
    // the crest, not a margin. Trimming the shared corner colour regardless —
    // which is what ImageMagick's -trim does — gutted a 240x120 banner down to
    // 238x78 in the browser, leaving the lettering floating with no field.
    const data = image(40, 20, [21, 37, 91, 255], {
      left: 10, top: 8, right: 29, bottom: 11, colour: [188, 149, 41, 255],
    });
    expect(findContentBounds(data, 40, 20)).toEqual({ left: 0, top: 0, right: 39, bottom: 19 });
  });

  it("does not eat into a crest whose corners disagree", () => {
    // A photograph or a crest that bleeds to its edges: there is no flat margin,
    // so only transparency may trim, and nothing here is transparent.
    const data = image(6, 6, [200, 30, 30, 255]);
    data.set([20, 200, 40, 255], 0);
    expect(findContentBounds(data, 6, 6)).toEqual({ left: 0, top: 0, right: 5, bottom: 5 });
  });
});

describe("backgroundReference", () => {
  it("reports the colour when all four corners agree", () => {
    expect(backgroundReference(image(8, 8, WHITE), 8, 8)).toEqual([255, 255, 255]);
  });

  it("reports none when they disagree, so colour trimming is switched off", () => {
    const data = image(8, 8, WHITE);
    data.set([12, 12, 12, 255], 0);
    expect(backgroundReference(data, 8, 8)).toBeNull();
  });

  it("reports none for transparent corners, leaving alpha to do the work", () => {
    expect(backgroundReference(image(8, 8, CLEAR), 8, 8)).toBeNull();
  });
});

describe("padBounds", () => {
  it("adds the same margin on all four sides", () => {
    const padded = padBounds({ left: 40, top: 40, right: 139, bottom: 139 }, 200, 200);
    expect(padded).toEqual({ left: 36, top: 36, right: 143, bottom: 143 });
  });

  it("measures the margin off the longest side, so a wide crest is not framed oddly", () => {
    // 100 wide, 10 tall. A per-axis margin would give 4px beside and 0px above,
    // which reads as the off-centre framing this is meant to remove.
    const bounds = { left: 50, top: 95, right: 149, bottom: 104 };
    const padded = padBounds(bounds, 200, 200);
    // 4px on every side — off the 100px width, not the 10px height.
    expect(bounds.left - padded.left).toBe(4);
    expect(bounds.top - padded.top).toBe(4);
    expect(padded.right - bounds.right).toBe(4);
    expect(padded.bottom - bounds.bottom).toBe(4);
  });

  it("never runs past the edge of the image", () => {
    const padded = padBounds({ left: 0, top: 0, right: 9, bottom: 9 }, 10, 10);
    expect(padded).toEqual({ left: 0, top: 0, right: 9, bottom: 9 });
  });
});

/**
 * The promise this whole module makes: a crest is never squashed. Ratio is
 * checked rather than asserted in prose, because "not squished" is exactly the
 * kind of claim that is easy to write and easy to break.
 */
describe("fitWithin never changes the aspect ratio", () => {
  const CASES: [string, number, number][] = [
    ["a wide banner crest", 1200, 300],
    ["a tall shield", 300, 1200],
    ["square", 800, 800],
    ["already small", 64, 48],
    ["one pixel over", 513, 400],
    ["extreme letterbox", 2000, 50],
  ];

  for (const [what, w, h] of CASES) {
    it(`${what} (${w}×${h})`, () => {
      const out = fitWithin(w, h, MAX_CREST_PX);
      expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(MAX_CREST_PX);
      // Rounding to whole pixels moves the ratio slightly; a squash would move
      // it a great deal. 2% is far tighter than the eye, and far looser than
      // any non-uniform scale.
      expect(Math.abs(out.width / out.height - w / h) / (w / h)).toBeLessThan(0.02);
    });
  }

  it("never enlarges — a 60px crest blown up to 512 is just a bigger blur", () => {
    expect(fitWithin(60, 40, MAX_CREST_PX)).toEqual({ width: 60, height: 40 });
  });

  it("keeps at least one pixel on the thin axis of an extreme letterbox", () => {
    const out = fitWithin(4000, 3, MAX_CREST_PX);
    expect(out.width).toBe(MAX_CREST_PX);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it("returns nothing for a degenerate size rather than dividing by zero", () => {
    expect(fitWithin(0, 100, MAX_CREST_PX)).toEqual({ width: 0, height: 0 });
  });
});

describe("the trim and fit work together", () => {
  it("turns a crest lost in its own margin into one that fills the frame", () => {
    // 400×400 with a 60×30 crest adrift in the middle: the shape a school's
    // Word export actually arrives in.
    const data = image(400, 400, WHITE, { left: 170, top: 185, right: 229, bottom: 214 });
    const content = findContentBounds(data, 400, 400)!;
    expect(boundsSize(content)).toEqual({ width: 60, height: 30 });

    const box = padBounds(content, 400, 400);
    const cropped = boundsSize(box);
    const out = fitWithin(cropped.width, cropped.height, MAX_CREST_PX);

    // The artwork went from 1.1% of the image's area to over half of it.
    const before = (60 * 30) / (400 * 400);
    const after = (60 * 30) / (cropped.width * cropped.height);
    expect(before).toBeLessThan(0.02);
    expect(after).toBeGreaterThan(0.5);

    // And the scale was uniform. Note the comparison is against the *padded*
    // box, not the bare 2:1 artwork: an equal margin on all four sides
    // necessarily moves the box's ratio (64x34 here), while leaving the artwork
    // inside it untouched. What must not change is the ratio between the crop
    // and what gets drawn.
    expect(Math.abs(out.width / out.height - cropped.width / cropped.height))
      .toBeLessThan(0.02);
  });
});

describe("validateCrest", () => {
  const file = (type: string, size: number) =>
    ({ type, size, name: "crest" }) as File;

  it("accepts the formats a school will actually have", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(validateCrest(file(type, 1000))).toBeNull();
    }
  });

  it("refuses what the browser cannot draw", () => {
    expect(validateCrest(file("image/tiff", 1000))).toMatch(/PNG, JPG, WebP or SVG/);
    expect(validateCrest(file("application/pdf", 1000))).toMatch(/PNG, JPG, WebP or SVG/);
  });

  it("refuses anything over 5MB", () => {
    expect(validateCrest(file("image/png", 6 * 1024 * 1024))).toMatch(/larger than 5MB/);
  });
});
