#!/usr/bin/env python3
"""Check an encoded film against the beatmap.

Reports:
  - container: video/audio codecs, size, fps, frame count, durations
  - picture sync: mean colour of the frames around the flash hits, so the
    white flash and the invert must land on exactly frame round(t * fps)
  - audio sync: onset of each impact/drop/flash hit in the mp4's audio vs its
    beatmap time, and the lag between the mp4's audio and soundtrack.wav
    (AAC priming must be compensated, so this should be 0 samples)
  - loudness: EBU R128 integrated, LRA and true peak of the mp4's audio

usage: python3 tools/verify.py film.mp4 [--from 0]
Exits non-zero if a check fails.
"""
import json
import math
import os
import re
import subprocess
import sys
from array import array

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SR = 48000
PAPER = (0xF2, 0xF0, 0xEB)


def tool(name):
    p = f"/opt/homebrew/bin/{name}"
    return p if os.path.exists(p) else name


def sh(args, timeout=600):
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout)


def probe(film):
    out = sh([tool("ffprobe"), "-v", "error", "-show_entries",
              "stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_frames,duration,sample_rate,channels,bit_rate,color_space,color_range",
              "-of", "json", film]).stdout
    return json.loads(out)["streams"]


def pcm(src, start=None, dur=None):
    args = [tool("ffmpeg"), "-v", "error"]
    if start is not None:
        args += ["-ss", f"{start:.6f}"]
    args += ["-i", src]
    if dur is not None:
        args += ["-t", f"{dur:.6f}"]
    args += ["-map", "0:a:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    a = array("f")
    a.frombytes(sh(args).stdout)
    return a


def frame_means(film, frames, w, h):
    """Mean RGB of each listed frame index (decoded at 1/8 size)."""
    sw, sh_ = max(2, w // 8 // 2 * 2), max(2, h // 8 // 2 * 2)
    expr = "+".join(f"eq(n\\,{n})" for n in frames)
    raw = sh([tool("ffmpeg"), "-v", "error", "-i", film, "-vf",
              f"select='{expr}',scale={sw}:{sh_}:out_range=pc,format=rgb24",
              "-fps_mode", "passthrough", "-f", "rawvideo", "-"]).stdout
    size = sw * sh_ * 3
    out = {}
    for k, n in enumerate(sorted(frames)):
        buf = raw[k * size:(k + 1) * size]
        px = sw * sh_
        out[n] = tuple(round(sum(buf[c::3]) / px) for c in range(3))
    return out


def onset(sig, t_hint, window=0.05, look=0.010):
    """Onset of the sharpest attack within +-window of t_hint.

    The signal is cut into 1 ms bins of RMS energy. Each bin is scored by its
    energy over the mean energy of the `look` seconds before it, and the bin
    with the biggest jump wins. Risers and swells that build into a hit rise
    slowly, so they do not score; the hit's own transient does.
    Returns (onset seconds, jump in dB)."""
    hop = SR // 1000
    back = round(look * 1000)
    lo = max(0, int((t_hint - window) * SR) - back * hop)
    hi = min(len(sig), int((t_hint + window) * SR) + hop)
    env = []
    for i in range(lo, hi - hop, hop):
        seg = sig[i:i + hop]
        env.append(sum(x * x for x in seg) / hop + 1e-12)
    best, best_k = None, None
    for k in range(back, len(env)):
        prev = sum(env[k - back:k]) / back
        score = env[k] / prev
        if best is None or score > best:
            best, best_k = score, k
    if best_k is None:
        return None

    return (lo + best_k * hop) / SR, 10 * math.log10(best)


def xcorr_lag(a, b, max_lag=2048):
    """Lag (samples) of b relative to a that maximises their correlation."""
    n = min(len(a), len(b)) - max_lag * 2
    best, best_lag = None, 0
    for lag in range(-max_lag, max_lag + 1, 1):
        s = 0.0
        for i in range(max_lag, max_lag + n, 4):
            s += a[i] * b[i + lag]
        if best is None or s > best:
            best, best_lag = s, lag
    return best_lag


def loudness(film):
    err = subprocess.run([tool("ffmpeg"), "-hide_banner", "-nostats", "-i", film, "-map", "0:a:0",
                          "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True, timeout=600).stderr
    summary = err[err.rfind("Summary:"):]
    get = lambda pat: float(re.search(pat, summary, re.S).group(1))
    return {
        "I": get(r"I:\s+(-?[\d.]+) LUFS"),
        "LRA": get(r"LRA:\s+(-?[\d.]+) LU"),
        "TP": get(r"True peak:.*?Peak:\s+(-?[\d.]+) dBFS"),
    }


def main(argv):
    film = argv[0]
    start = float(argv[argv.index("--from") + 1]) if "--from" in argv else 0.0
    with open(os.path.join(ROOT, "src", "beatmap.json")) as f:
        bm = json.load(f)
    fails = []

    streams = probe(film)
    v = next(s for s in streams if s["codec_type"] == "video")
    a = next(s for s in streams if s["codec_type"] == "audio")
    num, den = v["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    nb = int(v["nb_frames"])
    print(f"video  {v['codec_name']} {v.get('profile')} {v['width']}x{v['height']} {v['pix_fmt']} "
          f"{v.get('color_space')}/{v.get('color_range')} {fps:g} fps {nb} frames {float(v['duration']):.4f}s")
    print(f"audio  {a['codec_name']} {a['sample_rate']} Hz {a['channels']} ch "
          f"{round(int(a['bit_rate']) / 1000)} kb/s {float(a['duration']):.4f}s")
    expect = (bm["duration"] - start) if start == 0 else None
    if expect is not None:
        if nb != round(expect * fps):
            fails.append(f"frame count {nb} != {round(expect * fps)}")
        if abs(float(v["duration"]) - expect) > 0.5 / fps:
            fails.append(f"video duration {v['duration']} != {expect}")
        if abs(float(a["duration"]) - expect) > 0.03:
            fails.append(f"audio duration {a['duration']} != {expect}")

    # Picture sync on the flash hits.
    flashes = [h for h in bm["hits"] if h["kind"] == "flash"]
    want = set()
    for h in flashes:
        n = round((h["t"] - start) * fps)
        if 1 <= n < nb - 1:
            want |= {n - 1, n, n + 1, n + 2}
    means = frame_means(film, sorted(want), v["width"], v["height"]) if want else {}
    print("\npicture sync (mean RGB of frames around each flash hit)")
    for h in flashes:
        n = round((h["t"] - start) * fps)
        if n not in means:
            continue
        row = "  ".join(f"f{k}:{'#%02X%02X%02X' % means[k]}" for k in (n - 1, n, n + 1, n + 2))
        print(f"  {h['t']:6.3f}s {h['name']:<12} {row}")
        if h["name"] == "flash.white":
            d = max(abs(c - p) for c, p in zip(means[n], PAPER))
            before = max(abs(c - p) for c, p in zip(means[n - 1], PAPER))
            if d > 3:
                fails.append(f"{h['name']} frame {n} is {means[n]}, not paper")
            if before <= 3:
                fails.append(f"{h['name']} is already paper on frame {n - 1} (early)")
        else:
            jump = sum(abs(x - y) for x, y in zip(means[n], means[n - 1]))
            if jump < 60:
                fails.append(f"{h['name']} frame {n} barely changes from {n - 1} (mean diff {jump})")

    # Audio sync.
    print("\naudio sync (onset in the mp4 audio vs beatmap time)")
    film_pcm = pcm(film)
    wav = os.path.join(ROOT, bm["audio"])
    worst = 0.0
    picks = [h for h in bm["hits"] if h["kind"] in ("impact", "drop", "flash", "stamp")]
    seen = set()
    for h in picks:
        if h["t"] in seen or not (start + 0.07 <= h["t"] <= start + nb / fps - 0.07):
            continue
        seen.add(h["t"])
        r = onset(film_pcm, h["t"] - start)
        if r is None:
            print(f"  {h['t']:6.3f}s {h['name']:<22} no onset found")
            continue
        on, jump = r
        off = (on - (h["t"] - start)) * 1000
        # Below a 10 dB jump the hit has no clear transient of its own (it is
        # masked by a riser or a sustained layer), so its onset is not a
        # reliable sync measurement. It is listed and flagged, not scored.
        clear = jump >= 10
        if clear:
            worst = max(worst, abs(off))
        print(f"  {h['t']:6.3f}s {h['kind']:<7} {h['name']:<20} onset {on + start:7.4f}s  {off:+6.1f} ms"
              f"  ({off * fps / 1000:+.2f} frames, attack +{jump:.0f} dB){'' if clear else '  weak transient'}")
    print(f"  worst offset over clear transients: {worst:.1f} ms")
    if worst > 1000 / fps:
        fails.append(f"an audio onset is {worst:.1f} ms off its beatmap time (more than one frame)")

    # mp4 audio vs master: alignment through the AAC encode.
    seg_t = 14.0 - start if start <= 13.9 else 0.2
    src = pcm(wav, start + seg_t - 0.3, 0.6)
    enc = film_pcm[int((seg_t - 0.3) * SR):int((seg_t + 0.3) * SR)]
    lag = xcorr_lag(src, enc, max_lag=1024)
    print(f"\nmp4 audio vs soundtrack.wav lag around {seg_t + start:.2f}s: {lag} samples ({lag / SR * 1000:+.2f} ms)")
    if abs(lag) > SR // 1000:
        fails.append(f"encoded audio is {lag} samples off the master")

    # Loudness.
    L = loudness(film)
    ref = bm.get("loudness", {})
    print(f"\nloudness  I {L['I']:.1f} LUFS  LRA {L['LRA']:.1f} LU  true peak {L['TP']:.1f} dBTP"
          f"   (master: I {ref.get('integratedLUFS')} LUFS, TP {ref.get('truePeakDBTP')} dBTP)")
    if L["TP"] > -1.0:
        fails.append(f"true peak {L['TP']} dBTP is above -1 dBTP")
    if ref.get("integratedLUFS") is not None and abs(L["I"] - ref["integratedLUFS"]) > 0.5:
        fails.append(f"integrated loudness {L['I']} drifts from the master {ref['integratedLUFS']}")

    print()
    if fails:
        print("FAIL")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main(sys.argv[1:])
