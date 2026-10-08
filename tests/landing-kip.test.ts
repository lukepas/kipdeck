// Kip, the mascot on the landing page (site/landing/src/kip), in a real headless browser, as
// tests/landing.test.ts runs it: the page built once into a temporary folder and served on
// 127.0.0.1, skipped where there is no Chromium.
//
// What it holds him to:
// - on a laptop, a 1280 and a 1920 screen and a phone, a wheel scroll from the top of the page to the
//   bottom (holding through the beats of each pinned section) never puts him over a visible line of
//   text or a link, button, field or .btn, and never makes the page scroll sideways;
// - ?nokip adds nothing to the page and never loads his chunk;
// - with less motion he is a still drawing: his engine draws no frame after he is placed, and
//   every copy of him is still and off the words;
// - he is never left invisible while a moment owns him (a jump to the page's end, the End key, a
//   random jump anywhere), and the numbers staircase ends with him over Sunday's bar;
// - with the CPU slowed four times and the wheel in 250 px steps, he still never covers text or a
//   control, and the corner peek never comes up over a card, a chart or an image;
// - the K key does nothing while a field has focus;
// - everything he adds is aria-hidden and out of the tab order;
// - nothing logs an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
// @ts-expect-error a plain .mjs script with no types
import { buildSite } from '../site/build.mjs';
// @ts-expect-error a plain .mjs script with no types
import { serve } from '../site/serve.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'landing-kip-'));
await buildSite({ env: {}, outDir: dir, card: false });
const { server, url } = await serve(dir, 0);
/** Kip's lazy chunk: the one that makes his layer. */
const chunk = readdirSync(path.join(dir, 'assets')).find((f) => f.endsWith('.js') && readFileSync(path.join(dir, 'assets', f), 'utf8').includes('kip-doc'));

let browser: Browser | undefined;
let why = '';
for (const how of [{}, ...(process.env.CHROMIUM_PATH ? [{ executablePath: process.env.CHROMIUM_PATH }] : []), { channel: 'chrome' as const }]) {
  try {
    browser = await chromium.launch({ headless: true, ...how });
    break;
  } catch (err) {
    why ||= `no headless Chromium here (${(err as Error).message.split('\n')[0]})`;
  }
}
if (browser) why = '';

test.after(async () => {
  await browser?.close();
  server.close();
});

type Opts = { width?: number; height?: number; reduced?: boolean; query?: string };
async function open(t: { after(fn: () => Promise<void>): void }, o: Opts = {}) {
  const phone = (o.width ?? 1440) < 500;
  const context = await browser!.newContext({
    viewport: { width: o.width ?? 1440, height: o.height ?? 900 },
    colorScheme: 'dark',
    reducedMotion: o.reduced ? 'reduce' : 'no-preference',
    hasTouch: phone,
    isMobile: phone,
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors: string[] = [];
  const scripts: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall due to ReadPixels/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
  await page.goto(url + (o.query ?? ''));
  await page.waitForLoadState('load');
  return { page, errors, scripts };
}

/**
 * What Kip covers now: every visible line of text (from the top of its glyphs down), and every link,
 * button, field and .btn, that his box overlaps (by more than a pixel). Plain JavaScript in a string, as tests/landing-a11y.test.ts does.
 */
const COVERED = `(() => {
  const boxes = (window.__kip && window.__kip.box()) || [];
  if (!boxes.length) return [];
  const seen = new Map();
  const visible = (el) => {
    if (seen.has(el)) return seen.get(el);
    let o = 1, ok = getComputedStyle(el).visibility !== 'hidden';
    for (let e = el; ok && e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none') ok = false;
      o *= Number(cs.opacity);
    }
    const v = ok && o >= 0.05;
    seen.set(el, v);
    return v;
  };
  const over = (a, r) => a.l < r.right - 1 && a.r > r.left + 1 && a.t < r.bottom - 1 && a.b > r.top + 1;
  // A line box starts at the font's ascent, above the tallest glyph; that strip is empty space, so a
  // line counts from the top of its glyphs (the ratio is measured once per font and text at 100px).
  const ctx = (window.__inkCtx = window.__inkCtx || document.createElement('canvas').getContext('2d'));
  const inkOf = (el, text) => {
    const cs = getComputedStyle(el);
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' 100px ' + cs.fontFamily;
    const m = ctx.measureText(text);
    const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
    return a > 0 ? Math.max(0, Math.min(0.45, (a - m.actualBoundingBoxAscent) / (a + d))) : 0;
  };
  const out = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !(n.textContent || '').trim() || el.closest('.kip, #kip-doc, #kip-fixed, .kip-stage-host, script, style, noscript, .sr, [hidden], dialog:not([open])')) continue;
    range.selectNodeContents(n);
    let ink = -1;
    for (const r0 of range.getClientRects()) {
      if (r0.width < 1 || r0.height < 1 || r0.bottom < 0 || r0.top > innerHeight) continue;
      if (!boxes.some((b) => over(b, r0))) continue;
      if (ink < 0) ink = inkOf(el, (n.textContent || '').trim());
      const r = { left: r0.left, right: r0.right, bottom: r0.bottom, top: r0.top + r0.height * ink };
      if (boxes.some((b) => over(b, r)) && visible(el)) { out.push('"' + (n.textContent || '').trim().slice(0, 30) + '"'); break; }
    }
  }
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, .btn')) {
    if (el.closest('[hidden], dialog:not([open])')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
    if (boxes.some((b) => over(b, r)) && visible(el)) out.push(el.tagName.toLowerCase() + '.' + el.className);
  }
  return out.map((s) => s + ' (moment ' + (window.__kip.moment || 'none') + ', y ' + Math.round(scrollY) + ')');
})()`;

/**
 * A ghost: a moment owns him and he is not away, yet nothing of him is drawn, held for a second (an
 * entrance fades him in over a few frames). Needs the ?kiptest hook; null when all is well.
 */
const GHOST = `(async () => {
  const k = window.__kip;
  const ghost = () => k && k.state && k.moment && k.state.away === false && !k.state.busy && k.box().length === 0;
  if (!ghost()) return null;
  await new Promise((r) => setTimeout(r, 1000));
  return ghost() ? 'invisible while ' + k.moment + ' owns him (y ' + Math.round(scrollY) + ')' : null;
})()`;

/** Whatever is drawn under the corner peek (#kip-fixed), other than the page's own frame: a card,
 *  a chart, an image or a border. Empty when he is not peeking. */
const UNDER_PEEK = `(() => {
  const k = document.querySelector('#kip-fixed .kip');
  if (!k || Number(getComputedStyle(k).opacity) < 0.05) return [];
  const b = k.getBoundingClientRect();
  const out = [];
  for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) {
    const x = b.left + b.width * fx, y = Math.min(innerHeight - 2, b.top + b.height * fy);
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('.kip, #kip-doc, #kip-fixed, .kip-stage-host')) continue;
      if (['HTML', 'BODY', 'MAIN', 'SECTION'].includes(el.tagName) || el.matches('.wrap, .track, .stage')) continue;
      out.push('peek over ' + el.tagName.toLowerCase() + '.' + el.className + ' (y ' + Math.round(scrollY) + ')');
      break;
    }
  }
  return out;
})()`;

/** The pinned sections' beats (the scenes' own marks), where the scroll holds. */
const BEATS: Record<string, number[]> = {
  funnel: [0.3, 0.45, 0.56, 0.82, 0.98],
  problem: [0.06, 0.2, 0.36, 0.5, 0.6, 0.86, 0.95, 0.99],
  loop: [0.04, 0.14, 0.28, 0.42, 0.6, 0.7, 0.8, 0.9, 1],
};

/** Wheel-scrolls to `y` in notches, then watches him for `hold` ms, collecting what he covers. */
async function scrollTo(page: Page, y: number, hold: number, bad: Set<string>) {
  const cur = await page.evaluate(() => scrollY);
  const d = y - cur;
  const n = Math.max(1, Math.round(Math.abs(d) / 120));
  for (let k = 0; k < n; k++) {
    await page.mouse.wheel(0, d / n);
    await page.waitForTimeout(16);
  }
  for (let k = 0; k < 3; k++) {
    await page.waitForTimeout(hold / 3);
    for (const c of (await page.evaluate(COVERED)) as string[]) bad.add(c);
    const g = (await page.evaluate(GHOST)) as string | null;
    if (g) bad.add(g);
  }
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (wide > 0) bad.add(`the page scrolls sideways by ${wide}px at y ${Math.round(y)}`);
}

async function tour(page: Page, w: number, h: number) {
  const bad = new Set<string>();
  await page.mouse.move(w / 2, h / 2);
  // The opening: Codex asks at 2.4 s and Kip comes up for it.
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(1000);
    for (const c of (await page.evaluate(COVERED)) as string[]) bad.add(c);
  }
  const stops = await page.evaluate((beats) => {
    const total = document.documentElement.scrollHeight - innerHeight;
    const ys = Array.from({ length: 41 }, (_, i) => Math.round((total * i) / 40));
    for (const [id, ps] of Object.entries(beats)) {
      const track = document.querySelector<HTMLElement>(`#${id} .track`);
      if (!track || getComputedStyle(track.firstElementChild!).position !== 'sticky') continue;
      const top = track.getBoundingClientRect().top + scrollY;
      for (const p of ps) ys.push(Math.round(top + p * (track.offsetHeight - innerHeight)));
    }
    return ys.sort((a, b) => a - b);
  }, BEATS);
  for (const y of stops) await scrollTo(page, y, 450, bad);
  return [...bad];
}

for (const [name, size] of [['laptop', { width: 1440, height: 900 }], ['1280 screen', { width: 1280, height: 800 }], ['big screen', { width: 1920, height: 1080 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`scrolling the page on a ${name}, Kip never covers text or a control and the page never scrolls sideways`, { skip: why || false, timeout: 240_000 }, async (t) => {
    const { page, errors } = await open(t, { ...size, query: '?kiptest' });
    const bad = await tour(page, size.width, size.height);
    assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
    // He was there: somewhere along the way a section or a boundary had him.
    assert.ok(await page.evaluate(() => typeof window.__kip?.box === 'function'), 'Kip mounted');
    assert.deepEqual(errors, []);
  });
}

test('?nokip adds nothing and never loads his chunk', { skip: why || false, timeout: 60_000 }, async (t) => {
  assert.ok(chunk, "the build has Kip's chunk");
  const { page, errors, scripts } = await open(t, { query: '?nokip' });
  await page.waitForTimeout(3500);
  assert.equal(await page.locator('.kip, #kip-doc, #kip-fixed, .kip-stage-host').count(), 0);
  assert.equal(scripts.filter((s) => s.includes(chunk!)).length, 0, 'his chunk was not fetched');
  assert.equal(await page.evaluate(() => 'kipMounted' in window || !!window.__kip), false);
  // Without it, the same page loads him.
  const other = await open(t);
  await other.page.waitForTimeout(2500);
  assert.ok(other.scripts.some((s) => s.includes(chunk!)), 'his chunk loads without ?nokip');
  assert.deepEqual(errors, []);
});

test('with less motion he is a still drawing: no frames, still poses, off the words', { skip: why || false, timeout: 90_000 }, async (t) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { page, errors } = await open(t, { ...size, reduced: true });
    await page.waitForFunction(() => !!window.__kip, undefined, { timeout: 5000 });
    const stills = await page.evaluate(() => window.__kip!.stills);
    assert.ok(stills >= 1, 'at least one still Kip');
    assert.equal(await page.locator('#kip-doc .kip').count(), stills);
    assert.equal(await page.locator('#kip-doc .kip.static').count(), stills, 'every copy is still');
    const bad = new Set<string>();
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let i = 0; i <= 30; i++) {
      await page.evaluate((y) => scrollTo(0, y), Math.round((total * i) / 30));
      await page.waitForTimeout(60);
      for (const c of (await page.evaluate(COVERED)) as string[]) bad.add(c);
    }
    assert.deepEqual([...bad], [], `\n${[...bad].join('\n')}`);
    assert.equal(await page.evaluate(() => window.__kip!.ticks), 0, 'his engine drew no frame');
    assert.equal(await page.locator('.kip-stage-host, #kip-fixed').count(), 0);
    assert.equal(await page.locator('.staged').count(), 0, 'nothing staged');
    assert.deepEqual(errors, []);
  }
});

test('jumping to the end, with the End key or anywhere at random, never leaves him invisible', { skip: why || false, timeout: 120_000 }, async (t) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { page, errors } = await open(t, { ...size, query: '?kiptest' });
    await page.waitForFunction(() => !!window.__kip?.state, undefined, { timeout: 8000 });
    // From the teams section, the End key: the footer's moment crosses its dash and its finale in
    // one step, and he must still come in.
    await page.evaluate(() => document.getElementById('teams')!.scrollIntoView());
    await page.waitForTimeout(1200);
    await page.keyboard.press('End');
    await page.waitForTimeout(5000);
    const end = await page.evaluate(() => ({ moment: window.__kip!.moment, n: window.__kip!.box().length }));
    assert.equal(end.moment, 'end', `the footer owns him at ${size.width}`);
    assert.ok(end.n > 0, `he is drawn in the footer at ${size.width}`);
    // Fifteen jumps to fixed spread-out places, each held a second.
    const bad = new Set<string>();
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let i = 0; i < 15; i++) {
      await page.evaluate((y) => scrollTo(0, y), Math.round(total * ((i * 7) % 15) / 15));
      await page.waitForTimeout(1000);
      const g = (await page.evaluate(GHOST)) as string | null;
      if (g) bad.add(g);
    }
    assert.deepEqual([...bad], [], `\n${[...bad].join('\n')}`);
    assert.deepEqual(errors, []);
  }
});

test('the numbers staircase ends with him over Sunday', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t, { query: '?kiptest' });
  await page.waitForFunction(() => !!window.__kip?.state, undefined, { timeout: 8000 });
  await page.evaluate(() => document.getElementById('numbers')!.scrollIntoView());
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const b = window.__kip!.box()[0];
    const sun = document.querySelectorAll('#numbers .cols rect')[6].getBoundingClientRect();
    return { moment: window.__kip!.moment, cx: b ? (b.l + b.r) / 2 : null, sun: sun.left + sun.width / 2 };
  });
  assert.equal(r.moment, 'numbers');
  assert.ok(r.cx !== null && Math.abs(r.cx - r.sun) <= 30, `his centre ${r.cx} is over Sunday's bar ${r.sun}`);
  assert.deepEqual(errors, []);
});

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 2560, height: 1440 }]) {
  test(`with the CPU slowed 4x and the wheel in 250 px steps at ${size.width}, he covers nothing and never peeks over content`, { skip: why || false, timeout: 300_000 }, async (t) => {
    const { page, errors } = await open(t, { ...size, query: '?kiptest' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.waitForTimeout(2500);
    const bad = new Set<string>();
    const check = async () => {
      for (const c of (await page.evaluate(COVERED)) as string[]) bad.add(c);
      for (const c of (await page.evaluate(UNDER_PEEK)) as string[]) bad.add(c);
    };
    const bottom = () => page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
    for (let k = 0; k < 400 && !(await bottom()); k++) {
      await page.mouse.wheel(0, 250);
      await page.waitForTimeout(80);
      if (k % 3 === 2) await check();
      // Now and then the page is left still, so the corner peek and the idle guard get their turn.
      if (k % 12 === 11) {
        await page.waitForTimeout(2200);
        await check();
      }
    }
    // At the footer, held: the letter run, the flag and the guard.
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(1000);
      await check();
    }
    assert.deepEqual([...bad], [], `\n${[...bad].join('\n')}`);
    assert.deepEqual(errors, []);
  });
}

test('the K key does nothing while a field has focus, and a lap otherwise', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t, { query: '?kiptest' });
  // Wait for the opening: Kip up on the inbox, and settled.
  await page.waitForFunction(() => window.__kip?.moment === 'hero' && window.__kip.box().length > 0 && !window.__kip.state?.busy, undefined, { timeout: 12_000 });
  await page.evaluate(() => {
    document.getElementById('waitlist-form')!.hidden = false;
    document.getElementById('email')!.focus({ preventScroll: true });
  });
  const laps = () => page.evaluate(() => window.__kip!.state!.laps as number);
  await page.keyboard.press('k');
  await page.waitForTimeout(250);
  assert.equal(await laps(), 0, 'no lap from a field');
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('k');
  await page.waitForTimeout(250);
  assert.equal(await laps(), 1, 'a lap from the page');
  assert.equal((await page.evaluate(() => window.__kip!.state))!.busy, true, 'the lap is playing');
  const bad = new Set<string>();
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(250);
    for (const c of (await page.evaluate(COVERED)) as string[]) bad.add(c);
  }
  assert.deepEqual([...bad], [], 'the lap stays off the words');
  assert.deepEqual(errors, []);
});

test("a phone's URL bar resizing the window leaves him where he is", { skip: why || false, timeout: 90_000 }, async (t) => {
  const { page, errors } = await open(t, { width: 390, height: 844 });
  await page.mouse.move(195, 400);
  // Down to wherever he settles first, then still.
  let settled: { moment: string | null; x: number } | null = null;
  for (let y = 600; y < 9000 && !settled; y += 300) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(1600);
    settled = await page.evaluate(() => {
      const b = window.__kip!.box()[0];
      return b && window.__kip!.moment ? { moment: window.__kip!.moment, x: Math.round(b.l) } : null;
    });
  }
  assert.ok(settled, 'he settled somewhere on the way down');
  await page.setViewportSize({ width: 390, height: 790 });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ moment: window.__kip!.moment, b: window.__kip!.box()[0] ?? null }));
  assert.equal(after.moment, settled!.moment, 'the same moment or boundary owns him');
  assert.ok(after.b && Math.abs(after.b.l - settled!.x) <= 2, `he stayed put (x ${settled!.x} then ${after.b && Math.round(after.b.l)})`);
  assert.deepEqual(errors, []);
});

test('everything Kip adds is hidden from screen readers and out of the tab order', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t);
  await page.waitForFunction(() => !!document.querySelector('#kip-doc .kip'), undefined, { timeout: 8000 });
  // Visit a pinned section so its stage layer exists too.
  await page.evaluate(() => document.getElementById('loop')!.scrollIntoView());
  await page.waitForTimeout(800);
  const report = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#kip-doc, #kip-fixed, .kip-stage-host, .kip, .kip svg, .kip-fx')];
    return {
      n: nodes.length,
      exposed: nodes.filter((n) => !n.closest('[aria-hidden="true"]')).map((n) => n.className.toString()),
      focusable: [...document.querySelectorAll('#kip-doc *, #kip-fixed *, .kip-stage-host *')].filter((n) => n.matches('a, button, input, [tabindex]:not([tabindex="-1"])')).length,
    };
  });
  assert.ok(report.n > 0);
  assert.deepEqual(report.exposed, []);
  assert.equal(report.focusable, 0);
  assert.deepEqual(errors, []);
});
