// Shoots the built landing page (dist/site) for review: stills at key scroll positions on a laptop,
// a big screen and a phone, in both themes, a scroll-through clip, and the numbers that matter
// (largest contentful paint, layout shift, frame times while scrolling, what the first load weighs).
//
//   npm run build:site && node design/shoot-landing.mjs design/shots/landing/<stage> [--clip] [--port 4690]
//
// It serves the build itself on 127.0.0.1 (a spare port, 4690 by default) and stops when done.
import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../site/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'design/shots/landing/latest'));
const clip = args.includes('--clip');
const port = Number(args[args.indexOf('--port') + 1] || 4690) || 4690;
const SITE = path.join(ROOT, 'dist', 'site');
mkdirSync(out, { recursive: true });

const { server, url } = await serve(SITE, port);
const browser = await chromium.launch({ headless: true });
const report = { url, shots: [], metrics: {} };

/** First-load weight: what index.html pulls in before any lazy chunk or media. */
function weight() {
  const html = readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="\.?\/?(assets\/[^"]+|theme-boot\.js)"/g)].map((m) => m[1]);
  const files = [...new Set(refs)].map((f) => {
    const buf = readFileSync(path.join(SITE, f));
    return { file: f, bytes: buf.length, gzip: gzipSync(buf).length };
  });
  const sum = (ext) => files.filter((f) => f.file.endsWith(ext)).reduce((a, f) => a + f.gzip, 0);
  const allJs = readdirSync(path.join(SITE, 'assets')).filter((f) => f.endsWith('.js')).reduce((a, f) => a + gzipSync(readFileSync(path.join(SITE, 'assets', f))).length, 0);
  return { files, jsGzipFirstLoad: sum('.js'), cssGzip: sum('.css'), fontBytes: files.filter((f) => f.file.endsWith('.woff2')).reduce((a, f) => a + f.bytes, 0), jsGzipAll: allJs, htmlGzip: gzipSync(html).length };
}
report.metrics.weight = weight();

async function context(viewport, scheme, extra = {}) {
  return browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1, colorScheme: scheme, ...extra });
}

/** Stills at the top of each section. */
async function stills(name, viewport, scheme, reduced = false) {
  const ctx = await context(viewport, scheme, { reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const file = (s) => path.join(out, `${name}-${s}.png`);
  await page.screenshot({ path: file('00-hero') });
  report.shots.push(file('00-hero'));
  const ids = await page.$$eval('[data-scene]', (els) => els.map((e) => e.id));
  let i = 1;
  for (const id of ids.slice(1)) {
    await page.evaluate((sid) => document.getElementById(sid).scrollIntoView({ block: 'start' }), id);
    await page.waitForTimeout(1100);
    const f = file(`${String(i++).padStart(2, '0')}-${id}`);
    await page.screenshot({ path: f });
    report.shots.push(f);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await ctx.close();
  return { errors, overflow };
}

/** LCP and CLS on a fresh load, plus frame times over a scripted scroll through the whole page. */
async function vitals(viewport, cpu = 1) {
  const ctx = await context(viewport, 'dark');
  const page = await ctx.newPage();
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
  }
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const lcp = await page.evaluate(() => ({ lcp: window.__lcp, el: performance.getEntriesByType('largest-contentful-paint').at(-1)?.element?.className ?? '' }));
  const frames = await page.evaluate(async () => {
    const times = [];
    let last = performance.now();
    const H = document.documentElement.scrollHeight - innerHeight;
    const total = 9000;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        times.push(now - last);
        last = now;
        const t = Math.min(1, (now - start) / total);
        scrollTo(0, H * t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    times.sort((a, b) => a - b);
    const pct = (p) => times[Math.floor(times.length * p)];
    return { frames: times.length, avgMs: times.reduce((a, b) => a + b, 0) / times.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), over20ms: times.filter((t) => t > 20).length };
  });
  const cls = await page.evaluate(() => window.__cls);
  await ctx.close();
  return { ...lcp, cls, scroll: frames };
}

/** A scroll-through clip: frames captured while scrolling, joined with ffmpeg. */
async function scrollClip(name, viewport) {
  const ctx = await context(viewport, 'dark');
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  const dir = path.join(out, `${name}-frames`);
  mkdirSync(dir, { recursive: true });
  const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const n = 360;
  for (let i = 0; i < 40; i++) {
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 80 });
    await page.waitForTimeout(40);
  }
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.evaluate((y) => scrollTo(0, y), Math.round(H * e));
    await page.waitForTimeout(30);
    await page.screenshot({ path: path.join(dir, `f${String(i + 40).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 80 });
  }
  await ctx.close();
  const mp4 = path.join(out, `${name}-scroll.mp4`);
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, 'f%04d.jpg'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', mp4]);
  rmSync(dir, { recursive: true, force: true });
  return mp4;
}

try {
  report.desktop = await stills('desktop-dark', { width: 1440, height: 900 }, 'dark');
  report.desktopLight = await stills('desktop-light', { width: 1440, height: 900 }, 'light');
  report.big = await stills('big-dark', { width: 1920, height: 1080 }, 'dark');
  report.phone = await stills('phone-dark', { width: 390, height: 844 }, 'dark');
  report.phoneLight = await stills('phone-light', { width: 390, height: 844 }, 'light');
  report.reduced = await stills('reduced-dark', { width: 1440, height: 900 }, 'dark', true);
  report.metrics.desktop = await vitals({ width: 1440, height: 900 });
  report.metrics.phone = await vitals({ width: 390, height: 844 });
  report.metrics.phoneThrottled = await vitals({ width: 390, height: 844 }, 4);
  if (clip) report.clip = await scrollClip('desktop', { width: 1440, height: 900 });
} finally {
  await browser.close();
  server.close();
}
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ metrics: report.metrics, errors: [report.desktop?.errors, report.phone?.errors], overflow: [report.desktop?.overflow, report.phone?.overflow], clip: report.clip ?? null }, null, 2));
statSync(out);
