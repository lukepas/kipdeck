#!/usr/bin/env python3
"""Build the delivery set in out/final from the rendered films, and check it.

Expects the two finals rendered first (see README, "Video"):
  out/final/kipdeck-30s-16x9.mp4   node render.mjs --out out/final/kipdeck-30s-16x9.mp4
  out/final/kipdeck-30s-9x16.mp4   node render.mjs --format 9x16 --out ...

The 1:1 cut is not delivered: nothing (the landing, the launch kits, the posts)
uses it. render.mjs still renders it with --format 1x1 if a square cut is ever
needed again.

Then writes:
  kipdeck-poster-<format>.png      the poster frame (POSTER_T) in each format
  kipdeck-teaser-6s.webm           the merge drop (TEASER), VP9, muted, loops
  kipdeck-teaser-6s.gif            the same at 640 wide, 25 fps
  CREDITS.md                        copied from assets/CREDITS.md

and checks every mp4: H.264 High yuv420p, the size of its format, 60 fps,
30.000 s, 1800 frames, AAC audio, integrated loudness -14 +/- 1 LUFS and true
peak at or below -1 dBTP. Exits non-zero if a check fails.

usage: python3 tools/deliver.py [--skip-posters] [--skip-teaser]
       python3 tools/deliver.py --web [SUFFIX]

--web skips all of the above and writes the landing page's copies of the 16:9
and 9:16 finals to site/landing/public/media as film-16x9-SUFFIX.mp4 and .webm
and film-9x16-SUFFIX.mp4 (SUFFIX defaults to v2): H.264 High about 550k (430k
for 9:16) with AAC 80k, and AV1 at 460k with Opus 80k, all 1280 on the long side at
30 fps. The landing caches media for a week, so a changed film takes a new
SUFFIX, and site/landing/index.html, the captions file and
tests/landing-a11y.test.ts move to it.
"""
import os
import shutil
import sys

from verify import ROOT, loudness, probe, sh, tool

FINAL = os.path.join(ROOT, "out", "final")
# The delivered formats. 1x1 is left out on purpose (see the docstring).
FORMATS = {"16x9": (1920, 1080), "9x16": (1080, 1920)}
FPS, DURATION = 60, 30.0
# The landing's poster frame (site/landing/public/media/poster-*.webp): the
# overload, 64 agents smearing into streaks. It carries no brand, so a rename
# never needs a new poster.
POSTER_T = 5.2
# The signature moment: 'Who gets paid?', the click, the shockwave, the ink
# flood and 25.00 released. Both ends sit on a downbeat, so the loop seam is
# a cut on the beat like the film's own.
TEASER = (12.0, 18.0)


def film(fmt):
    return os.path.join(FINAL, f"kipdeck-30s-{fmt}.mp4")


def posters():
    for fmt in FORMATS:
        sh(["node", os.path.join(ROOT, "render.mjs"), "--format", fmt, "--still", str(POSTER_T)], timeout=300)
        src = os.path.join(ROOT, "out", "stills", f"{fmt}-{POSTER_T:.3f}.png")
        dst = os.path.join(FINAL, f"kipdeck-poster-{fmt}.png")
        os.replace(src, dst)
        print(f"poster {fmt} -> {os.path.relpath(dst, ROOT)}")


def teaser():
    src = film("16x9")
    a, b = TEASER
    webm = os.path.join(FINAL, "kipdeck-teaser-6s.webm")
    gif = os.path.join(FINAL, "kipdeck-teaser-6s.gif")
    # Frame-exact cut: -ss after -i decodes from the start, so the first frame is t = 12.000.
    sh([tool("ffmpeg"), "-y", "-v", "error", "-i", src, "-ss", f"{a}", "-t", f"{b - a}", "-an",
        "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30",
        "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-pix_fmt", "yuv420p", webm], timeout=900)
    sh([tool("ffmpeg"), "-y", "-v", "error", "-i", src, "-ss", f"{a}", "-t", f"{b - a}", "-an",
        "-vf", "fps=25,scale=640:-2:flags=lanczos,split[x][y];[x]palettegen=max_colors=128:stats_mode=diff[p];"
               "[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
        "-loop", "0", gif], timeout=900)
    for f in (webm, gif):
        print(f"teaser -> {os.path.relpath(f, ROOT)}")


WEB = os.path.join(ROOT, "..", "site", "landing", "public", "media")


def web(suffix):
    """The landing's web copies of the finals (see the module docstring)."""
    x264 = ["-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "slow"]
    aac = ["-c:a", "aac", "-b:a", "80k", "-ar", "48000", "-movflags", "+faststart"]
    jobs = [
        (film("16x9"), "scale=1280:720:flags=lanczos,fps=30",
         x264 + ["-b:v", "550k", "-maxrate", "900k", "-bufsize", "1800k"] + aac, f"film-16x9-{suffix}.mp4"),
        (film("16x9"), "scale=1280:720:flags=lanczos,fps=30",
         ["-c:v", "libsvtav1", "-preset", "6", "-b:v", "460k", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-b:a", "80k"],
         f"film-16x9-{suffix}.webm"),
        (film("9x16"), "scale=720:1280:flags=lanczos,fps=30",
         x264 + ["-b:v", "430k", "-maxrate", "700k", "-bufsize", "1400k"] + aac, f"film-9x16-{suffix}.mp4"),
    ]
    for src, vf, args, name in jobs:
        dst = os.path.normpath(os.path.join(WEB, name))
        sh([tool("ffmpeg"), "-y", "-v", "error", "-i", src, "-vf", vf] + args + [dst], timeout=1800)
        print(f"web -> {dst}  ({os.path.getsize(dst) / 1e6:.2f} MB, {duration(dst):.3f} s)")
    return 0


def duration(path):
    out = sh([tool("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout
    return float(out)


def check(fmt, fails):
    path = film(fmt)
    if not os.path.exists(path):
        fails.append(f"{fmt}: {os.path.relpath(path, ROOT)} is missing")
        return
    streams = probe(path)
    v = next((s for s in streams if s["codec_type"] == "video"), None)
    au = next((s for s in streams if s["codec_type"] == "audio"), None)
    w, h = FORMATS[fmt]
    num, den = (int(x) for x in v["r_frame_rate"].split("/"))
    fps = num / den
    L = loudness(path) if au else None
    rows = [
        ("video", v["codec_name"] == "h264" and v["profile"] == "High" and v["pix_fmt"] == "yuv420p",
         f"{v['codec_name']} {v['profile']} {v['pix_fmt']}"),
        ("size", (v["width"], v["height"]) == (w, h), f"{v['width']}x{v['height']}"),
        ("fps", abs(fps - FPS) < 1e-6, f"{fps:g}"),
        ("frames", int(v["nb_frames"]) == round(FPS * DURATION), v["nb_frames"]),
        ("duration", abs(duration(path) - DURATION) < 0.01, f"{duration(path):.3f} s"),
        ("audio", au is not None and au["codec_name"] == "aac",
         f"{au['codec_name']} {au['sample_rate']} Hz {int(au['bit_rate']) // 1000} kb/s" if au else "none"),
        ("loudness", L is not None and abs(L["I"] + 14) <= 1.0, f"{L['I']:.1f} LUFS" if L else "-"),
        ("true peak", L is not None and L["TP"] <= -1.0, f"{L['TP']:.1f} dBTP" if L else "-"),
    ]
    size = os.path.getsize(path) / 1e6
    print(f"\n{os.path.relpath(path, ROOT)}  ({size:.1f} MB)")
    for name, ok, val in rows:
        print(f"  {name:<10} {val:<28} {'ok' if ok else 'FAIL'}")
        if not ok:
            fails.append(f"{fmt}: {name} is {val}")


def main(argv):
    if "--web" in argv:
        rest = argv[argv.index("--web") + 1:]
        return web(rest[0] if rest else "v2")
    os.makedirs(FINAL, exist_ok=True)
    # The credits are kept in source (assets/CREDITS.md) and shipped beside the films.
    shutil.copyfile(os.path.join(ROOT, "assets", "CREDITS.md"), os.path.join(FINAL, "CREDITS.md"))
    if "--skip-posters" not in argv:
        posters()
    if "--skip-teaser" not in argv:
        teaser()
    fails = []
    for fmt in FORMATS:
        check(fmt, fails)
    for extra in ("kipdeck-teaser-6s.webm", "kipdeck-teaser-6s.gif"):
        p = os.path.join(FINAL, extra)
        if os.path.exists(p):
            print(f"\n{os.path.relpath(p, ROOT)}  ({os.path.getsize(p) / 1e6:.1f} MB, {duration(p):.2f} s)")
        else:
            fails.append(f"{extra} is missing")
    if fails:
        print("\nFAIL\n  " + "\n  ".join(fails))
        return 1
    print("\nall deliverables pass")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
