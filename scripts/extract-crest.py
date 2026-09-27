#!/usr/bin/env python3
"""
Cut the school crest out of a screenshot and write it with a transparent ground.

The crest was only ever available to us sitting on the app's navy checkered
panel, so "extract" here means removing that ground rather than opening a file
that already had one. Two things make a naive colour-key fail:

  * the panel is a *check* of two navies, not one flat colour, and a vignette
    darkens it toward the edges, so no single colour matches the whole ground;
  * the crest's own shield interior is navy too, and close enough to the ground
    that any tolerance wide enough to bridge the check also swallows it.

So the ground is found by flooding inward from the border: a pixel is removed
only if it reads as navy *and* is reachable from the edge without crossing the
crest. The unbroken gold ring around the shield is what stops the flood, which
is why this works on a crest and would not on an arbitrary image.

The output is one transparent PNG, to be uploaded as a school's logo in
Settings -> Branding, which sets `schools.logo_url`. Everything crest-shaped in
the app reads that column — the top bar, the page watermark, report cards,
certificates, payslips — so there is nothing for a bundled copy to do, and
public/brand/ belongs to the SmartSchoolAdmin product logo kit rather than to
any one school.

Usage:
    python3 scripts/extract-crest.py SOURCE.png --out ~/Desktop
"""

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

# Read off the navy panel: strongly blue, never bright. The crest's gold, cream,
# skin tones and white all fail at least one of these, so the flood stops at the
# shield's edge even though the shield's interior would pass on colour alone.
def is_ground(px) -> bool:
    r, g, b = px[0], px[1], px[2]
    return b > r + 30 and b < 165 and r < 85 and g < 115


def flood_ground(img: Image.Image) -> Image.Image:
    """Return img as RGBA with the border-connected navy ground made transparent."""
    w, h = img.size
    rgb = img.convert("RGB")
    px = rgb.load()

    seen = bytearray(w * h)
    queue = deque()

    # Seed from every border pixel that reads as ground.
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and is_ground(px[x, y]):
                seen[y * w + x] = 1
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and is_ground(px[x, y]):
                seen[y * w + x] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                if is_ground(px[nx, ny]):
                    seen[ny * w + nx] = 1
                    queue.append((nx, ny))

    # Build the alpha band from the flood and attach it. Note getchannel("A")
    # hands back a *copy*, so writing into that leaves the image untouched —
    # putalpha is the one that lands.
    alpha = Image.frombytes("L", (w, h), bytes(0 if s else 255 for s in seen))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    # Not public/brand: that folder is the product's logo kit, and a school's
    # crest belongs in its logo_url rather than in the bundle.
    ap.add_argument("--out", type=Path, default=Path("."))
    ap.add_argument("--box", nargs=4, type=int, metavar=("L", "T", "R", "B"),
                    help="crop before cutting; omit to use the whole image")
    args = ap.parse_args()

    img = Image.open(args.source)
    if args.box:
        img = img.crop(tuple(args.box))

    cut = flood_ground(img)

    # Trim to what actually survived, so the crest has no dead margin.
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)

    args.out.mkdir(parents=True, exist_ok=True)
    cut.save(args.out / "crest.png")
    print(f"crest.png  {cut.size[0]}x{cut.size[1]}")
    print("Upload it in Settings -> Branding -> School Logo.")


if __name__ == "__main__":
    main()
