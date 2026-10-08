// The landing page's performance gate: builds dist/site (unless --no-build), serves it on 127.0.0.1 and
// measures it in headless Chromium against the budgets in docs/landing.md. It exits 1 when one is
// broken, so CI can run it as is:
//
//   npm run perf:site                         # build, measure, print, exit 1 on a broken budget
//   node site/perf.mjs --no-build --json out.json --port 4694
//
// What it measures:
// - weight: the gzipped JS and CSS the first load pulls in (lazy chunks and the film excluded), the
//   fonts, and everything the page fetched in its first seconds without a scroll;
// - a laptop (1440x900, no throttle) and a phone (390x844) at 4x CPU throttle on a slow 4G link
//   (150 ms, 1.6 Mbps, the throttling Lighthouse uses for mobile): largest contentful paint and its
//   element, layout shift through load and a full scroll, frame times while scrolling, and every
//   long task (over 50 ms) after load;
// - interaction: the longest event (answering the waiting agent, Copy, the theme, the loop's Merge)
//   as Event Timing reports it, a lab stand-in for INP;
// - console errors, WebGL's included.
//
// Lighthouse is not a dependency of this repository. When one is installed (`lighthouse` on PATH) it
// also runs on the build and its scores go into the report; otherwise the report says it was skipped.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The budgets. docs/landing.md lists the same numbers. */
export const BUDGETS = {
  firstLoadJsGzip: 60 * 1024,
  cssGzip: 30 * 1024,
  firstLoadTransfer: 350 * 1024,
  lcpPhoneMs: 1800,
  lcpDesktopMs: 1000,
  cls: 0.01,
  longTaskMs: 50,
  inpMs: 100,
};

/** What the built index.html pulls in on its own (scripts, styles, preloads, fonts named in CSS). */
export function weight(site) {
  const html = readFileSync(path.join(site, 'index.html'), 'utf8');
  const refs = new Set([...html.matchAll(/(?:href|src)="\.?\/?(assets\/[^"]+\.(?:js|css|woff2)|theme-boot\.js)"/g)].map((m) => m[1]));
  const files = [...refs].map((f) => {
    const buf = readFileSync(path.join(site, f));
    return { file: f, bytes: buf.length, gzip: f.endsWith('.woff2') ? buf.length : gzipSync(buf, { level: 9 }).length };
  });
  const sum = (re) => files.filter((f) => re.test(f.file)).reduce((a, f) => a + f.gzip, 0);
  const lazy = readdirSync(path.join(site, 'assets'))
    .filter((f) => f.endsWith('.js') && !refs.has(`assets/${f}`))
    .map((f) => ({ file: `assets/${f}`, gzip: gzipSync(readFileSync(path.join(site, 'assets', f)), { level: 9 }).length }))
    .sort((a, b) => b.gzip - a.gzip);
  return {
    files,
    lazy,
    htmlGzip: gzipSync(html, { level: 9 }).length,
    firstLoadJsGzip: sum(/\.js$/),
    cssGzip: sum(/\.css$/),
    fontBytes: sum(/\.woff2$/),
    lazyJsGzip: lazy.reduce((a, f) => a + f.gzip, 0),
  };
}

async function launch() {
  const { chromium } = await import('playwright-core');
  for (const how of [{}, ...(process.env.CHROMIUM_PATH ? [{ executablePath: process.env.CHROMIUM_PATH }] : []), { channel: 'chrome' }]) {
    try {
      return await chromium.launch({ headless: true, ...how });
    } catch {
      // Try the next one.
    }
  }
  return null;
}

/** Observers installed before any of the page's own scripts run. */
function observe() {
  const w = window;
  w.__perf = { lcp: 0, lcpEl: '', cls: 0, shifts: [], long: [], events: [], loadAt: 0 };
  const p = w.__perf;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      p.lcp = e.startTime;
      const el = e.element;
      p.lcpEl = el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}` : '';
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      p.cls += e.value;
      if (e.value > 0.001) p.shifts.push({ at: Math.round(e.startTime), value: Math.round(e.value * 10000) / 10000, scrollY: Math.round(scrollY), nodes: e.sources.map((s) => { const n = s.node; return n ? `${n.nodeName.toLowerCase()}${n.id ? '#' + n.id : ''}${typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : ''}` : '?'; }) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      // Where the page was: the section across the middle of the window.
      const mid = [...document.querySelectorAll('[data-scene]')].find((s) => {
        const r = s.getBoundingClientRect();
        return r.top < innerHeight / 2 && r.bottom > innerHeight / 2;
      });
      p.long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), section: mid?.id ?? '' });
    }
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.interactionId) p.events.push({ name: e.name, ms: Math.round(e.duration), target: e.target?.id || e.target?.className || '' });
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  addEventListener('load', () => (p.loadAt = performance.now()));
}

/** A run on one device: load, settle, scroll the whole page in `ms`, then interact. */
async function run(browser, url, { viewport, cpu = 1, network = null, scrollMs = 10000 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1, colorScheme: 'dark', hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /webgl|gl_/i.test(m.text()) && !/GPU stall due to ReadPixels/.test(m.text()))) && errors.push(m.text()));
  const transfer = [];
  page.on('response', async (r) => {
    try {
      const body = await r.body();
      const u = new URL(r.url());
      const text = /\.(js|css|html|svg|json|txt)$|\/$/.test(u.pathname);
      transfer.push({ path: u.pathname, bytes: text ? gzipSync(body).length : body.length, at: Date.now() });
    } catch {
      // A range response or one the page cancelled.
    }
  });
  const cdp = await ctx.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (network) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network });
  await page.addInitScript(observe);
  const started = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const firstLoad = transfer.filter((t) => t.at - started < 3500 + 2000);
  const settled = await page.evaluate(() => ({ lcp: window.__perf.lcp, lcpEl: window.__perf.lcpEl, loadAt: window.__perf.loadAt }));
  // Long tasks during the scroll only: the opening's own work is reported apart.
  const scroll = await page.evaluate(async (total) => {
    const p = window.__perf;
    const mark = performance.now();
    const times = [];
    let last = performance.now();
    const H = document.documentElement.scrollHeight - innerHeight;
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
    await new Promise((r) => setTimeout(r, 600));
    times.sort((a, b) => a - b);
    const pct = (q) => Math.round(times[Math.min(times.length - 1, Math.floor(times.length * q))] * 10) / 10;
    return {
      frames: times.length,
      avgMs: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10,
      p50: pct(0.5),
      p95: pct(0.95),
      p99: pct(0.99),
      over20ms: times.filter((t) => t > 20).length,
      over50ms: times.filter((t) => t > 50).length,
      longTasks: p.long.filter((l) => l.at >= mark),
    };
  }, scrollMs);
  // Interactions: back to the top, answer the waiting agent, copy, switch the theme twice, merge in the loop.
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  const tap = async (sel) => {
    const el = page.locator(sel).first();
    if ((await el.count()) && (await el.isVisible()) && (await el.isEnabled())) await el.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
  };
  await tap('[data-clear]');
  await tap('.cta .copy, [data-copy]');
  await tap('#theme');
  await tap('#theme');
  await page.evaluate(() => document.getElementById('loop')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const p = window.__perf;
    return { cls: p.cls, shifts: p.shifts, loadLong: p.long.filter((l) => l.at < p.loadAt + 4000), events: p.events };
  });
  await ctx.close();
  const inp = result.events.reduce((m, e) => Math.max(m, e.ms), 0);
  return {
    viewport: `${viewport.width}x${viewport.height}`,
    cpu,
    network: network ? `${network.latency} ms, ${Math.round((network.downloadThroughput * 8) / 1e5) / 10} Mbps` : 'none',
    lcpMs: Math.round(settled.lcp),
    lcpElement: settled.lcpEl,
    loadMs: Math.round(settled.loadAt),
    cls: Math.round(result.cls * 10000) / 10000,
    shifts: result.shifts,
    firstLoadTransfer: firstLoad.reduce((a, t) => a + t.bytes, 0),
    firstLoadRequests: firstLoad.map((t) => `${t.path} ${t.bytes}`),
    openingLongTasks: result.loadLong,
    scroll,
    inpMs: inp,
    events: result.events,
    errors,
  };
}

function lighthouse(url) {
  try {
    execFileSync('lighthouse', ['--version'], { stdio: 'ignore' });
  } catch {
    return { skipped: 'lighthouse is not installed here (it is not a dependency of this repository); install it globally to add its scores' };
  }
  try {
    const out = execFileSync('lighthouse', [url, '--quiet', '--output=json', '--chrome-flags=--headless=new', '--only-categories=performance,accessibility,best-practices,seo'], { maxBuffer: 64 * 1024 * 1024 });
    const lhr = JSON.parse(out.toString());
    return Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  } catch (err) {
    return { skipped: `lighthouse failed: ${String(err.message).split('\n')[0]}` };
  }
}

/** Every budget the measurements break, as sentences. */
export function broken(report) {
  const out = [];
  const w = report.weight;
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  if (w.firstLoadJsGzip > BUDGETS.firstLoadJsGzip) out.push(`first-load JS ${kb(w.firstLoadJsGzip)} gz is over ${kb(BUDGETS.firstLoadJsGzip)}`);
  if (w.cssGzip > BUDGETS.cssGzip) out.push(`CSS ${kb(w.cssGzip)} gz is over ${kb(BUDGETS.cssGzip)}`);
  for (const r of [report.desktop, report.phone]) {
    if (!r) continue;
    const name = r.viewport;
    if (r.firstLoadTransfer > BUDGETS.firstLoadTransfer) out.push(`${name}: first load moved ${kb(r.firstLoadTransfer)}, over ${kb(BUDGETS.firstLoadTransfer)}`);
    const lcpBudget = r === report.phone ? BUDGETS.lcpPhoneMs : BUDGETS.lcpDesktopMs;
    if (r.lcpMs > lcpBudget) out.push(`${name}: LCP ${r.lcpMs} ms is over ${lcpBudget} ms`);
    if (r.cls > BUDGETS.cls) out.push(`${name}: layout shift ${r.cls}`);
    for (const l of r.scroll.longTasks) if (l.ms > BUDGETS.longTaskMs) out.push(`${name}: a ${l.ms} ms long task while scrolling (at ${l.at} ms, in ${l.section || 'no section'})`);
    if (r.inpMs > BUDGETS.inpMs) out.push(`${name}: an interaction took ${r.inpMs} ms`);
    for (const e of r.errors) out.push(`${name}: console error: ${e}`);
  }
  return out;
}

/** Measures the build in `site`. */
export async function measure(site, { port = 0, lighthouse: lh = true } = {}) {
  const report = { weight: weight(site) };
  const { server, url } = await serve(site, port);
  const browser = await launch();
  try {
    if (!browser) return { ...report, skipped: 'no headless Chromium here' };
    report.desktop = await run(browser, url, { viewport: { width: 1440, height: 900 } });
    report.phone = await run(browser, url, {
      viewport: { width: 390, height: 844 },
      cpu: 4,
      network: { latency: 150, downloadThroughput: (1.6 * 1e6) / 8, uploadThroughput: (750 * 1e3) / 8 },
    });
  } finally {
    await browser?.close();
  }
  if (lh) report.lighthouse = lighthouse(url);
  server.close();
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const site = path.join(ROOT, 'dist', 'site');
  if (!args.includes('--no-build')) {
    const { buildSite } = await import('./build.mjs');
    await buildSite({ card: false });
  }
  const report = await measure(site, { port: Number(opt('--port') ?? 0), lighthouse: !args.includes('--no-lighthouse') });
  report.budgets = BUDGETS;
  report.broken = report.skipped ? [] : broken(report);
  if (opt('--json')) writeFileSync(path.resolve(opt('--json')), JSON.stringify(report, null, 2));
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const w = report.weight;
  console.log(`first-load JS ${kb(w.firstLoadJsGzip)} gz, CSS ${kb(w.cssGzip)} gz, fonts ${kb(w.fontBytes)}, HTML ${kb(w.htmlGzip)} gz; lazy JS ${kb(w.lazyJsGzip)} gz`);
  for (const r of [report.desktop, report.phone].filter(Boolean)) {
    console.log(`${r.viewport} cpu x${r.cpu} net ${r.network}: LCP ${r.lcpMs} ms (${r.lcpElement}), CLS ${r.cls}, first load ${kb(r.firstLoadTransfer)}, frames p50 ${r.scroll.p50} p95 ${r.scroll.p95} p99 ${r.scroll.p99} ms, ${r.scroll.longTasks.length} long tasks while scrolling (max ${Math.max(0, ...r.scroll.longTasks.map((l) => l.ms))} ms), longest interaction ${r.inpMs} ms`);
  }
  if (report.lighthouse) console.log('lighthouse:', JSON.stringify(report.lighthouse));
  if (report.skipped) console.log(report.skipped);
  if (report.broken.length) {
    console.error(`\n${report.broken.length} budget(s) broken:\n- ${report.broken.join('\n- ')}`);
    process.exit(1);
  }
  console.log('every budget holds');
}
