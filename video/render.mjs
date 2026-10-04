#!/usr/bin/env node
// Renders the film: loads src/index.html in headless Chromium at the target
// size, steps t = from + i / fps, screenshots every frame into out/frames and
// encodes them with the soundtrack (H.264 high, yuv420p, CRF 16, +faststart,
// AAC 320k).
//
//   node render.mjs                       full 16:9, 1920x1080 @ 60 fps
//   node render.mjs --format 9x16         full 9:16, 1080x1920 @ 60 fps
//   node render.mjs --preview             fast check: 30 fps, 1/3 size, JPEG frames
//   node render.mjs --from 12 --to 16     a slice (audio is trimmed to match)
//   node render.mjs --still 14.0          one PNG to out/stills, no encode
//
// Other flags: --fps N, --w N, --h N, --guides, --no-grain, --blur N (max
// motion-blur samples), --out path.mp4, --keep-frames (skip the encode).

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, rm, stat, rename } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, rmSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const THREE_BUILD = path.dirname(require.resolve('three'));
const OUT = path.join(ROOT, 'out');
const FRAMES = path.join(OUT, 'frames');
const LOCK = path.join(FRAMES, '.render.lock');
const RUN_ID = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${process.pid}`;

// One render owns out/frames at a time. A second one fails fast instead of
// interleaving frames; a lock left by a dead process is cleared.
function takeLock() {
  mkdirSync(FRAMES, { recursive: true });
  if (existsSync(LOCK)) {
    let held = null;
    try { held = JSON.parse(readFileSync(LOCK, 'utf8')); } catch { /* unreadable: stale */ }
    let alive = false;
    if (held && held.pid) { try { process.kill(held.pid, 0); alive = true; } catch { alive = false; } }
    if (alive) throw new Error(`out/frames is locked by render ${held.runId} (pid ${held.pid}); wait for it or stop it`);
    rmSync(LOCK, { force: true });
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, runId: RUN_ID, started: new Date().toISOString(), argv: process.argv.slice(2) }));
  const release = () => { try { if (JSON.parse(readFileSync(LOCK, 'utf8')).pid === process.pid) rmSync(LOCK, { force: true }); } catch { /* gone */ } };
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { release(); process.exit(130); });
}

// Each run logs to out/logs/render-<run id>.log as well as the terminal.
function startLog() {
  const dir = path.join(OUT, 'logs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `render-${RUN_ID}.log`);
  const write = (lvl, args) => { try { appendFileSync(file, `${lvl}${args.map(String).join(' ')}\n`); } catch { /* best effort */ } };
  const log = console.log, err = console.error;
  console.log = (...args) => { write('', args); log(...args); };
  console.error = (...args) => { write('ERROR ', args); err(...args); };
  console.log(`run ${RUN_ID}: node render.mjs ${process.argv.slice(2).join(' ')}`);
}

function parseArgs(argv) {
  const a = { format: '16x9', preview: false, guides: false, grain: true, keepFrames: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const next = argv[++i];
      if (next == null) throw new Error(`${k} needs a value`);
      return next;
    };
    switch (k) {
      case '--fps': a.fps = Number(v()); break;
      case '--w': a.w = Number(v()); break;
      case '--h': a.h = Number(v()); break;
      case '--from': a.from = Number(v()); break;
      case '--to': a.to = Number(v()); break;
      case '--format': a.format = v(); break;
      case '--preview': a.preview = true; break;
      case '--guides': a.guides = true; break;
      case '--no-grain': a.grain = false; break;
      case '--blur': a.blur = Number(v()); break;
      case '--still': a.still = Number(v()); break;
      case '--stills': a.stills = v().split(',').map(Number); break;
      case '--out': a.out = v(); break;
      case '--keep-frames': a.keepFrames = true; break;
      case '--typesync': a.typesync = v(); break;
      case '-h': case '--help':
        console.log(readHelp());
        process.exit(0);
        break;
      default: throw new Error(`unknown flag ${k} (see --help)`);
    }
  }
  if (a.format !== '16x9' && a.format !== '9x16') throw new Error('--format must be 16x9 or 9x16');
  const full = a.format === '9x16' ? [1080, 1920] : [1920, 1080];
  const div = a.preview ? 3 : 1;
  a.w = a.w || Math.round(full[0] / div / 2) * 2;
  a.h = a.h || Math.round(full[1] / div / 2) * 2;
  a.fps = a.fps || (a.preview ? 30 : 60);
  if (a.blur == null && a.preview) a.blur = 2;
  if (a.w % 2 || a.h % 2) throw new Error(`yuv420p needs even dimensions, got ${a.w}x${a.h}`);
  if (!(a.fps > 0)) throw new Error('--fps must be positive');
  return a;
}

function readHelp() {
  return `usage: node render.mjs [--format 16x9|9x16] [--preview] [--fps N] [--w N] [--h N]
       [--from S] [--to S] [--still S] [--stills S,S,...] [--guides] [--no-grain] [--blur N] [--out file.mp4] [--keep-frames]
       [--typesync DIR]   display-type layer alone at every text hit (tools/verify.py measures it)`;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.css': 'text/css', '.png': 'image/png',
};

// Static server for src/, assets/ and three's build. Bound to localhost on a
// free port and closed when the render ends.
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const rel = decodeURIComponent(url.pathname);
      let file;
      if (rel.startsWith('/vendor/three/')) file = path.join(THREE_BUILD, rel.slice('/vendor/three/'.length));
      else file = path.join(ROOT, rel);
      const base = rel.startsWith('/vendor/three/') ? THREE_BUILD : ROOT;
      if (!path.resolve(file).startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Same approach as tests/mission-e2e.test.ts: Playwright's Chromium, else an
// installed Chrome or Edge, with SwiftShader so WebGL works headless.
async function launch() {
  const { chromium } = await import('playwright-core');
  const errors = [];
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    } catch (e) {
      errors.push(`${channel || 'playwright chromium'}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error(`no browser for playwright-core (npx playwright-core install chromium):\n  ${errors.join('\n  ')}`);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`))));
  });
}

const bin = (name) => (existsSync(`/opt/homebrew/bin/${name}`) ? `/opt/homebrew/bin/${name}` : name);

async function clearFrames() {
  await mkdir(FRAMES, { recursive: true });
  for (const f of await readdir(FRAMES)) if (/\.(png|jpe?g)$/.test(f)) await rm(path.join(FRAMES, f));
}

// Type sync: for every text hit, the display-type layer alone (everything
// else hidden, transparent background) on the hit frame and on the 6 frames
// after it has settled (+5..+8). A hit that lands under a full-frame flash is
// measured on the first frame after the flash. tools/verify.py compares the
// ink on the hit frame with the settled ink.
async function typesync(page, a, dir) {
  const beatmap = JSON.parse(await readFile(path.join(ROOT, 'src/beatmap.json'), 'utf8'));
  await mkdir(dir, { recursive: true });
  for (const f of await readdir(dir)) if (f.endsWith('.png')) await rm(path.join(dir, f));
  await page.evaluate(() => {
    for (const id of ['gl', 'svg', 'grain', 'guides']) document.getElementById(id).style.visibility = 'hidden';
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  });
  const flashes = beatmap.hits.filter((h) => h.kind === 'flash' && h.frames > 1);
  const hits = beatmap.hits.filter((h) => h.name.startsWith('text.') || (h.kind === 'text' && h.text));
  const manifest = [];
  for (const h of hits) {
    let n = Math.round(h.t * a.fps);
    for (const fl of flashes) {
      const f0 = Math.round(fl.t * a.fps);
      if (n >= f0 && n < f0 + fl.frames) n = f0 + fl.frames;
    }
    // +5..+8: settled, and still clear of the next hit's pre-roll (hits are >= 15 frames apart).
    const offsets = [0, 5, 6, 7, 8];
    const files = [];
    for (const k of offsets) {
      if ((n + k) / a.fps >= beatmap.duration) continue;
      await page.evaluate((tt) => window.__render(tt), (n + k) / a.fps);
      // How formed each visible display-type block is (1 = every word set,
      // no partial wipe): typeLayer writes it to data-formed.
      const formed = await page.evaluate(() => [...document.querySelectorAll('#type .type')]
        .filter((el) => el.style.display !== 'none')
        .map((el) => ({ text: el.textContent.slice(0, 40), formed: Number(el.dataset.formed ?? 1) })));
      const file = `${h.name}@${k}.png`;
      await page.screenshot({ path: path.join(dir, file), type: 'png', omitBackground: true });
      files.push({ offset: k, file, formed });
    }
    manifest.push({ name: h.name, t: h.t, frame: n, files });
  }
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ fps: a.fps, w: a.w, h: a.h, format: a.format, hits: manifest }, null, 1));
  console.log(`typesync: ${manifest.length} text hits -> ${path.relative(ROOT, dir)}`);
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const server = await serve();
  const browser = await launch();
  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e)));
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      // SwiftShader reports the screenshot's pixel readback as a performance
      // note. It is expected for a frame-by-frame capture and harmless.
      if (/GL Driver Message .*Performance.*GPU stall due to ReadPixels/.test(m.text())) return;
      pageErrors.push(`console.${m.type()}: ${m.text()}`);
    });
    const q = new URLSearchParams({ w: a.w, h: a.h, fps: a.fps, format: a.format });
    if (a.guides) q.set('guides', '1');
    if (!a.grain) q.set('grain', '0');
    if (a.blur != null) q.set('blur', String(a.blur));
    const { port } = server.address();
    await page.goto(`http://127.0.0.1:${port}/src/index.html?${q}`);
    const info = await page.evaluate(async () => {
      try { return await window.__ready; } catch (e) { return { error: String(e && e.stack || e) }; }
    });
    if (!info || info.error) throw new Error(`page failed to boot: ${info && info.error}\n${pageErrors.join('\n')}`);

    if (a.typesync) {
      await typesync(page, a, path.resolve(a.typesync));
      if (pageErrors.length) throw new Error(`page reported errors:\n${pageErrors.join('\n')}`);
      return;
    }

    if (a.still != null || a.stills) {
      const dir = path.join(OUT, 'stills');
      await mkdir(dir, { recursive: true });
      for (const t of a.stills || [a.still]) {
        if (!(t >= 0)) throw new Error(`bad still time ${t}`);
        await page.evaluate((tt) => window.__render(tt), t);
        const file = path.join(dir, `${a.format}-${t.toFixed(3)}${a.guides ? '-guides' : ''}.png`);
        await page.screenshot({ path: file, type: 'png' });
        console.log(`still ${t}s -> ${path.relative(ROOT, file)}`);
      }
      if (pageErrors.length) throw new Error(`page reported errors:\n${pageErrors.join('\n')}`);
      return;
    }

    const from = a.from ?? 0;
    const to = a.to ?? info.duration;
    if (!(to > from) || from < 0 || to > info.duration + 1e-9) throw new Error(`bad range ${from}..${to} (film is ${info.duration}s)`);
    const n = Math.round((to - from) * a.fps);
    const ext = a.preview ? 'jpg' : 'png';
    takeLock();
    startLog();
    await clearFrames();
    console.log(`rendering ${n} frames ${from}s..${to}s at ${a.w}x${a.h} ${a.fps} fps (${a.format}${a.preview ? ', preview' : ''})`);
    const t0 = Date.now();
    let lastPct = -1;
    for (let i = 0; i < n; i++) {
      const t = from + i / a.fps;
      await page.evaluate((tt) => window.__render(tt), t);
      const file = path.join(FRAMES, `${String(i).padStart(5, '0')}.${ext}`);
      await page.screenshot(ext === 'jpg' ? { path: file, type: 'jpeg', quality: 90 } : { path: file, type: 'png' });
      const pct = Math.floor(((i + 1) / n) * 10);
      if (pct !== lastPct) {
        lastPct = pct;
        const el = (Date.now() - t0) / 1000;
        console.log(`  ${String(pct * 10).padStart(3)}%  frame ${i + 1}/${n}  ${el.toFixed(1)}s`);
      }
    }
    if (pageErrors.length) throw new Error(`page reported errors:\n${pageErrors.join('\n')}`);
    if (a.keepFrames) { console.log(`frames in ${path.relative(ROOT, FRAMES)}`); return; }

    const audio = path.join(ROOT, info.audio);
    await stat(audio);
    const dur = (n / a.fps).toFixed(6);
    const slice = a.from != null || a.to != null ? `-${from}-${to}` : '';
    const out = a.out ? path.resolve(a.out) : path.join(OUT, `ugc-army-${a.format}${a.preview ? '-preview' : ''}${slice}.mp4`);
    await mkdir(path.dirname(out), { recursive: true });
    // Encode to a temp name and move it into place only once ffprobe confirms
    // the frame count, so a failed run can never leave a short film behind.
    const finalOut = out;
    const tmpOut = `${finalOut.replace(/\.mp4$/, '')}.tmp-${RUN_ID}.mp4`;
    console.log('encoding...');
    await run(bin('ffmpeg'), [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(a.fps), '-i', path.join(FRAMES, `%05d.${ext}`),
      '-ss', String(from), '-t', dur, '-i', audio,
      '-map', '0:v:0', '-map', '1:a:0',
      // Convert RGB frames to limited-range BT.709 and tag it, so players do
      // not guess (JPEG preview frames would otherwise come out as yuvj420p).
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '16',
      '-preset', a.preview ? 'veryfast' : 'slow', '-r', String(a.fps),
      '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
      '-t', dur, '-movflags', '+faststart', tmpOut,
    ]);
    const probe = JSON.parse(await run(bin('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,pix_fmt,duration,nb_frames,sample_rate,bit_rate', '-of', 'json', tmpOut]));
    const vs = probe.streams.find((st) => st.codec_type === 'video');
    if (!vs || Number(vs.nb_frames) !== n) {
      await rm(tmpOut, { force: true });
      throw new Error(`encode has ${vs ? vs.nb_frames : 'no'} video frames, expected ${n}; nothing written`);
    }
    await rename(tmpOut, finalOut);
    for (const s of probe.streams) {
      console.log(s.codec_type === 'video'
        ? `  video ${s.codec_name} ${s.profile} ${s.width}x${s.height} ${s.pix_fmt} ${Number(s.duration).toFixed(3)}s ${s.nb_frames} frames`
        : `  audio ${s.codec_name} ${s.sample_rate} Hz ${Math.round(s.bit_rate / 1000)} kb/s ${Number(s.duration).toFixed(3)}s`);
    }
    console.log(`wrote ${path.relative(ROOT, out)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
