#!/usr/bin/env python3
"""Copy the rendered frame at every beatmap hit into one folder.

Run it right after a full render, while out/frames still holds that render's
PNGs (the next render clears them). Hits that share a frame share a file,
named after the time, the frame and every hit on it.

usage: python3 tools/hits.py out/review/hits [--frames out/frames] [--fps 60] [--from 0]
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")


def main(argv):
    dest = argv[0]
    frames, fps, start = os.path.join(ROOT, "out", "frames"), 60.0, 0.0
    i = 1
    while i < len(argv):
        k, v = argv[i], argv[i + 1]
        if k == "--frames": frames = v
        elif k == "--fps": fps = float(v)
        elif k == "--from": start = float(v)
        else: sys.exit(f"unknown flag {k}")
        i += 2
    with open(os.path.join(ROOT, "src", "beatmap.json")) as f:
        hits = json.load(f)["hits"]
    by_frame = {}
    for h in hits:
        n = round((h["t"] - start) * fps)
        by_frame.setdefault(n, []).append(h)
    os.makedirs(dest, exist_ok=True)
    for old in os.listdir(dest):
        if old.endswith(".png"):
            os.remove(os.path.join(dest, old))
    missing = []
    for n in sorted(by_frame):
        src = os.path.join(frames, f"{n:05d}.png")
        if not os.path.exists(src):
            missing.append(n)
            continue
        names = "+".join(sorted({h["name"] for h in by_frame[n]}))
        names = re.sub(r"[^A-Za-z0-9.+_-]", "_", names)[:120]
        t = by_frame[n][0]["t"]
        shutil.copyfile(src, os.path.join(dest, f"{t:06.3f}s-f{n:04d}-{names}.png"))
    print(f"{len(by_frame) - len(missing)} stills for {len(hits)} hits -> {dest}")
    if missing:
        sys.exit(f"no PNG frame for {len(missing)} hit frames, e.g. {missing[:5]}")


if __name__ == "__main__":
    main(sys.argv[1:])
