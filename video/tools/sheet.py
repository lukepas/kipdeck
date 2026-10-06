#!/usr/bin/env python3
"""Timestamped contact sheet straight from an encoded film.

Pulls one frame every --every seconds (default 0.5) out of the mp4 by frame
index, so the frames are exactly t = k * every, and tiles them with the
timestamp and frame number on each cell.

usage: python3 tools/sheet.py film.mp4 sheet.png [--every 0.5] [--cols 10] [--width 384]
"""
import json
import os
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw, ImageFont

LANCZOS = getattr(Image, "Resampling", Image).LANCZOS
HERE = os.path.dirname(os.path.abspath(__file__))
MONO = os.path.join(HERE, "..", "assets", "fonts", "JetBrainsMono-VF.ttf")


def tool(name):
    p = f"/opt/homebrew/bin/{name}"
    return p if os.path.exists(p) else name


def probe_fps(film):
    out = subprocess.run(
        [tool("ffprobe"), "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=r_frame_rate", "-of", "json", film],
        check=True, capture_output=True, text=True, timeout=60).stdout
    num, den = json.loads(out)["streams"][0]["r_frame_rate"].split("/")
    return float(num) / float(den)


def main(argv):
    film, out = argv[0], argv[1]
    every, cols, width = 0.5, 10, 384
    i = 2
    while i < len(argv):
        k, v = argv[i], argv[i + 1]
        if k == "--every": every = float(v)
        elif k == "--cols": cols = int(v)
        elif k == "--width": width = int(v)
        else: sys.exit(f"unknown flag {k}")
        i += 2
    fps = probe_fps(film)
    step = round(fps * every)
    if abs(step - fps * every) > 1e-6:
        sys.exit(f"--every {every} is not a whole number of frames at {fps} fps")
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [tool("ffmpeg"), "-v", "error", "-i", film,
             "-vf", f"select='not(mod(n\\,{step}))'", "-fps_mode", "passthrough",
             os.path.join(tmp, "%04d.png")],
            check=True, timeout=600)
        files = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
        if not files:
            sys.exit("no frames decoded")
        first = Image.open(os.path.join(tmp, files[0]))
        th = round(first.height * width / first.width)
        label = max(18, width // 16)
        font = ImageFont.truetype(MONO, label - 4)
        rows = (len(files) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * width, rows * (th + label)), (40, 40, 40))
        d = ImageDraw.Draw(sheet)
        for k, f in enumerate(files):
            im = Image.open(os.path.join(tmp, f)).convert("RGB").resize((width, th), LANCZOS)
            x, y = (k % cols) * width, (k // cols) * (th + label)
            sheet.paste(im, (x, y + label))
            frame = k * step
            d.text((x + 4, y + 1), f"#{k + 1:02d}  {k * every:5.2f}s  f{frame}", fill=(255, 255, 255), font=font)
        sheet.save(out)
        print(f"{out}: {len(files)} frames every {every}s ({cols}x{rows}, cell {width}x{th})")


if __name__ == "__main__":
    main(sys.argv[1:])
