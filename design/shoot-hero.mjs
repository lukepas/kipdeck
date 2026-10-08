// Shoots the landing page's hero opening for review: stills along its timeline (the launch, the
// inhale, the rows, Codex asking, the clocks running, the answer, the ghost cursor), a real-time
// clip of the first twelve seconds, and the numbers for the opening: LCP and its element, layout
// shift, long tasks, and frame times while it plays.
//
//   npm run build:site && node design/shoot-hero.mjs design/shots/landing/<stage> [--port 4692]
//
// It serves dist/site itself on 127.0.0.1 and stops when done.
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../site/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'design/shots/landing/latest'));
const port = Number(args[args.indexOf('--port') + 1] || 4692) || 4692;
mkdirSync(out, { recursive: true });

const { server, url } = await serve(path.join(ROOT, 'dist', 'site'), port);
const browser = await chromium.launch({ headless: true });
const report = { url, timeline: {}, vitals: {} };

const vitalsInit = () => {
  window.__lcp = { t: 0, el: '' };
  window.__cls = 0;
  window.__long = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      const el = e.element;
      window.__lcp = { t: Math.round(e.startTime), el: el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}` : '' };
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
  // Frame times from the first frame on.
  window.__frames = [];
  let last = performance.now();
  const tick = (now) => {
    window.__frames.push(now - last);
    last = now;
    if (now < 12000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

function frameStats(times) {
  const t = [...times].slice(2).sort((a, b) => a - b);
  const pct = (p) => Math.round(t[Math.floor(t.length * p)] * 10) / 10;
  return { frames: t.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), over20ms: t.filter((x) => x > 20).length };
}

/** Stills along the opening, at fixed times after navigation. */
async function timeline(name, viewport, scheme) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1, colorScheme: scheme, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(vitalsInit);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  const at = async (ms, label) => {
    const wait = ms - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const f = path.join(out, `${name}-t${String(ms).padStart(5, '0')}-${label}.png`);
    await page.screenshot({ path: f });
    return f;
  };
  const shots = [];
  shots.push(await at(250, 'launch'));
  shots.push(await at(650, 'inhale'));
  shots.push(await at(1200, 'rows'));
  shots.push(await at(2550, 'asks'));
  shots.push(await at(3300, 'climbed'));
  shots.push(await at(7000, 'waiting'));
  const v = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, longTasks: window.__long, frames: window.__frames }));
  // The answer: click the waiting row.
  await page.locator('[data-clear]').click();
  await page.waitForTimeout(350);
  shots.push(path.join(out, `${name}-answered.png`));
  await page.screenshot({ path: shots.at(-1) });
  await page.waitForTimeout(1500);
  shots.push(path.join(out, `${name}-back-to-work.png`));
  await page.screenshot({ path: shots.at(-1) });
  await ctx.close();
  return { shots, errors, lcp: v.lcp, cls: v.cls, longTasks: v.longTasks, frames: frameStats(v.frames) };
}

/** The ghost cursor: sit still for six seconds once Codex asks. */
async function ghost(name, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(2400 + 6000 + 1000);
  const a = path.join(out, `${name}-ghost-arrives.png`);
  await page.screenshot({ path: a });
  await page.waitForTimeout(700);
  const b = path.join(out, `${name}-ghost-answers.png`);
  await page.screenshot({ path: b });
  const cleared = await page.locator('[data-pulse-count]').textContent();
  await ctx.close();
  return { shots: [a, b], clearedByGhost: cleared === '0' };
}

/** The dot grid bending toward a pointer, and copying the command (every unit turns to look). */
async function pointer(name, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(3600);
  for (let i = 0; i <= 10; i++) await page.mouse.move(820 + i * 8, 200 + i * 6);
  await page.waitForTimeout(400);
  const a = path.join(out, `${name}-pointer.png`);
  await page.screenshot({ path: a });
  await page.locator('.cmd[data-unpublished] .copy').click();
  await page.waitForTimeout(120);
  const b = path.join(out, `${name}-copied.png`);
  await page.screenshot({ path: b });
  await ctx.close();
  return [a, b];
}

/** The opening as it plays, in real time, from Playwright's recorder. */
async function clip(name, viewport, ms = 12000) {
  const dir = path.join(out, `${name}-rec`);
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark', recordVideo: { dir, size: viewport } });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(ms);
  await ctx.close();
  const webm = readdirSync(dir).find((f) => f.endsWith('.webm'));
  const mp4 = path.join(out, `${name}-opening.mp4`);
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', mp4]);
  rmSync(dir, { recursive: true, force: true });
  return mp4;
}

/** Less motion: the final state at once, nothing ticking. */
async function reduced(name, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(500);
  const f = path.join(out, `${name}-reduced.png`);
  await page.screenshot({ path: f });
  await ctx.close();
  return f;
}

/** Throttled: a mid phone (4x CPU, a fast 4G-like link). */
async function throttled(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: (12 * 1024 * 1024) / 8, uploadThroughput: (4 * 1024 * 1024) / 8 });
  await page.addInitScript(vitalsInit);
  await page.goto(url);
  await page.waitForTimeout(5000);
  const v = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, longTasks: window.__long, frames: window.__frames }));
  await ctx.close();
  return { lcp: v.lcp, cls: v.cls, longTasks: v.longTasks, frames: frameStats(v.frames) };
}

try {
  report.timeline.desktop = await timeline('desktop-dark', { width: 1440, height: 900 }, 'dark');
  report.timeline.desktopLight = await timeline('desktop-light', { width: 1440, height: 900 }, 'light');
  report.timeline.big = await timeline('big-dark', { width: 1920, height: 1080 }, 'dark');
  report.timeline.phone = await timeline('phone-dark', { width: 390, height: 844 }, 'dark');
  report.ghost = await ghost('desktop', { width: 1440, height: 900 });
  report.pointer = await pointer('desktop', { width: 1440, height: 900 });
  report.reduced = await reduced('desktop', { width: 1440, height: 900 });
  report.vitals.phoneThrottled = await throttled({ width: 390, height: 844 });
  if (!args.includes('--no-clip')) report.clip = await clip('desktop', { width: 1440, height: 900 });
} finally {
  await browser.close();
  server.close();
}
const brief = (t) => t && { lcp: t.lcp, cls: t.cls, longTasks: t.longTasks, frames: t.frames, errors: t.errors };
writeFileSync(path.join(out, 'hero-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ desktop: brief(report.timeline.desktop), light: brief(report.timeline.desktopLight), big: brief(report.timeline.big), phone: brief(report.timeline.phone), ghost: report.ghost?.clearedByGhost, throttled: report.vitals.phoneThrottled, clip: report.clip }, null, 1));
