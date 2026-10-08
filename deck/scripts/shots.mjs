// Capture every slide: final state and a mid-animation frame at 1920x1080, plus phone (flow mode) frames.
// Usage: node scripts/shots.mjs [slideNumbers comma list] [--phone] [--mid=0.45]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { chromium } from './browser.mjs';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots');
fs.mkdirSync(dir, { recursive: true });
const args = process.argv.slice(2);
const only = (args.find((a) => /^[\d,]+$/.test(a)) || '').split(',').filter(Boolean).map(Number);
const phone = args.includes('--phone');
const midArg = args.find((a) => a.startsWith('--mid='));
const MID = midArg ? +midArg.split('=')[1] : 0.45;

const { server, url } = await serve();
const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + '?hold=final#1');
  await page.waitForFunction(() => window.__deckReady && document.fonts.status === 'loaded');
  const total = await page.evaluate(() => window.__deck.total);
  for (let i = 1; i <= total; i++) {
    if (only.length && !only.includes(i)) continue;
    const nn = String(i).padStart(2, '0');
    for (const mode of ['final', 'mid']) {
      await page.goto(url + '?hold=' + (mode === 'final' ? 'final' : '0') + '&n=' + i + mode + '#' + i);
      await page.waitForFunction(() => window.__deckReady);
      await page.evaluate(() => document.fonts.ready);
      if (mode === 'mid') {
        await page.evaluate((m) => { const t = window.__deck.tl(window.__deck.current); if (t) { t.pause(); t.time(t.duration() * m); } }, MID);
      }
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(dir, `${nn}-${mode}.png`) });
    }
  }
  if (phone) {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pp = await pctx.newPage();
    pp.on('pageerror', (e) => errors.push('phone: ' + e));
    await pp.goto(url + '?static');
    await pp.waitForFunction(() => window.__deckReady);
    await pp.evaluate(() => { window.__deck.finalAll(); });
    await pp.waitForTimeout(400);
    const ids = await pp.evaluate(() => window.__deck.slides.map((s) => s.id));
    for (let k = 0; k < ids.length; k++) {
      if (only.length && !only.includes(k + 1)) continue;
      const el = await pp.$('#' + ids[k]);
      await el.screenshot({ path: path.join(dir, `phone-${String(k + 1).padStart(2, '0')}.png`) });
    }
    const sw = await pp.evaluate(() => document.documentElement.scrollWidth);
    console.log('phone scrollWidth', sw);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
