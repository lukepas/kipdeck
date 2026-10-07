// The landing page (site/landing, built by site/build.mjs) in a real headless browser: playwright-core's
// own Chromium, else the one in CHROMIUM_PATH, else an installed Google Chrome. Browser tests are
// skipped, not failed, where there is none. The page is built here once per brand into temporary
// folders and served on 127.0.0.1, since its scripts are modules that browsers will not run from file://.
//
// What it holds the page to: one brand per build and never the other name; nothing loaded from
// other sites; every staged surface labelled as demo data, measured or illustrative; every chain
// value marked testnet; the from-source command until the build says npm is published; one
// repository per brand, named in brand.ts; a first screen that says what it is and a hero command
// that runs the demo; a waitlist that sends nothing until the build names an endpoint;
// a phone without sideways scrolling; both themes; the film's window closing by its x and by Esc;
// a calm, final state with less motion; and no layout shift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
// @ts-expect-error a plain .mjs script with no types
import { buildPage, buildSite, repoOf } from '../site/build.mjs';
// @ts-expect-error a plain .mjs script with no types
import { serve } from '../site/serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'site', 'landing', 'index.html');
const source = readFileSync(SOURCE, 'utf8');

type Served = { dir: string; url: string; html: string; close(): void };
async function built(env: Record<string, string>): Promise<Served> {
  const dir = mkdtempSync(path.join(tmpdir(), 'landing-'));
  await buildSite({ env, outDir: dir, card: false });
  const { server, url } = await serve(dir, 0);
  return { dir, url, html: readFileSync(path.join(dir, 'index.html'), 'utf8'), close: () => server.close() };
}

const main = await built({});
const ugc = await built({ MERGELINE_BRAND: 'ugc-army' });
const withEndpoint = await built({ MERGELINE_WAITLIST_URL: 'https://wait.example.eu/api/join' });

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
  for (const s of [main, ugc, withEndpoint]) s.close();
});

async function open(t: { after(fn: () => Promise<void>): void }, url = main.url, options: { width?: number; height?: number; dark?: boolean; reduced?: boolean } = {}) {
  const context = await browser!.newContext({
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    colorScheme: options.dark ? 'dark' : 'light',
    reducedMotion: options.reduced ? 'reduce' : 'no-preference',
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForLoadState('load');
  return { page, requests, errors };
}

const outside = (urls: string[]) => urls.filter((u) => !u.startsWith('http://127.0.0.1:') && !u.startsWith('data:'));

/** Every text file the build wrote (the page, its scripts and styles). */
function texts(dir: string): string {
  const assets = readdirSync(path.join(dir, 'assets')).filter((f) => /\.(js|css)$/.test(f));
  return [readFileSync(path.join(dir, 'index.html'), 'utf8'), ...assets.map((f) => readFileSync(path.join(dir, 'assets', f), 'utf8'))].join('\n');
}

test('the copy is plain ASCII: no dash or quote glyphs, no ellipsis character', () => {
  for (const file of [SOURCE, path.join(ROOT, 'site', 'landing', 'brand.ts')]) assert.doesNotMatch(readFileSync(file, 'utf8'), /[\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u00A0\u200B]/, file);
});

test('one name per build: each brand says its own name and never the other', () => {
  const a = texts(main.dir);
  const b = texts(ugc.dir);
  assert.match(main.html, /<title>Mergeline: the inbox for your AI coding agents<\/title>/);
  assert.match(main.html, /<meta property="og:title" content="Mergeline: /);
  assert.doesNotMatch(a, /ugc army|ugc-army/i);
  assert.match(ugc.html, /<title>UGC Army: the inbox for your AI coding agents<\/title>/);
  assert.match(ugc.html, /npx ugc-army/);
  assert.doesNotMatch(b, /mergeline/i);
  assert.doesNotMatch(main.html + ugc.html, /\{\{\w+\}\}/, 'no brand token left unfilled');
  // The repository is the brand's too: a Mergeline build never clones or links the other one.
  assert.equal(repoOf(main.html), 'https://github.com/zbagdzevicius/mergeline');
  assert.equal(repoOf(ugc.html), 'https://github.com/zbagdzevicius/ugcarmy');
  assert.doesNotMatch(a, /ugcarmy/i);
  assert.match(main.html, /data-copy="git clone https:\/\/github\.com\/zbagdzevicius\/mergeline &amp;&amp; cd mergeline &amp;&amp; npm install &amp;&amp; npm start -- --demo"/);
  assert.match(main.html, /"codeRepository":"https:\/\/github\.com\/zbagdzevicius\/mergeline"/);
});

test('every film and poster the page shows is in site/landing/public/media, and the build copies it', () => {
  const media = [...new Set([...source.matchAll(/(?:src|srcset|poster)="(media\/[^"]+)"/g)].map((m) => m[1]))];
  assert.ok(media.length >= 4, 'the film and its posters');
  for (const m of media) {
    assert.ok(existsSync(path.join(ROOT, 'site', 'landing', 'public', m)), `site/landing/public/${m}`);
    assert.ok(existsSync(path.join(main.dir, m)), `the build has ${m}`);
  }
  assert.doesNotMatch(source, /<video[^>]*autoplay/, 'the film never plays by itself');
  assert.match(source, /preload="none"/);
});

test('the build fills in the addresses, opens the CSP to the waitlist only, and refuses http', () => {
  const html = main.html;
  assert.match(html, /data-endpoint=""/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self'; style-src 'self'/);
  const filled = buildPage(html, { MERGELINE_WAITLIST_URL: 'https://wait.example.eu/api/join', MERGELINE_DEMO_URL: 'https://demo.example.eu/', MERGELINE_REPO_URL: 'https://github.com/example/agent-inbox' });
  assert.match(filled, /data-endpoint="https:\/\/wait\.example\.eu\/api\/join"/);
  assert.match(filled, /connect-src https:\/\/wait\.example\.eu;/);
  assert.match(filled, /data-link="demo" href="https:\/\/demo\.example\.eu\/" rel="noopener"/);
  assert.match(filled, /data-link="repo" href="https:\/\/github\.com\/example\/agent-inbox"/);
  assert.match(filled, /data-link="repo-run" href="https:\/\/github\.com\/example\/agent-inbox#from-source"/);
  assert.match(filled, /data-copy="git clone https:\/\/github\.com\/example\/agent-inbox &amp;&amp; cd agent-inbox &amp;&amp;/);
  assert.ok(!filled.includes(repoOf(html)), 'no link left to the brand repository');
  assert.throws(() => buildPage(html, { MERGELINE_WAITLIST_URL: 'http://wait.example.eu/' }), /must be https/);
  assert.throws(() => buildPage(html, { MERGELINE_DEMO_URL: 'not a url' }), /not a URL/);
});

test('until npm is published the page says so and shows the from-source command; published, npx takes its place', () => {
  assert.match(main.html, /Not on npm yet/);
  assert.match(main.html, /data-unpublished>/);
  assert.match(main.html, /data-published hidden/);
  const published = buildPage(main.html, { MERGELINE_NPM_PUBLISHED: '1' });
  assert.doesNotMatch(published, /data-unpublished|Not on npm yet|git clone/);
  assert.match(published, /<div class="cmd" data-published>/);
  assert.match(published, /data-copy="npx mergeline --demo"/);
});

test('every staged surface is labelled: demo data, measured or illustrative; every chain value says testnet', () => {
  const sections = source.split('<!-- ').slice(1);
  const staged = /class="(?:app |app"|phone"|chart"|lanes"|machine")/;
  for (const s of sections) {
    if (!staged.test(s)) continue;
    assert.match(s, /Demo data|demo data|Illustrative|illustrative|measured/, `section "${s.slice(0, 30)}" labels what it shows`);
  }
  // The measured numbers live in section 06, beside how they were measured.
  assert.match(source, /aria-label="Measured on the scripted demo">[\s\S]*?data-count="10\.7"/);
  assert.match(source, /class="footnote mono measured-note">Measured: headless Chromium/);
  const proof = source.slice(source.indexOf('<!-- 10 Proof'), source.indexOf('<!-- 11 '));
  assert.match(proof, /Testnet only/);
  for (const row of proof.match(/<div><dt>[^<]+<\/dt><dd>.*?<\/dd><\/div>/g) ?? []) assert.match(row, /devnet|Sepolia/, row);
  assert.doesNotMatch(source, /\b(customers|users love|trusted by|testimonial)\b/i, 'no invented traction');
});

test('the first screen: the sentence, the from-source command, Try the demo and Watch; nothing loaded from elsewhere', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  assert.equal(await page.title(), 'Mergeline: the inbox for your AI coding agents');
  assert.equal((await page.locator('h1').innerText()).replace(/\s+/g, ' ').replace(/\s*\d{1,2}:\d\d\s*/, ' ').trim(), 'Your agents are waiting on you.');
  for (const sel of ['.cmd[data-unpublished] .cmd-text', '[data-link="demo"]', '.cta [data-watch]', '.unpublished', '#mini-inbox']) {
    const box = await page.locator(sel).first().boundingBox();
    assert.ok(box && box.y < 900, `${sel} is in the first screen`);
  }
  assert.equal(await page.locator('[data-published]:visible').count(), 0);
  // The hero's command is the demo's, and says what the demo is. Without a hosted demo, Try the
  // demo copies that same command and lights it.
  assert.match(await page.locator('#try-demo .cmd-text:visible').innerText(), /^git clone .* && npm start -- --demo$/);
  assert.match(await page.locator('#try-demo').innerText(), /No agent CLI, sign-in or model needed/);
  await page.locator('[data-link="demo"]').click();
  assert.equal(await page.locator('#try-demo.lit').count(), 1);
  await page.waitForFunction(() => /Copied|Select it/.test(document.querySelector('#try-demo .copy')!.textContent ?? ''));
  assert.equal(await page.locator('table.why-table tbody tr').count(), 6);
  assert.deepEqual(outside(requests), []);
  assert.deepEqual(errors, []);
});

test('the wait: Codex stops and asks as the page opens, and answering it clears every clock', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t, main.url, { dark: true });
  // The opening: Codex works at the foot of the list, nothing waits, and the button is not live yet.
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '0');
  assert.equal(await page.locator('[data-clear]').isDisabled(), true);
  // About 2.4 s in it asks and climbs to the top; from then on the visitor's own time counts.
  await page.locator('[data-clear]:enabled').waitFor({ timeout: 5000 });
  await page.waitForTimeout(1200);
  assert.match((await page.locator('#stopwatch').textContent()) ?? '', /^0:0\d$/, 'one clock format, m:ss, everywhere');
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '1');
  assert.equal(await page.locator('#favicon').getAttribute('href'), 'favicon-alert.svg');
  await page.locator('[data-clear]').click();
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '0');
  assert.equal(await page.locator('#stopwatch').textContent(), '0:00');
  assert.match((await page.locator('[data-clear]').getAttribute('aria-label')) ?? '', /was answered/);
  assert.equal(await page.locator('#favicon').getAttribute('href'), 'favicon.svg');
  assert.equal((await page.locator('[data-clear]').textContent())?.includes('Answered. Back at work.'), true);
  await page.waitForTimeout(900);
  const scale = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#waitclock')!).getPropertyValue('--wait') || 0));
  assert.ok(scale < 0.01, `the wait clock is back at zero (${scale})`);
  assert.deepEqual(errors, []);
});

test('any key during the opening plays it to its end: Codex asks at once', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t, main.url, { dark: true });
  await page.keyboard.press('Shift');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-clear]').isEnabled(), true);
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '1');
  const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-h .w > span')!).opacity);
  assert.equal(opacity, '1', 'the headline is fully set');
  assert.deepEqual(errors, []);
});

test('the waitlist checks its input and says plainly that nothing was sent', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  const submit = page.getByRole('button', { name: 'Join the waitlist' });
  assert.equal(await page.locator('#waitlist-form input, #waitlist-form select').count(), 1);
  await page.fill('#email', 'not-an-email');
  await submit.click();
  assert.match((await page.locator('#status').textContent()) ?? '', /valid email/);
  await page.fill('#email', 'someone@example.com');
  await submit.click();
  assert.match((await page.locator('#status').textContent()) ?? '', /nothing was sent/);
  assert.deepEqual(outside(requests), []);
  assert.deepEqual(errors, []);
});

test('built with an endpoint, the waitlist sends the email and where it came from, and nothing else', { skip: why || false }, async (t) => {
  const context = await browser!.newContext();
  t.after(() => context.close());
  const sent: unknown[] = [];
  await context.route('https://wait.example.eu/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' } });
    sent.push(JSON.parse(route.request().postData() ?? 'null'));
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '{}' });
  });
  const page = await context.newPage();
  await page.goto(withEndpoint.url);
  await page.fill('#email', 'lead@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await page.locator('#status.ok').waitFor({ timeout: 5000 });
  assert.deepEqual(sent, [{ email: 'lead@example.com', source: 'landing' }]);
  assert.equal(await page.inputValue('#email'), '', 'the form is cleared');
  // The seat fills as the agents finish forming the mark over the seats.
  await page.locator('.seats li.filled').waitFor({ timeout: 4000 });
  assert.equal(await page.locator('.seats li.filled').count(), 1);
});

test('at phone width it fits without sideways scrolling, top to bottom', { skip: why || false }, async (t) => {
  const { page } = await open(t, main.url, { width: 360, height: 780 });
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(scroll <= client, `${scroll}px wide in a ${client}px window`);
  assert.ok(await page.locator('#waitlist-form').isVisible());
});

test('dark mode follows the system and the theme button overrides it', { skip: why || false }, async (t) => {
  const { page } = await open(t, main.url, { dark: true });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = await bg();
  await page.click('#theme');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  assert.notEqual(await bg(), dark);
});

test('Watch 30 seconds opens the film in a window that its x and Esc both close', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t);
  const dialog = page.locator('dialog#watch');
  await page.locator('.cta [data-watch]').click();
  assert.equal(await dialog.isVisible(), true);
  await page.getByRole('button', { name: 'Close' }).click();
  assert.equal(await dialog.isVisible(), false);
  await page.locator('.cta [data-watch]').click();
  assert.equal(await dialog.isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('.cta [data-watch]')), true, 'focus is back on the button that opened it');
  assert.deepEqual(errors, []);
});

test('with less motion every section is at its final, readable state and nothing ticks', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t, main.url, { reduced: true, dark: true });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#stopwatch').textContent(), '23:00');
  assert.equal(await page.locator('#waitclock').isVisible(), false);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, .lede, .label, .app, figure')].filter((el) => Number(getComputedStyle(el).opacity) < 1).map((el) => el.className),
  );
  assert.deepEqual(hidden, []);
  assert.deepEqual(errors, []);
});

test('no layout shift while the page loads and the hero plays', { skip: why || false }, async (t) => {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.addInitScript(() => {
    (window as unknown as { cls: number }).cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { cls: number }).cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(main.url);
  // Through the whole opening: the inhale, the rows, and Codex climbing to the top.
  await page.waitForTimeout(4200);
  const cls = await page.evaluate(() => (window as unknown as { cls: number }).cls);
  assert.ok(cls < 0.01, `cumulative layout shift ${cls}`);
});
