// Cuts the technical demo from edit.json with ffmpeg: launch/video/out/demo-3min-silent.mp4 (1920x1080,
// 30 fps, H.264, video only: no audio track until the founder's voiceover is laid on, see
// launch/video/README.md), demo-3min-captions.srt (the voiceover as captions, on the same clock),
// capture/voiceover.txt (the lines to read, with when each starts) and demo-60s-9x16.mp4 (1080x1920, 60 s).
//
//   node launch/video/capture/office.mjs && node launch/video/capture/web.mjs \
//     && node --import tsx launch/video/capture/pom.ts && node launch/video/capture/cards.mjs \
//     && node launch/video/capture/assemble.mjs [main|vertical]
//
// Each segment is rendered on its own first (a still gets a slow push from one rect to the next with
// zoompan on a 2x upscale, so it doesn't shimmer; a clip is trimmed), with its beat label, source tag and
// note over it. Segments joined by a cut are concatenated; groups are joined with crossfades. Captions go
// on last, over the joined picture, so they hold across cuts. REUSE=1 keeps the 16:9 segments already in
// out/build/ (after a change to captions only; delete a segment's file to render it again).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OUT = path.join(ROOT, 'launch', 'video', 'out');
const BUILD = path.join(OUT, 'build');
mkdirSync(BUILD, { recursive: true });
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE ?? '/opt/homebrew/bin/ffprobe';
const edit = JSON.parse(readFileSync(path.join(HERE, 'edit.json'), 'utf8'));
const FPS = edit.fps;
const what = process.argv[2];
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

const ff = (args) => execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 26 });
const probe = (file) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const src = (s) => path.join(OUT, s);
const isClip = (s) => s.endsWith('.mp4');
const pad = (i) => String(i).padStart(2, '0');
const r3 = (x) => Math.round(x * 1000) / 1000;

/** zoompan from rect a to rect b ([x, y, w] in source pixels at 1920 wide) over n frames, eased, on a 2x upscale. */
function kenBurns(a, b, n, outW, outH, inW) {
  const k = 2;
  const p = `(on/${Math.max(1, n - 1)})*(on/${Math.max(1, n - 1)})*(3-2*(on/${Math.max(1, n - 1)}))`;
  const w = `(${a[2]}+(${b[2] - a[2]})*${p})`;
  const z = `${inW}/${w}`;
  const x = `(${a[0]}+(${b[0] - a[0]})*${p})*${k}`;
  const y = `(${a[1]}+(${b[1] - a[1]})*${p})*${k}`;
  return `scale=iw*${k}:ih*${k}:flags=lanczos,zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${outW}x${outH}:fps=${FPS}`;
}

/** One 16:9 segment: picture, then its chip row and note. */
function renderSegment(s, i) {
  const out = path.join(BUILD, `seg-${pad(i)}.mp4`);
  const n = Math.round(s.dur * FPS);
  // REUSE=1 keeps segments already rendered (after an edit to captions only).
  if (process.env.REUSE === '1' && existsSync(out)) return out;
  const inputs = [];
  let chain;
  if (isClip(s.src)) {
    inputs.push('-ss', String(s.in ?? 0), '-t', String(s.dur), '-i', src(s.src));
    // crop: [x, y, width] of the clip (at 1920x1080), held for the whole shot, so small type reads.
    const crop = s.crop ? `scale=1920:1080:flags=lanczos,crop=${s.crop[2]}:${Math.round((s.crop[2] * 9) / 16)}:${s.crop[0]}:${s.crop[1]},` : '';
    chain = `[0:v]fps=${FPS},${crop}scale=1920:1080:flags=lanczos,setsar=1,trim=end_frame=${n},setpts=PTS-STARTPTS[v0]`;
  } else {
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', src(s.src));
    const kb = s.kb ?? [[0, 0, 1920], [0, 0, 1920]];
    chain = `[0:v]scale=1920:1080:flags=lanczos,setsar=1,${kenBurns(kb[0], kb[1], n, 1920, 1080, 1920)},trim=end_frame=${n},setpts=PTS-STARTPTS[v0]`;
  }
  let last = 'v0';
  let k = 1;
  if (s.tag || s.url) {
    inputs.push('-i', path.join(OUT, 'gfx', `seg-${pad(i)}.png`));
    chain += `;[${last}][${k}:v]overlay=0:0:eof_action=repeat[v${k}]`;
    last = `v${k++}`;
  }
  if (s.note) {
    const [a, b] = s.note;
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', path.join(OUT, 'gfx', `note-${pad(i)}.png`));
    chain += `;[${k}:v]format=rgba,fade=t=in:st=${a}:d=0.3:alpha=1,fade=t=out:st=${Math.max(a, b - 0.3)}:d=0.3:alpha=1[n${k}];[${last}][n${k}]overlay=0:0:shortest=1[v${k}]`;
    last = `v${k++}`;
  }
  ff([...inputs, '-filter_complex', chain, '-map', `[${last}]`, '-frames:v', String(n), ...ENC, '-an', out]);
  return out;
}

/** Joins segment files: cuts by concat inside a group, groups by crossfades. Returns the joined file's segment start times. */
function join(files, cuts, wanted, out, size) {
  // The lengths the files really have (a clip shorter than asked would throw every later offset off).
  const durs = files.map((f, i) => {
    const d = probe(f);
    if (Math.abs(d - wanted[i]) > 0.05) console.log(`note: ${path.basename(f)} is ${d.toFixed(2)} s, edit.json asks ${wanted[i]} s`);
    return d;
  });
  const groups = [];
  let cur = [];
  files.forEach((f, i) => {
    cur.push(i);
    if (i === files.length - 1 || cuts[i] > 0) {
      groups.push(cur);
      cur = [];
    }
  });
  const inputs = files.flatMap((f) => ['-i', f]);
  let graph = '';
  const gdur = [];
  groups.forEach((g, gi) => {
    graph += `${g.map((i) => `[${i}:v]`).join('')}concat=n=${g.length}:v=1:a=0,settb=1/${FPS},setpts=N/${FPS}/TB,fps=${FPS},format=yuv420p,scale=${size},setsar=1[g${gi}];`;
    gdur.push(g.reduce((t, i) => t + durs[i], 0));
  });
  let last = 'g0';
  let t = gdur[0];
  const starts = [0];
  for (let gi = 1; gi < groups.length; gi++) {
    const x = cuts[groups[gi - 1].at(-1)];
    const off = r3(t - x);
    starts.push(off);
    graph += `[${last}][g${gi}]xfade=transition=fade:duration=${x}:offset=${off}[x${gi}];`;
    last = `x${gi}`;
    t = off + gdur[gi];
  }
  graph = graph.replace(/;$/, '');
  ff([...inputs, '-filter_complex', graph, '-map', `[${last}]`, ...ENC, '-an', out]);
  // Segment start times on the joined clock.
  const segStart = [];
  groups.forEach((g, gi) => {
    let at = starts[gi];
    for (const i of g) {
      segStart[i] = at;
      at += durs[i];
    }
  });
  return { segStart, total: t, durs };
}

const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  const s = Math.floor((ms % 60e3) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms % 1000).padStart(3, '0')}`;
};

function main16x9() {
  const segs = edit.segments;
  const files = segs.map((s, i) => {
    const f = renderSegment(s, i);
    process.stdout.write(`seg ${pad(i)} `);
    return f;
  });
  console.log();
  const durs = segs.map((s) => s.dur);
  const cuts = segs.map((s) => s.cut);
  const joined = path.join(BUILD, 'joined.mp4');
  const { segStart, total } = join(files, cuts, durs, joined, '1920:1080');
  for (let i = 0; i < segs.length; i++) if (Math.abs(probe(files[i]) - durs[i]) > 0.05) throw new Error(`segment ${i} is short: fix its in/dur in edit.json`);

  // Captions: each beat's lines over its span, by length, with a breath between them. One line each, at
  // most 42 characters and 17 a second, so a judge with the sound off can read them.
  const MAX_CHARS = 42;
  const MAX_CPS = 17;
  const caps = [];
  let n = 0;
  for (const b of edit.beats) {
    if (!b.captions.length) continue;
    const idx = segs.map((s, i) => [s, i]).filter(([s]) => s.beat === b.n).map(([, i]) => i);
    const lastSeg = idx.at(-1);
    const start = segStart[idx[0]] + 0.45;
    const end = segStart[lastSeg] + segs[lastSeg].dur - (segs[lastSeg].cut > 0 ? segs[lastSeg].cut : 0) - 0.35;
    const gap = 0.25;
    for (const c of b.captions) if (c.length > MAX_CHARS) throw new Error(`caption over ${MAX_CHARS} characters (${c.length}): ${c}`);
    const words = b.captions.map((c) => c.length + 6);
    const sum = words.reduce((a, c) => a + c, 0);
    const span = end - start - gap * (b.captions.length - 1);
    let t = start;
    b.captions.forEach((text, j) => {
      const d = (span * words[j]) / sum;
      if (text.length / d > MAX_CPS) throw new Error(`caption too fast (${(text.length / d).toFixed(1)} cps), lengthen beat ${b.n}: ${text}`);
      caps.push({ i: n++, beat: b.n, text, a: r3(t), b: r3(t + d) });
      t += d + gap;
    });
  }
  const inputs = ['-i', joined];
  let graph = '[0:v]null[c0]';
  // Each caption is looped only for its own time, shifted to where it plays, and cut to the lower strip
  // it occupies (the full frame, looped for three minutes, runs out of memory).
  const STRIP = 300;
  caps.forEach((c, j) => {
    const d = r3(c.b - c.a);
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', path.join(OUT, 'gfx', `cap-${pad(c.i)}.png`));
    graph += `;[${j + 1}:v]crop=1920:${STRIP}:0:${1080 - STRIP},format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${r3(d - 0.2)}:d=0.2:alpha=1,setpts=PTS+${c.a}/TB[k${j}];[c${j}][k${j}]overlay=0:${1080 - STRIP}:eof_action=pass[c${j + 1}]`;
  });
  const final = path.join(OUT, 'demo-3min-silent.mp4');
  ff([...inputs, '-filter_complex', graph, '-map', `[c${caps.length}]`, ...ENC, '-an', '-t', String(total), '-movflags', '+faststart', final]);
  const srt = caps.map((c, j) => `${j + 1}\n${srtTime(c.a)} --> ${srtTime(c.b)}\n${c.text}\n`).join('\n');
  writeFileSync(path.join(OUT, 'demo-3min-captions.srt'), srt);
  writeFileSync(path.join(HERE, 'demo-3min-captions.srt'), srt);
  // The cut list, for whoever edits the voiceover in: where each beat and segment sits.
  const list = segs.map((s, i) => `${srtTime(segStart[i])}  ${String(s.beat).padStart(2)}  ${s.dur.toFixed(1).padStart(4)}s  ${s.src}${s.tag ? `  [${s.tag}]` : ''}`).join('\n');
  // The voiceover to read, beat by beat, with where each line starts in the cut.
  const vo = edit.beats.filter((b) => b.captions.length).map((b) => {
    const mine = caps.filter((c) => c.beat === b.n);
    return `Beat ${b.n}, ${b.title} (${srtTime(mine[0].a).slice(3, 8)})\n${mine.map((c) => `  ${srtTime(c.a).slice(3, 11)}  ${c.text}`).join('\n')}`;
  });
  writeFileSync(path.join(HERE, 'voiceover.txt'), `The voiceover for demo-3min-silent.mp4, read to picture (generated by assemble.mjs from edit.json).\nEach line shows where its caption starts (mm:ss,ms). About ${caps.reduce((a, c) => a + c.text.split(/\s+/).length, 0)} words over ${total.toFixed(0)} s.\n\n${vo.join('\n\n')}\n`);
  writeFileSync(path.join(HERE, 'cut-list.txt'), `demo-3min-silent.mp4, ${total.toFixed(2)} s (from edit.json by assemble.mjs)\n\nstart         beat  length  source  [tag]\n${list}\n`);
  console.log(`main: ${final} ${probe(final).toFixed(2)} s, ${caps.length} captions`);
}

function mainVertical() {
  const v = edit.vertical;
  const files = v.segments.map((s, i) => {
    const out = path.join(BUILD, `vseg-${pad(i)}.mp4`);
    const n = Math.round(s.dur * FPS);
    if (s.full) {
      ff(['-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', src(s.src), '-filter_complex', `[0:v]scale=1080:1920,setsar=1,zoompan=z='1+0.025*on/${n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${n}:s=1080x1920:fps=${FPS},trim=end_frame=${n}[v]`, '-map', '[v]', '-frames:v', String(n), ...ENC, out]);
    } else {
      const [x, y, w] = s.crop;
      const h = Math.round((w * 10) / 9);
      // A clip is cropped and scaled; a still is cropped first (zoompan's zoom is relative to its input),
      // then pushed in 6% toward its middle.
      const pic = isClip(s.src)
        ? `[0:v]fps=${FPS},crop=${w}:${h}:${x}:${y},scale=1080:1200:flags=lanczos,setsar=1,trim=end_frame=${n},setpts=PTS-STARTPTS[p]`
        : `[0:v]scale=1920:1080,setsar=1,crop=${w}:${h}:${x}:${y}[cr];[cr]${kenBurns([0, 0, w], [w * 0.03, h * 0.03, w * 0.94], n, 1080, 1200, w)},trim=end_frame=${n},setpts=PTS-STARTPTS[p]`;
      const inputs = isClip(s.src) ? ['-ss', String(s.in ?? 0), '-t', String(s.dur), '-i', src(s.src)] : ['-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', src(s.src)];
      const graph = `${pic};color=c=0x0B0B0C:s=1080x1920:r=${FPS}:d=${s.dur}[bg];[bg][p]overlay=0:300:shortest=1[b];[b][1:v]overlay=0:0:eof_action=repeat[v]`;
      ff([...inputs, '-i', path.join(OUT, 'gfx', `vseg-${pad(i)}.png`), '-filter_complex', graph, '-map', '[v]', '-frames:v', String(n), ...ENC, out]);
    }
    process.stdout.write(`vseg ${pad(i)} `);
    return out;
  });
  console.log();
  const durs = v.segments.map((s) => s.dur);
  const cuts = v.segments.map(() => v.cut);
  const joined = path.join(BUILD, 'vjoined.mp4');
  const { total } = join(files, cuts, durs, joined, '1080:1920');
  const final = path.join(OUT, 'demo-60s-9x16.mp4');
  ff(['-i', joined, '-map', '0:v', '-c:v', 'copy', '-an', '-movflags', '+faststart', final]);
  console.log(`vertical: ${final} ${probe(final).toFixed(2)} s`);
}

const deadline = setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, 3_000_000);
if (!what || what === 'main') main16x9();
if (!what || what === 'vertical') mainVertical();
clearTimeout(deadline);
