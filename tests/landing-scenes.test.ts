// The landing page's scenes (site/landing/src/scenes) in a real headless browser, as tests/landing.test.ts
// runs it: the page built once into a temporary folder and served on 127.0.0.1, skipped where there
// is no Chromium.
//
// What it holds the scenes to: a scroll through the whole page, on a laptop and on a phone, throws
// nothing, never scrolls sideways and shifts nothing; the loop's answer clears the visitor's own
// wait and its merge is a real button that stamps the change merged; Proof of Merge releases only
// on a merge (once by itself when in view, then on the replay button) and keeps every value marked
// testnet; the footer tells the truth about the wait; and
// with less motion no scene stages anything, so every section is its final HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
// @ts-expect-error a plain .mjs script with no types
import { buildSite } from '../site/build.mjs';
// @ts-expect-error a plain .mjs script with no types
import { serve } from '../site/serve.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'landing-scenes-'));
await buildSite({ env: {}, outDir: dir, card: false });
const { server, url } = await serve(dir, 0);

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

async function open(t: { after(fn: () => Promise<void>): void }, options: { width?: number; height?: number; reduced?: boolean } = {}) {
  const context = await browser!.newContext({
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    colorScheme: 'dark',
    reducedMotion: options.reduced ? 'reduce' : 'no-preference',
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors: string[] = [];
  // Errors and warnings both count, except the GPU driver's note that a frame was read back
  // ("GPU stall due to ReadPixels"), which headless Chromium's software GL prints on its own.
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall due to ReadPixels/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const w = window as unknown as { cls: number; wide: number };
    w.cls = 0;
    w.wide = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url);
  await page.waitForLoadState('load');
  // Skip the hero's opening: Codex asks at once.
  await page.keyboard.press('Shift');
  return { page, errors };
}

/** Scrolls top to bottom a frame at a time, noting the widest the page ever got. */
async function scrollThrough(page: Page, step = 60) {
  await page.evaluate(async (s) => {
    const w = window as unknown as { wide: number };
    const H = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y <= H + s; y += s) {
      scrollTo(0, Math.min(y, H));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      w.wide = Math.max(w.wide, document.documentElement.scrollWidth - document.documentElement.clientWidth);
    }
  }, step);
}

/** Scrolls the loop's pinned track to progress p (0 to 1). */
async function loopAt(page: Page, p: number) {
  await page.evaluate((pp) => {
    const t = document.querySelector<HTMLElement>('#loop .track')!;
    const top = t.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + pp * (t.offsetHeight - innerHeight));
  }, p);
  await page.waitForTimeout(700);
}

for (const [name, size] of [['a laptop', { width: 1440, height: 900 }], ['a phone', { width: 390, height: 844 }]] as const) {
  test(`on ${name}, a scroll through every scene throws nothing, never scrolls sideways and shifts nothing`, { skip: why || false, timeout: 120_000 }, async (t) => {
    const { page, errors } = await open(t, size);
    await scrollThrough(page, size.width < 500 ? 50 : 70);
    await page.waitForTimeout(400);
    const { cls, wide } = await page.evaluate(() => {
      const w = window as unknown as { cls: number; wide: number };
      return { cls: w.cls, wide: w.wide };
    });
    assert.equal(wide, 0, 'the page never got wider than the window');
    assert.ok(cls < 0.005, `cumulative layout shift ${cls}`);
    const staged = await page.evaluate(() => [...document.querySelectorAll('[data-scene]')].filter((s) => s.querySelector('.staged') || s.classList.contains('staged')).map((s) => s.id));
    for (const id of ['funnel', 'problem', 'loop', 'why', 'phone', 'numbers', 'labs', 'proof', 'teams']) assert.ok(staged.includes(id), `the ${id} scene ran`);
    assert.deepEqual(errors, []);
  });
}

test('the loop: answering clears the visitor\'s own wait, and Merge is a button that stamps the change merged', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '1', 'Codex waits on the visitor');
  await loopAt(page, 0.3);
  assert.equal(await page.locator('#loop .scrub').isVisible(), true, 'the beat scrubber shows where the loop pins');
  assert.match((await page.locator('#loop .qk-who').textContent()) ?? '', /asks/);
  await loopAt(page, 0.47);
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '0', 'the answer cleared the wait along the top');
  assert.equal(await page.locator('#loop .cc-row').getAttribute('class').then((c) => /\breview\b/.test(c ?? '')), true);
  await loopAt(page, 0.8);
  assert.equal(await page.locator('#loop').getAttribute('class').then((c) => /is-merged/.test(c ?? '')), false);
  const merge = page.getByRole('button', { name: 'Merge', exact: true });
  await merge.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  assert.match((await page.locator('#loop').getAttribute('class')) ?? '', /is-merged/);
  assert.equal(await page.locator('#loop .stamp.landed').count(), 1);
  assert.equal(await page.locator('#loop [data-shipped]').evaluate((el) => el.textContent?.replace(/\s/g, '')), '3');
  assert.deepEqual(errors, []);
});

test('section 06 looks finished within a second of coming into view, and its terminal reads whole to a screen reader', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t);
  // Before the terminal runs, every line is already in the accessibility tree.
  const tree = await page.locator('#from-source').ariaSnapshot();
  assert.match(tree, /npm install/);
  assert.match(tree, /ready\s+https:\/\/localhost:4600/);
  await page.evaluate(() => document.querySelector('#yours .measured')!.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  const figures = await page.locator('#yours .measured b').allTextContents();
  assert.deepEqual(figures, ['3.4', '10.7', '4']);
  const contrast = await page.locator('#yours .measured li').first().evaluate((li) => getComputedStyle(li).opacity);
  assert.equal(contrast, '1', 'the numbers are never greyed out waiting');
  await page.evaluate(() => document.querySelector('#yours .ledger')!.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#yours .ledger li.printed').count(), 3);
  assert.equal(await page.locator('#yours [data-merged]').evaluate((el) => el.textContent?.replace(/\s/g, '')), '3');
  assert.equal(await page.locator('#yours .term-body .tl:not(.on)').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length), 0, 'the terminal has finished');
  assert.deepEqual(errors, []);
});

test('Proof of Merge releases the test USDC on a merge, once by itself in view, and replays; every value says testnet', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t);
  assert.equal(await page.locator('#proof .receipt > div.on').count(), 0, 'nothing settles before the merge');
  await page.evaluate(() => document.querySelector('#proof .proof-grid')!.scrollIntoView({ block: 'center' }));
  await page.locator('#proof .receipt .settled.on').waitFor({ timeout: 6000 });
  assert.equal(await page.locator('#proof .receipt > div.on').count(), 4);
  await page.waitForFunction(() => document.querySelector('[data-amount]')!.textContent === '5.00');
  const replay = page.getByRole('button', { name: 'Replay the merge' });
  await replay.click();
  assert.equal(await page.locator('#proof .receipt > div.on').count(), 0, 'the replay holds the pay again first');
  await page.locator('#proof .receipt .settled.on').waitFor({ timeout: 4000 });
  const proof = await page.locator('#proof').innerText();
  assert.match(proof, /Testnet only/i);
  assert.match(proof, /test USDC/);
  assert.deepEqual(errors, []);
});

test('the footer tells the truth about the wait, and answering there clears it', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t);
  await page.evaluate(() => document.getElementById('end')!.scrollIntoView());
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#end-h').textContent(), 'Codex is waiting on you.');
  await page.locator('.calm-answer').click();
  assert.equal(await page.locator('#end-h').textContent(), 'Nothing waits on you.');
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '0');
  assert.deepEqual(errors, []);
});

test('with less motion no scene stages anything: every section is its final HTML', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t, { reduced: true });
  await scrollThrough(page, 200);
  assert.equal(await page.locator('.staged').count(), 0);
  assert.equal(await page.locator('.track[data-mode]').count(), 0);
  const tall = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.track')].filter((t) => t.offsetHeight > innerHeight * 1.6 && getComputedStyle(t.firstElementChild!).position === 'sticky').length);
  assert.equal(tall, 0, 'nothing pins');
  assert.equal(await page.locator('#loop .stamp').evaluate((el) => getComputedStyle(el).opacity), '1', 'the change shows as merged');
  assert.deepEqual(errors, []);
});
