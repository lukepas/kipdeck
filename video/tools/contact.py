#!/usr/bin/env python3
"""Contact sheet: tile images into one PNG for a quick look.

usage: python3 tools/contact.py out.png img1.png img2.png ... [--cols 3] [--width 640]
"""
import sys
from PIL import Image, ImageDraw

LANCZOS = getattr(Image, "Resampling", Image).LANCZOS


def main(argv):
    cols, width, files = 3, 640, []
    out = argv[0]
    i = 1
    while i < len(argv):
        if argv[i] == "--cols":
            cols = int(argv[i + 1]); i += 2
        elif argv[i] == "--width":
            width = int(argv[i + 1]); i += 2
        else:
            files.append(argv[i]); i += 1
    if not files:
        sys.exit("no images")
    thumbs = []
    for f in files:
        im = Image.open(f).convert("RGB")
        h = round(im.height * width / im.width)
        thumbs.append((f, im.resize((width, h), LANCZOS)))
    th = max(t.height for _, t in thumbs)
    rows = (len(thumbs) + cols - 1) // cols
    label = 18
    sheet = Image.new("RGB", (cols * width, rows * (th + label)), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for k, (f, t) in enumerate(thumbs):
        x, y = (k % cols) * width, (k // cols) * (th + label)
        sheet.paste(t, (x, y + label))
        d.text((x + 4, y + 3), f.split("/")[-1], fill=(255, 255, 255))
    sheet.save(out)


if __name__ == "__main__":
    main(sys.argv[1:])
