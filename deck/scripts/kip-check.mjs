// Checks that Kip never covers slide text, that he appears only on the slides with a moment (s1, s14, s15,
// plus the s6 merge, cued by the demo video), and that he stays out of print, phone and reduced-motion modes.
// Usage: node scripts/kip-check.mjs [--shots=<dir>]   (exit code 1 on any failure)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { chromium } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const shots = shotsArg ? shotsArg.split('=')[1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const SAMPLES = 24;
const fails = [];
const errors = [];
const fail = (m) => { fails.push(m); console.log('FAIL ' + m); };

/* Visible text rects of the active slide, in stage pixels. */
const textRects = () => {
  const s = window.__deck.slides[window.__deck.current];
  const st = document.getElementById('stage').getBoundingClientRect();
  const k = st.width / 1920;
  const out = [];
  const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('.notes, .kip-sticker, .wow-confetti')) continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let o = el, op = 1;
    while (o && o !== s) { op *= +getComputedStyle(o).opacity; o = o.parentElement; }
    if (op < 0.05) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const q of r.getClientRects()) if (q.width > 0.5 && q.height > 0.5) out.push({ x: (q.left - st.left) / k, y: (q.top - st.top) / k, w: q.width / k, h: q.height / k, t: n.nodeValue.trim().slice(0, 30) });
  }
  return out;
};
const overlaps = ([boxes, rects]) => {
  const hits = [];
  for (const b of boxes) for (const r of rects) {
    const ix = Math.min(b.x + b.w, r.x + r.w) - Math.max(b.x, r.x);
    const iy = Math.min(b.y + b.h, r.y + r.h) - Math.max(b.y, r.y);
    if (ix > 1 && iy > 1) hits.push(r.t);
  }
  return hits;
};

const { server, url } = await serve();
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + '?hold=final#1');
  await page.waitForFunction(() => window.__deckReady);
  const total = await page.evaluate(() => window.__deck.total);

  const withKip = [];
  for (let i = 1; i <= total; i++) {
    // 1. Final frame: home spot, or off stage on a slide without a moment.
    await page.goto(url + '?hold=final&n=' + i + '#' + i);
    await page.waitForFunction(() => window.__deckReady && document.fonts.status === 'loaded');
    await page.waitForTimeout(150);
    const has = await page.evaluate((i) => window.__wow.has(i - 1), i);
    let res = await page.evaluate((fn) => { const tr = eval(fn); return [window.__wow.box(), tr()]; }, '(' + textRects.toString() + ')');
    if (!has) {
      if (res[0].length) fail(`s${i} final: Kip is on stage, but this slide has no moment`);
      else console.log(`ok s${i} (no Kip)`);
      continue;
    }
    withKip.push(i);
    let hit = overlaps(res);
    if (!res[0].length) fail(`s${i} final: Kip not on stage`);
    if (hit.length) fail(`s${i} final: Kip covers text: ${[...new Set(hit)].join(' | ')}`);
    // 2. The moment itself, sampled while it plays, with the slide's own timeline at the same time.
    const worst = await page.evaluate(async ([i, N, fn]) => {
      const tr = eval(fn);
      const k = window.__wow.build(i - 1);
      const dur = Math.max(k.duration(), window.__deck.tl(i - 1) ? window.__deck.tl(i - 1).duration() : 0);
      const bad = [];
      for (let n = 0; n <= N; n++) {
        const t = dur * n / N;
        window.__deck.seek(i - 1, t);
        k.time(Math.min(t, k.duration()));
        const boxes = window.__wow.box(), rects = tr();
        for (const b of boxes) for (const r of rects) {
          const ix = Math.min(b.x + b.w, r.x + r.w) - Math.max(b.x, r.x);
          const iy = Math.min(b.y + b.h, r.y + r.h) - Math.max(b.y, r.y);
          if (ix > 1 && iy > 1) bad.push(t.toFixed(2) + 's ' + r.t);
        }
      }
      return [...new Set(bad)];
    }, [i, SAMPLES, '(' + textRects.toString() + ')']);
    if (worst.length) fail(`s${i} moment: Kip covers text: ${worst.slice(0, 6).join(' | ')}`);
    else console.log(`ok s${i}`);
  }
  if (withKip.join() !== '1,14,15') fail('Kip moments on slides ' + withKip.join(', ') + ', expected 1, 14, 15');

  // 2b. s6: off stage while the demo plays, then the merge beat brings him in, clear of the text, and he leaves.
  {
    const mctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const mp = await mctx.newPage();
    mp.on('pageerror', (e) => errors.push('s6: ' + e));
    await mp.goto(url + '#6');
    await mp.waitForFunction(() => window.__deckReady);
    await mp.waitForTimeout(900);
    const before = await mp.evaluate(() => window.__wow.box().length);
    if (before) fail('s6: Kip on stage before the merge beat');
    // Headless Chromium may not decode the H.264 demo, so drive the cue the way the video would.
    const at = await mp.evaluate(() => {
      const s = document.getElementById('s6'), v = s.querySelector('video'), t = +s.querySelector('[data-beat="ship"]').dataset.t;
      let now = t - 0.5;
      Object.defineProperty(v, 'currentTime', { configurable: true, get: () => now, set: () => {} });
      v.dispatchEvent(new Event('timeupdate'));
      now = t + 0.1;
      v.dispatchEvent(new Event('timeupdate'));
      return t;
    });
    await mp.waitForTimeout(1000);
    const mid = await mp.evaluate((fn) => { const tr = eval(fn); return [window.__wow.box(), tr()]; }, '(' + textRects.toString() + ')');
    if (!mid[0].length) fail('s6: Kip did not arrive at the merge beat (' + at + ' s)');
    const hit6 = overlaps(mid);
    if (hit6.length) fail('s6 merge: Kip covers text: ' + [...new Set(hit6)].join(' | '));
    if (shots) await mp.screenshot({ path: path.join(shots, 'kip-s6-merge.png') });
    await mp.waitForTimeout(3400);
    if (await mp.evaluate(() => window.__wow.box().length)) fail('s6: Kip did not leave after the merge');
    if (!fails.some((f) => f.startsWith('s6'))) console.log('ok s6 merge moment');
    await mctx.close();
  }

  if (shots) {
    for (const [i, mids] of [[1, [2.5, 3.2]], [14, [2.0, 3.7]]]) {
      await page.goto(url + '?hold=0&n=s' + i + '#' + i);
      await page.waitForFunction(() => window.__deckReady);
      await page.evaluate((i) => { window.__k = window.__wow.build(i - 1); }, i);
      for (const t of mids) {
        await page.evaluate(([i, t]) => { window.__deck.seek(i - 1, t); window.__k.time(t); }, [i, t]);
        await page.waitForTimeout(100);
        await page.screenshot({ path: path.join(shots, `kip-s${i}-mid-${t}.png`) });
      }
      await page.goto(url + '?hold=final&n=f' + i + '#' + i);
      await page.waitForFunction(() => window.__deckReady);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(shots, `kip-s${i}-final.png`) });
    }
  }

  // 3. Print: no layer, two stickers; the PDF still has one page per slide.
  await page.goto(url + '?print#1');
  await page.waitForFunction(() => window.__deckReady);
  const pr = await page.evaluate(() => {
    const l = document.getElementById('kip-layer');
    const st = [...document.querySelectorAll('.kip-sticker')].filter((e) => e.offsetWidth > 0).length;
    return { layer: l ? getComputedStyle(l).display : 'none', stickers: st };
  });
  if (pr.layer !== 'none') fail('print: Kip layer is visible');
  if (pr.stickers !== 2) fail('print: expected 2 stickers, got ' + pr.stickers);
  // Into the temp dir, so a check never rewrites the tracked out/deck.pdf.
  const tmpPdf = path.join(os.tmpdir(), 'kip-check-' + process.pid + '.pdf');
  // Its own server: with PORT pinned, the next port up (this check still holds PORT).
  execFileSync('node', [path.join(here, 'pdf.mjs'), '--out=' + tmpPdf], { stdio: 'pipe', env: { ...process.env, PORT: process.env.PORT ? String(+process.env.PORT + 1) : '' } });
  const pdf = fs.readFileSync(tmpPdf, 'latin1');
  fs.rmSync(tmpPdf, { force: true });
  const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pages !== total) fail(`pdf: ${pages} pages, expected ${total}`); else console.log('ok pdf ' + pages + ' pages');

  // 4. Phone: no horizontal scroll, no running Kip.
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  pp.on('pageerror', (e) => errors.push('phone: ' + e));
  await pp.goto(url + '?static');
  await pp.waitForFunction(() => window.__deckReady);
  const ph = await pp.evaluate(() => ({ sw: document.documentElement.scrollWidth, layer: !!document.querySelector('#kip-layer:not([style*="none"])') && getComputedStyle(document.getElementById('kip-layer')).display !== 'none', stickers: [...document.querySelectorAll('.kip-sticker')].filter((e) => e.offsetWidth > 0).length }));
  if (ph.sw !== 390) fail('phone: scrollWidth ' + ph.sw);
  if (ph.layer) fail('phone: Kip layer is visible');
  if (ph.stickers !== 2) fail('phone: expected 2 stickers, got ' + ph.stickers);
  if (!fails.some((f) => f.startsWith('phone'))) console.log('ok phone');

  // 5. Reduced motion: Kip holds still poses.
  const rctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  rp.on('pageerror', (e) => errors.push('reduced: ' + e));
  await rp.goto(url + '#1');
  await rp.waitForFunction(() => window.__deckReady);
  for (let n = 0; n < 4; n++) {
    await rp.keyboard.press('ArrowRight');
    await rp.waitForTimeout(100);
    const tw = await rp.evaluate(() => window.gsap.globalTimeline.getChildren(true, true, true).filter((t) => t.targets && t.targets().some((el) => el && el.closest && el.closest('.kip')) && t.isActive()).length);
    if (tw) fail(`reduced: ${tw} Kip tweens running on slide ${n + 2}`);
  }
  if (!fails.some((f) => f.startsWith('reduced'))) console.log('ok reduced motion');

  // 6. Keyboard and clicks: 14 x ArrowRight reaches the last slide; Kip and K never change slide.
  const kctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const kp = await kctx.newPage();
  kp.on('pageerror', (e) => errors.push('keys: ' + e));
  kp.on('console', (m) => { if (m.type() === 'error') errors.push('keys: ' + m.text()); });
  await kp.goto(url + '#1');
  await kp.waitForFunction(() => window.__deckReady);
  await kp.waitForTimeout(5200);
  // His hit area is what is drawn, so click his vest, not the middle of his box.
  const bb = await kp.evaluate(() => { const r = window.Kip.parts.torso.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await kp.mouse.click(bb.x, bb.y);
  await kp.waitForTimeout(200);
  await kp.keyboard.press('k');
  await kp.waitForTimeout(300);
  if (await kp.evaluate(() => window.__deck.current) !== 0) fail('keys: clicking Kip or pressing K changed slide');
  for (let n = 0; n < total - 1; n++) { await kp.keyboard.press('ArrowRight'); await kp.waitForTimeout(160); }
  const last = await kp.evaluate(() => window.__deck.current);
  if (last !== total - 1) fail('keys: ArrowRight x' + (total - 1) + ' ended on slide ' + (last + 1));
  for (let n = 0; n < 3; n++) { await kp.keyboard.press('ArrowLeft'); await kp.waitForTimeout(160); }
  if (await kp.evaluate(() => window.__deck.current) !== total - 4) fail('keys: ArrowLeft did not go back');
  if (!fails.some((f) => f.startsWith('keys'))) console.log('ok keys');
} finally {
  await browser.close();
  server.close();
}
if (errors.length) fail('page errors:\n' + errors.join('\n'));
console.log(fails.length ? `\n${fails.length} problem(s)` : '\nall Kip checks passed');
process.exit(fails.length ? 1 : 0);
