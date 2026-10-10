// The landing page's accessibility, performance and fallbacks in a real headless browser, as
// tests/landing.test.ts runs it (built once into a temporary folder, served on 127.0.0.1, skipped
// where there is no Chromium).
//
// What it holds the page to:
// - every piece of text meets WCAG AA contrast against what is behind it, in both themes;
// - drawings (canvases, decorative SVG) are hidden from screen readers, every control has a name,
//   and every focusable thing shows a visible focus ring;
// - Copy, Try the demo, Watch, the loop's Merge, the Labs flags and the design-partner link all
//   work from the keyboard alone;
// - the film has English captions;
// - the head says what the page is to search engines and link previews (description, Open Graph,
//   Twitter, structured data for free open source software with no ratings), and a build that
//   knows its address gets a canonical link, a sitemap and absolute share-card addresses;
// - without WebGL the merge's ring and the Labs deck fall back without an error, and with it
//   nothing WebGL logs an error or warning;
// - the performance budgets in site/perf.mjs (first-load weight, LCP, layout shift, long tasks
//   while scrolling at 4x CPU, the longest interaction).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
// @ts-expect-error a plain .mjs script with no types
import { buildSite } from '../site/build.mjs';
// @ts-expect-error a plain .mjs script with no types
import { serve } from '../site/serve.mjs';
// @ts-expect-error a plain .mjs script with no types
import { measure, broken } from '../site/perf.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'landing-a11y-'));
// Built as the page will be once the source is public: the clone command and the terminal are on it.
await buildSite({ env: {}, outDir: dir, card: false });
const { server, url } = await serve(dir, 0);
const html = readFileSync(path.join(dir, 'index.html'), 'utf8');

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

type Opts = { width?: number; height?: number; scheme?: 'dark' | 'light'; reduced?: boolean; noWebGL?: boolean };
async function open(t: { after(fn: () => Promise<void>): void }, o: Opts = {}) {
  const context = await browser!.newContext({
    viewport: { width: o.width ?? 1440, height: o.height ?? 900 },
    colorScheme: o.scheme ?? 'dark',
    reducedMotion: o.reduced ? 'reduce' : 'no-preference',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall due to ReadPixels/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  if (o.noWebGL) {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (/webgl/i.test(kind)) return null;
        return (get as (...a: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
      // No WebGL anywhere: the worker's OffscreenCanvas would have it, so take that away too.
      delete (HTMLCanvasElement.prototype as { transferControlToOffscreen?: unknown }).transferControlToOffscreen;
    });
  }
  await page.goto(url);
  await page.waitForLoadState('load');
  return { page, errors };
}

/**
 * Every visible text run that fails AA contrast against the color behind it. Plain JavaScript in a
 * string: the test runner's transpiler would add helpers to a typed function that the page lacks.
 */
const LOW_CONTRAST = `(
() => {
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgba = (css) => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#000';
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
    /** The solid color behind an element, compositing translucent layers; null when it is an image. */
    const behind = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== 'none' && !/^linear-gradient\\(\\s*rgba?\\(0, 0, 0, 0\\)/.test(cs.backgroundImage)) return null;
        const c = rgba(cs.backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 0.999) break;
      }
      let base = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3);
      for (const l of layers.reverse()) base = over(l, base);
      return base;
    };
    const bad = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent ?? '').trim()) continue;
      seen.add(el);
      if (el.closest('[aria-hidden="true"], .sr, dialog:not([open]), [hidden], script, style, noscript, svg, .skip')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      let opacity = 1;
      for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      if (opacity < 0.05) continue;
      const bg = behind(el);
      if (!bg) continue;
      const fgRaw = rgba(cs.color);
      const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacity], bg);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need) bad.push(\`\${ratio.toFixed(2)} < \${need}: <\${el.tagName.toLowerCase()} class="\${el.className}"> "\${(n.textContent ?? '').trim().slice(0, 40)}"\`);
    }
    return bad;
  }
)()`;
function lowContrast(page: Page): Promise<string[]> {
  return page.evaluate(LOW_CONTRAST);
}

for (const scheme of ['dark', 'light'] as const) {
  for (const [name, size] of [['laptop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
    test(`AA contrast for every piece of text, ${scheme} theme, on a ${name}`, { skip: why || false, timeout: 60_000 }, async (t) => {
      // Less motion shows every section at its final state, so every word is on the page at once.
      const { page } = await open(t, { ...size, scheme, reduced: true });
      await page.waitForTimeout(300);
      const bad = await lowContrast(page);
      assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
    });
  }
}

test('drawings are hidden from screen readers, every control has a name, and focus is always visible', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page } = await open(t, { reduced: true });
  const report = await page.evaluate(() => {
    const unnamed: string[] = [];
    const exposed: string[] = [];
    document.querySelectorAll('canvas').forEach((c) => c.closest('[aria-hidden="true"]') || exposed.push(`canvas.${c.className}`));
    document.querySelectorAll('svg').forEach((s) => {
      if (s.closest('[aria-hidden="true"]') || s.getAttribute('role') === 'img') return;
      exposed.push(`svg.${s.getAttribute('class') ?? ''}`);
    });
    document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]').forEach((el) => {
      const name = (el.getAttribute('aria-label') ?? '').trim() || (el.textContent ?? '').trim() || (el.getAttribute('aria-labelledby') ? 'x' : '') || (el as HTMLInputElement).labels?.[0]?.textContent?.trim() || (el.getAttribute('title') ?? '').trim();
      if (!name && !el.closest('[hidden], dialog:not([open])')) unnamed.push(el.outerHTML.slice(0, 90));
    });
    return { unnamed, exposed };
  });
  assert.deepEqual(report.exposed, [], 'canvases and SVG drawings are aria-hidden (or role="img" with a name)');
  assert.deepEqual(report.unnamed, [], 'every link, button and field has an accessible name');
  // Tab through the whole page: every stop shows a ring (an outline or a box shadow) and is on screen.
  const stops: string[] = [];
  const invisible: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    // A stop that slides into view (the skip link) gets a moment to arrive.
    await page.waitForFunction(() => {
      const r = document.activeElement?.getBoundingClientRect();
      return !r || (r.bottom > 0 && r.top < innerHeight);
    }, undefined, { timeout: 600 }).catch(() => undefined);
    const s = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
      const r = el.getBoundingClientRect();
      // Focus has come back round to an element it already visited: the whole page has been walked.
      const again = el.hasAttribute('data-tab-seen');
      el.setAttribute('data-tab-seen', '');
      return { id: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}`.slice(0, 80), ring, onScreen: r.bottom > 0 && r.top < innerHeight && r.width > 0, again };
    });
    if (!s) break;
    if (s.again) break;
    stops.push(s.id);
    if (!s.ring || !s.onScreen) invisible.push(`${s.id} ring=${s.ring} onScreen=${s.onScreen}`);
  }
  assert.ok(stops.length >= 15, `the page has its controls in the tab order (${stops.length})`);
  assert.deepEqual(invisible, [], 'every focus stop shows a visible ring, on screen');
  assert.match(stops[0], /skip/, 'the first stop skips to the page');
});

test('Copy, Try the demo, Watch, Merge, the Labs flags and the design-partner link all work from the keyboard alone', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors } = await open(t);
  await page.keyboard.press('Shift'); // play the opening to its end
  // Copy: Enter on the button copies the command and says so to a screen reader.
  await page.locator('#try-demo .cmd[data-unpublished] .copy').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Copied|Select it/.test(document.querySelector('#try-demo .cmd[data-unpublished] .copy')!.textContent ?? ''));
  await page.waitForFunction(() => (document.getElementById('announce')?.textContent ?? '').length > 0);
  // Try the demo: Enter copies the demo command and moves focus to its Copy.
  await page.locator('[data-link="demo"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#try-demo') !== null), true);
  await page.waitForFunction(() => /Copied|Select it/.test(document.querySelector('#try-demo .copy')!.textContent ?? ''));
  // Watch: Enter opens the film, focus lands on Close, Esc closes it and focus comes back.
  await page.locator('.cta [data-watch]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('dialog#watch').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-close]')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog#watch').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('.cta [data-watch]')), true);
  // Merge in the loop: Space on the button merges.
  await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('#loop .track')!;
    scrollTo(0, t.getBoundingClientRect().top + scrollY + 0.86 * (t.offsetHeight - innerHeight));
  });
  await page.waitForTimeout(900);
  await page.locator('#loop .merge-btn').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('loop')!.classList.contains('is-merged'));
  // A Labs flag: Space switches its lab off, and again on.
  const flag = page.locator('.flag[data-lab="voice"]');
  await page.evaluate(() => document.querySelector('.labs-cmd')!.scrollIntoView({ block: 'center' }));
  // The Labs scene has mounted (its bento is staged) and has switched the flags on in turn.
  await page.waitForFunction(() => document.querySelector('.bento.staged') !== null && document.querySelector('.flag[data-lab="meetings"]')!.getAttribute('aria-pressed') === 'true', undefined, { timeout: 6000 });
  await flag.focus();
  await page.keyboard.press('Space');
  assert.equal(await flag.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.tile[data-lab="voice"]').evaluate((el) => el.classList.contains('on')), false);
  await page.keyboard.press('Space');
  assert.equal(await flag.getAttribute('aria-pressed'), 'true');
  // The design-partner link is a real link, reached by the keyboard.
  await page.locator('.apply-link').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.matches('a.apply-link[href^="mailto:"]')), true);
  assert.deepEqual(errors, []);
});

test('the film has English captions, and its poster is fetched only when it is opened', { skip: why || false }, async (t) => {
  assert.match(html, /<track kind="captions" srclang="en" label="English" src="media\/film-captions-v2\.vtt" default>/);
  const vtt = readFileSync(path.join(dir, 'media', 'film-captions-v2.vtt'), 'utf8');
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /Paid only when a human merges\./);
  assert.match(vtt, /test funds only/);
  // The film names Kipdeck on screen, so the captions do too, and none of the old names or the old slogan.
  assert.match(vtt, /^Kipdeck\.$/m);
  assert.match(vtt, /The inbox for your AI coding agents\./);
  assert.match(vtt, /github\.com\/zbagdzevicius\/kipdeck/);
  assert.doesNotMatch(vtt, /UGC Army|Mergeline|army of|test USDC/i);
  const { page } = await open(t);
  const posters: string[] = [];
  page.on('request', (r) => /poster/.test(r.url()) && posters.push(r.url()));
  await page.waitForTimeout(1500);
  assert.deepEqual(posters, [], 'no poster on the first load');
  await page.locator('.cta [data-watch]').click();
  await page.waitForTimeout(400);
  assert.ok(posters.length >= 1, 'opening the film fetches its poster');
});

test('the head: description, Open Graph, Twitter and structured data; canonical, robots and sitemap once the address is known', { skip: why || false }, async () => {
  for (const tag of ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'property="og:image:alt"', 'name="twitter:card" content="summary_large_image"', 'name="twitter:image"']) {
    assert.ok(html.includes(tag), tag);
  }
  const ld = JSON.parse(/<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html)![1]);
  assert.equal(ld['@type'], 'SoftwareApplication');
  assert.equal(ld.name, 'Kipdeck');
  assert.equal(ld.isAccessibleForFree, true);
  assert.equal(ld.offers.price, '0');
  assert.equal(ld.aggregateRating, undefined, 'no ratings: there are none');
  assert.equal(ld.review, undefined);
  assert.doesNotMatch(html, /rel="canonical"/, 'no canonical without a known address');
  assert.ok(existsSync(path.join(dir, 'robots.txt')));
  assert.ok(!existsSync(path.join(dir, 'sitemap.xml')));
  const placed = mkdtempSync(path.join(tmpdir(), 'landing-seo-'));
  await buildSite({ env: { KIPDECK_SITE_URL: 'https://kipdeck.example/' }, outDir: placed, card: false });
  const page = readFileSync(path.join(placed, 'index.html'), 'utf8');
  assert.match(page, /<link rel="canonical" href="https:\/\/kipdeck\.example\/">/);
  assert.match(page, /<meta property="og:url" content="https:\/\/kipdeck\.example\/">/);
  assert.match(page, /<meta property="og:image" content="https:\/\/kipdeck\.example\/og\.png">/);
  assert.match(page, /"image":"https:\/\/kipdeck\.example\/og\.png","url":"https:\/\/kipdeck\.example\/"/);
  assert.match(readFileSync(path.join(placed, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/kipdeck\.example\/sitemap\.xml/);
  assert.match(readFileSync(path.join(placed, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/kipdeck\.example\/<\/loc>/);
  await assert.rejects(buildSite({ env: { KIPDECK_SITE_URL: 'http://kipdeck.example/' }, outDir: placed, card: false }), /must be https/);
});

/** Scrolls top to bottom, merging in the loop on the way. */
async function scrollAndMerge(page: Page) {
  await page.keyboard.press('Shift');
  await page.evaluate(async () => {
    const H = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y <= H + 80; y += 80) {
      scrollTo(0, Math.min(y, H));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  });
  await page.evaluate(() => document.getElementById('labs')!.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1500);
}

test('without WebGL the merge ring draws in 2D and the Labs deck stays CSS, with no error', { skip: why || false, timeout: 90_000 }, async (t) => {
  const { page, errors } = await open(t, { noWebGL: true });
  const rings: string[] = [];
  await page.exposeFunction('noteRing', (kind: string) => rings.push(kind));
  await page.evaluate(() => {
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n instanceof HTMLCanvasElement && n.classList.contains('shockwave')) (window as unknown as { noteRing(k: string): void }).noteRing('ring');
    }).observe(document.body, { childList: true });
  });
  await scrollAndMerge(page);
  assert.ok(rings.length >= 1, 'the merge still sends its ring');
  assert.equal(await page.locator('.deck3d.gl').count(), 0, 'the CSS deck stays');
  assert.equal(await page.locator('.deck3d canvas').count(), 0);
  assert.deepEqual(errors, []);
});

test('with WebGL the bridge draws in a worker and nothing WebGL logs an error or a warning', { skip: why || false, timeout: 90_000 }, async (t) => {
  const { page, errors } = await open(t);
  await scrollAndMerge(page);
  await page.locator('.deck3d.gl').waitFor({ timeout: 15_000 });
  assert.deepEqual(errors.filter((e) => /webgl|gl_|three/i.test(e)), []);
  assert.deepEqual(errors, []);
});

test('the performance budgets hold: weight, LCP, layout shift, long tasks while scrolling at 4x CPU, interaction', { skip: why || false, timeout: 240_000 }, async () => {
  // Timing on a shared machine can stall once; a broken budget has to break twice to fail.
  let report = await measure(dir, { lighthouse: false });
  let failures: string[] = broken(report);
  if (failures.length) {
    report = await measure(dir, { lighthouse: false });
    failures = broken(report);
  }
  assert.deepEqual(failures, []);
  assert.ok(report.weight.firstLoadJsGzip < 60 * 1024);
  assert.ok(report.phone.lcpMs > 0 && report.desktop.lcpMs > 0, 'LCP was measured');
});
