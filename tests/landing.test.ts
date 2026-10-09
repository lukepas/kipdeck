// The landing page (site/landing, built by site/build.mjs) in a real headless browser: playwright-core's
// own Chromium, else the one in CHROMIUM_PATH, else an installed Google Chrome. Browser tests are
// skipped, not failed, where there is none. The page is built here once per brand into temporary
// folders and served on 127.0.0.1, since its scripts are modules that browsers will not run from file://.
//
// What it holds the page to: the Kipdeck name and never one from before the rename; nothing loaded from
// other sites; every staged surface labelled as demo data, measured or illustrative; every chain
// value marked testnet; the from-source command until the build says npm is published; one
// repository per brand, named in brand.ts; a first screen that says what it is and a hero command
// that runs the demo; a hero that opens asking and never contradicts itself; copy that matches the
// code (http by default, the kipdeck binary, no internal paths); a design-partner ask by email; a
// waitlist that sends nothing until the build names an endpoint; a phone without sideways
// scrolling and with the section links; every comparison answer readable without waiting on a
// reveal; both themes; the film's window closing by its x and by Esc; the asking state with
// matching clocks and less motion; and no layout shift.
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

// Most tests read the page as it will be once its source is public (the clone command, the
// terminal, the Source link); `closed` is the default build while the repository is private.
const main = await built({ KIPDECK_REPO_PUBLIC: '1' });
const closed = await built({});
// A build set up with the names from before the rename (MERGELINE_*), which still work.
const legacy = await built({ MERGELINE_BRAND: 'kipdeck', MERGELINE_WAITLIST_URL: 'https://wait.example.eu/api/join' });
const withEndpoint = await built({ KIPDECK_WAITLIST_URL: 'https://wait.example.eu/api/join' });

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
  for (const s of [main, closed, legacy, withEndpoint]) s.close();
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

test('one name: the page says Kipdeck and never a name from before the rename', () => {
  const a = texts(main.dir);
  assert.match(main.html, /<title>Kipdeck: the inbox for your AI coding agents<\/title>/);
  assert.match(main.html, /<meta property="og:title" content="Kipdeck: /);
  assert.doesNotMatch(a, /ugc army|ugc-army|mergeline/i);
  assert.doesNotMatch(main.html, /\{\{\w+\}\}/, 'no brand token left unfilled');
  // Links and the clone use the real repository address, and the clone lands in a folder named kipdeck.
  assert.equal(repoOf(main.html), 'https://github.com/zbagdzevicius/kipdeck');
  assert.match(main.html, /data-copy="git clone https:\/\/github\.com\/zbagdzevicius\/kipdeck kipdeck &amp;&amp; cd kipdeck &amp;&amp; npm install &amp;&amp; npm start -- --demo"/);
  assert.match(main.html, /"codeRepository":"https:\/\/github\.com\/zbagdzevicius\/kipdeck"/);
});

test('the MERGELINE_* build settings from before the rename still work', () => {
  assert.match(legacy.html, /<title>Kipdeck: /);
  assert.match(legacy.html, /data-endpoint="https:\/\/wait\.example\.eu\/api\/join"/);
  assert.match(buildPage(main.html, { MERGELINE_NPM_PUBLISHED: '1' }), /data-copy="npx kipdeck --demo"/);
  assert.match(buildPage(main.html, { MERGELINE_DEMO_URL: 'https://demo.example.eu/' }), /data-link="demo" href="https:\/\/demo\.example\.eu\/" rel="noopener">Try the demo</);
  assert.throws(() => buildPage(main.html, { MERGELINE_DEMO_URL: 'http://demo.example.eu/' }), /KIPDECK_DEMO_URL must be https/);
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

test('a build that cannot draw the share card still ships one: public/og.png, 1200 by 630', () => {
  for (const file of [path.join(ROOT, 'site', 'landing', 'public', 'og.png'), path.join(main.dir, 'og.png')]) {
    const png = readFileSync(file);
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG', file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], file);
  }
});

test('vercel.json builds the page and sends the same headers as public/_headers', () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.installCommand, 'npm ci --ignore-scripts');
  assert.equal(vercel.buildCommand, 'npm run build:site');
  assert.equal(vercel.outputDirectory, 'dist/site');
  // _headers: "/path/*" lines followed by indented "Key: value" lines.
  const fromHeaders: Record<string, Record<string, string>> = {};
  let at = '';
  for (const line of readFileSync(path.join(ROOT, 'site', 'landing', 'public', '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) fromHeaders[(at = line.trim().replace(/\*$/, '(.*)'))] = {};
    else if (line.trim()) {
      const [key, ...value] = line.trim().split(':');
      fromHeaders[at][key] = value.join(':').trim();
    }
  }
  const fromVercel: Record<string, Record<string, string>> = {};
  for (const rule of vercel.headers) fromVercel[rule.source] = Object.fromEntries(rule.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  assert.deepEqual(fromVercel, fromHeaders);
});

test('the build fills in the addresses, opens the CSP to the waitlist only, and refuses http', () => {
  const html = main.html;
  assert.match(html, /data-endpoint=""/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self'; style-src 'self'/);
  const filled = buildPage(html, { KIPDECK_WAITLIST_URL: 'https://wait.example.eu/api/join', KIPDECK_DEMO_URL: 'https://demo.example.eu/', KIPDECK_REPO_URL: 'https://github.com/example/agent-inbox' });
  assert.match(filled, /data-endpoint="https:\/\/wait\.example\.eu\/api\/join"/);
  assert.match(filled, /connect-src https:\/\/wait\.example\.eu;/);
  assert.match(filled, /data-link="demo" href="https:\/\/demo\.example\.eu\/" rel="noopener">Try the demo</);
  assert.match(html, /data-link="demo" href="#try-demo">Copy the demo command</, 'without a hosted demo the button says what it does');
  assert.match(filled, /data-link="repo" href="https:\/\/github\.com\/example\/agent-inbox"/);
  assert.match(filled, /data-link="repo-run" href="https:\/\/github\.com\/example\/agent-inbox#from-source"/);
  assert.match(filled, /data-copy="git clone https:\/\/github\.com\/example\/agent-inbox &amp;&amp; cd agent-inbox &amp;&amp;/);
  assert.ok(!filled.includes(repoOf(html)), 'no link left to the brand repository');
  assert.throws(() => buildPage(html, { KIPDECK_WAITLIST_URL: 'http://wait.example.eu/' }), /must be https/);
  assert.throws(() => buildPage(html, { KIPDECK_DEMO_URL: 'not a url' }), /not a URL/);
});

test('while the repository is private the page points nowhere a visitor cannot follow', () => {
  const html = closed.html;
  assert.doesNotMatch(html, /git clone|data-link="repo"|data-link="repo-docs"|data-link="repo-run"|id="from-source"|codeRepository|<!-- runnable -->/);
  // The film leads, and the design-partner email is the second button.
  const cta = (/<div class="cta">[\s\S]*?<\/div>/.exec(html) ?? [''])[0];
  assert.match(cta, /class="btn primary magnetic" type="button" data-watch/);
  assert.match(cta, /<a class="btn ghost" data-link="partner-hero" href="mailto:hello@kipdeck\.com\?subject=Design%20partner/);
  assert.doesNotMatch(cta, /data-link="demo"/);
  // npx on the registry brings the command back without the source links; a hosted demo keeps its button.
  const npm = buildPage(main.html, { KIPDECK_NPM_PUBLISHED: '1' });
  assert.match(npm, /data-copy="npx kipdeck --demo"/);
  assert.doesNotMatch(npm, /data-link="repo"|codeRepository/);
  assert.match(buildPage(main.html, { KIPDECK_DEMO_URL: 'https://demo.example.eu/' }), /data-link="demo" href="https:\/\/demo\.example\.eu\/" rel="noopener">Try the demo</);
  // Public (by flag or by KIPDECK_REPO_URL), everything comes back.
  assert.match(main.html, /data-link="repo"/);
  assert.match(main.html, /"codeRepository":"https:\/\/github\.com\/zbagdzevicius\/kipdeck"/);
});

test('until npm is published the page says so and shows the from-source command; published, npx takes its place', () => {
  assert.match(main.html, /Not on npm yet/);
  assert.match(main.html, /data-unpublished>/);
  assert.match(main.html, /data-published hidden/);
  const published = buildPage(main.html, { KIPDECK_NPM_PUBLISHED: '1', KIPDECK_REPO_PUBLIC: '1' });
  assert.doesNotMatch(published, /data-unpublished|Not on npm yet|git clone/);
  assert.match(published, /<div class="cmd" data-published>/);
  assert.match(published, /data-copy="npx kipdeck --demo"/);
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
  // Proof of Merge is a Labs card, not a section of the main scroll, and still says testnet.
  assert.doesNotMatch(source, /id="proof"/);
  const proof = source.slice(source.indexOf('<li class="tile tile-proof">'), source.indexOf('</li>', source.indexOf('tile-proof')));
  assert.ok(proof.length > 200, 'the Proof of Merge card is found');
  assert.match(proof, /Testnet only/);
  for (const link of proof.match(/<a [^>]*explorer[^>]*>.*?<\/a> <span class="chip">[^<]+<\/span>/g) ?? ['']) assert.match(link, /devnet/, link);
  assert.doesNotMatch(source, /\b(customers|users love|trusted by|testimonial)\b/i, 'no invented traction');
});

test('the first screen: the sentence, the from-source command, Try the demo and Watch; nothing loaded from elsewhere', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  assert.equal(await page.title(), 'Kipdeck: the inbox for your AI coding agents');
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
  assert.equal(await page.locator('table.why-table tbody tr').count(), 7);
  assert.deepEqual(outside(requests), []);
  assert.deepEqual(errors, []);
});

/** Every number the hero's mock and the top bar show, read at once. */
const HERO_NUMBERS = {
  pulse: '[data-pulse-count]',
  mini: '[data-mini-waiting]',
  needs: '#mini-inbox .sec-needs .count',
  pulseWait: '[data-pulse-wait]',
  stopwatch: '#stopwatch',
  median: '[data-mini-median]',
  // The row's drawn clock only rolls its reels; its value for a screen reader is in the row's name.
  row: '[data-row-wait-sr]',
};
async function heroNumbers(page: import('playwright-core').Page): Promise<Record<keyof typeof HERO_NUMBERS, string>> {
  const keys = Object.keys(HERO_NUMBERS) as (keyof typeof HERO_NUMBERS)[];
  const values = await page.evaluate((sels) => sels.map((s) => (document.querySelector(s)?.textContent ?? '').replace(/\s/g, '')), Object.values(HERO_NUMBERS));
  return Object.fromEntries(keys.map((k, i) => [k, (/\d+:\d\d/.exec(values[i]) ?? [values[i]])[0]])) as Record<keyof typeof HERO_NUMBERS, string>;
}

test('the wait: Codex is waiting from the first frame, every number agrees, and answering clears them all at once', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t, main.url, { dark: true });
  // The opening is the headline's state: one agent waiting, already some seconds in.
  let n = await heroNumbers(page);
  assert.deepEqual([n.pulse, n.mini, n.needs], ['1', '1', '1'], JSON.stringify(n));
  assert.equal(await page.locator('[data-clear]').isEnabled(), true);
  assert.equal(await page.locator('#favicon').getAttribute('href'), 'favicon-alert.svg');
  await page.waitForTimeout(1200);
  n = await heroNumbers(page);
  assert.match(n.stopwatch, /^0:\d\d$/, 'one clock format, m:ss, everywhere');
  assert.ok(Number(n.stopwatch.slice(2)) >= 7, `it was already waiting when the page opened (${n.stopwatch})`);
  // Read in the same frame they can differ by a tick at most; they are one clock.
  assert.ok([n.pulseWait, n.median, n.row].every((v) => Math.abs(Number(v.slice(2)) - Number(n.stopwatch.slice(2))) <= 1), JSON.stringify(n));
  await page.locator('[data-clear]').click();
  n = await heroNumbers(page);
  assert.deepEqual([n.pulse, n.mini, n.needs, n.stopwatch, n.pulseWait], ['0', '0', '0', '0:00', '0:00'], JSON.stringify(n));
  assert.equal(await page.locator('[data-clear]').getAttribute('aria-label'), null, 'its visible text is its name');
  assert.equal(await page.locator('#favicon').getAttribute('href'), 'favicon.svg');
  assert.equal((await page.locator('[data-clear]').textContent())?.includes('Answered. Back at work.'), true);
  await page.waitForTimeout(900);
  const scale = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#waitclock')!).getPropertyValue('--wait') || 0));
  assert.ok(scale < 0.01, `the wait clock is back at zero (${scale})`);
  assert.deepEqual(errors, []);
});

test('after an answer the hero is calm: no orange word, no zero clocks; the review row merges; copying answers nothing', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t, main.url, { dark: true });
  await page.keyboard.press('Shift');
  const signal = await page.evaluate(() => getComputedStyle(document.querySelector('#waiting')!).color);
  // A copy is not an answer.
  await page.locator('#try-demo .cmd[data-unpublished] .copy').click();
  assert.equal(await page.locator('[data-pulse-count]').textContent(), '1', 'copying leaves Codex waiting');
  // The row's name says how long it has waited.
  assert.match((await page.locator('[data-clear]').textContent()) ?? '', /waiting 0:\d\d/);
  await page.locator('[data-clear]').click();
  await page.waitForTimeout(600);
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#waiting')!).color), signal, '"waiting" is ink once nobody waits');
  assert.equal(await page.locator('#stopwatch').evaluate((el) => getComputedStyle(el).opacity), '0');
  assert.equal(await page.locator('[data-pulse-wait]').isVisible(), false, 'the pill drops its clock');
  assert.equal(await page.locator('[data-mini-median]').textContent(), '-');
  // Merge the finished change.
  await page.locator('[data-merge]').click();
  assert.equal(await page.locator('[data-merge]').isDisabled(), true);
  await page.waitForFunction(() => document.querySelector('[data-mini-merged]')!.textContent!.replace(/\s/g, '') === '1');
  assert.equal(await page.locator('#mini-inbox .sec-review .count').textContent(), '0');
  assert.deepEqual(errors, []);
});

test('the private build opens on the film and the design-partner ask, and every section still runs', { skip: why || false, timeout: 60_000 }, async (t) => {
  const { page, errors, requests } = await open(t, closed.url, { width: 390, height: 844 });
  assert.equal(await page.locator('.cta [data-watch]').isVisible(), true);
  assert.equal(await page.getByRole('link', { name: 'Become a design partner' }).isVisible(), true);
  assert.equal(await page.locator('#try-demo, #from-source').count(), 0);
  await page.evaluate(() => document.getElementById('yours')!.scrollIntoView());
  await page.waitForTimeout(800);
  assert.deepEqual(outside(requests), []);
  assert.deepEqual(errors, []);
});

test('a command breaks only between its steps, never inside a word', { skip: why || false }, async (t) => {
  const { page } = await open(t, main.url, { width: 390, height: 844 });
  const text = page.locator('#try-demo .cmd[data-unpublished] .cmd-text');
  assert.match(await text.innerText(), /^git clone .* && npm start -- --demo$/);
  const split = await text.evaluate((el) => {
    const r = document.createRange();
    const out: string[] = [];
    // Every word sits on one line: its range has a single line top.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.textContent ?? '';
      for (const m of s.matchAll(/[^\s/]+\/?/g)) {
        r.setStart(n, m.index!);
        r.setEnd(n, m.index! + m[0].length);
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        if (tops.size > 1) out.push(m[0]);
      }
    }
    return out;
  });
  assert.deepEqual(split, []);
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

test('the ask works without a server or a public repository: a design-partner email, and no waitlist form', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  assert.equal(await page.locator('#waitlist-form').isVisible(), false, 'no form that would throw a lead away');
  const apply = page.getByRole('link', { name: 'Apply as a design partner' });
  const href = (await apply.getAttribute('href')) ?? '';
  assert.ok(href.startsWith('mailto:hello@kipdeck.com?subject=Design%20partner'), href);
  assert.ok(!href.includes('github.com'), 'never an issue on a repository outsiders may not see');
  assert.match(decodeURIComponent(href), /How many agents do you run a day/);
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
  assert.ok(await page.locator('#waitlist-form').isVisible(), 'a build with an endpoint shows the Team waitlist');
  await page.fill('#email', 'lead@example.com');
  await page.getByRole('button', { name: 'Join the Team waitlist' }).click();
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
  assert.ok(await page.locator('.apply-link').isVisible());
});

test('below 1080 px the section links are a row under the bar, in the page\'s order, all in view, and they jump', { skip: why || false }, async (t) => {
  for (const size of [{ width: 390, height: 844 }, { width: 900, height: 700 }, { width: 667, height: 375 }]) {
    const { page } = await open(t, main.url, size);
    const links = page.locator('nav.links a');
    assert.deepEqual(await links.allTextContents(), ['The loop', 'Why', 'Security', 'Labs', 'Teams']);
    const teams = links.last();
    assert.equal(await teams.isVisible(), true, `the links show at ${size.width}`);
    const right = await teams.evaluate((a) => a.getBoundingClientRect().right);
    assert.ok(right <= size.width, `Teams is in view at ${size.width} (${right})`);
    const weights = await links.evaluateAll((as) => as.map((a) => getComputedStyle(a).fontWeight));
    assert.equal(new Set(weights).size, 1, 'no link looks like the current section');
    const box = await page.locator('nav.links').boundingBox();
    assert.ok(box && box.y + box.height <= 130, `the row sits in the bar at ${size.width} (${JSON.stringify(box)})`);
    await teams.click();
    await page.waitForTimeout(1200);
    const top = await page.evaluate(() => document.getElementById('teams')!.getBoundingClientRect().top);
    assert.ok(Math.abs(top) < 12, `Teams is at the top after the jump (${top})`);
  }
});

test('the comparison never waits on a reveal: every answer reads at full opacity, even in a short landscape window', { skip: why || false, timeout: 60_000 }, async (t) => {
  for (const size of [{ width: 667, height: 375 }, { width: 1440, height: 900 }]) {
    const { page, errors } = await open(t, main.url, size);
    await page.keyboard.press('Shift');
    await page.evaluate(() => document.querySelector('#why .table-wrap')!.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    const faint = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#why th, #why td > span, #teams .plan')].filter((el) => Number(getComputedStyle(el).opacity) < 1).map((el) => el.textContent?.slice(0, 30)),
    );
    assert.deepEqual(faint, [], `at ${size.width}x${size.height}`);
    assert.ok(await page.locator('#why .table-wrap.staged').count(), 'the scene ran');
    assert.deepEqual(errors, []);
  }
});

test('the copy matches the code: http by default, the kipdeck binary, Cursor CLI, the attach command, and no internal paths', () => {
  const page = main.html;
  assert.doesNotMatch(page, /https:\/\/localhost/, 'the default address is http');
  assert.doesNotMatch(page, /agent-office\.js/, 'the binary is kipdeck');
  assert.doesNotMatch(page, /serves your network over HTTPS/);
  assert.doesNotMatch(page, /design\/(measure|shots)|fundable/, 'no internal paths a visitor cannot open');
  assert.doesNotMatch(page, /For investors|class="investors"/, 'the investor notes live in the deck');
  assert.doesNotMatch(page, /Cursor(?! CLI)[,.<]/, 'Cursor CLI, by its name');
  assert.match(page, /kipdeck attach/);
  assert.match(page, /Vendor inboxes[\s\S]*GitHub Agent HQ, Codex app, Claude Code/);
  assert.match(page, /Agent workbenches[\s\S]*Conductor, Superset, Emdash/);
  assert.match(page, /Localhost by default/);
  assert.match(page, /Ed25519/);
  // The page ends on Teams and the ask: no section after it, only the footer.
  const order = [...page.matchAll(/<section [^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(order.at(-1), 'teams');
  assert.doesNotMatch(page.slice(page.indexOf('id="end"')), /git clone|class="cmd"/, 'the footer has no command block');
});

test('a Vercel build gets absolute share-card addresses from its production domain', () => {
  const page = buildPage(main.html, { VERCEL_PROJECT_PRODUCTION_URL: 'kipdeck.example' });
  assert.match(page, /<link rel="canonical" href="https:\/\/kipdeck\.example\/">/);
  assert.match(page, /<meta property="og:image" content="https:\/\/kipdeck\.example\/og\.png">/);
  assert.match(page, /<meta name="twitter:image" content="https:\/\/kipdeck\.example\/og\.png">/);
  // An explicit address wins.
  assert.match(buildPage(main.html, { VERCEL_PROJECT_PRODUCTION_URL: 'kipdeck.example', KIPDECK_SITE_URL: 'https://other.example/' }), /href="https:\/\/other\.example\/"/);
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

test('with less motion every section is at its final, readable state, and the one clock still counts', { skip: why || false }, async (t) => {
  const { page, errors } = await open(t, main.url, { reduced: true, dark: true });
  await page.waitForTimeout(400);
  // The asking state, with one clock: every number the same.
  const n = await heroNumbers(page);
  assert.deepEqual([n.pulse, n.mini, n.needs], ['1', '1', '1']);
  assert.match(n.stopwatch, /^0:0[78]$/);
  assert.deepEqual([n.pulseWait, n.median, n.row], [n.stopwatch, n.stopwatch, n.stopwatch], JSON.stringify(n));
  // A digit changing is not motion: the wait goes on counting, every clock together.
  await page.waitForTimeout(2300);
  const m = await heroNumbers(page);
  assert.notEqual(m.stopwatch, n.stopwatch, 'the page never reads as frozen');
  assert.deepEqual([m.pulseWait, m.median, m.row], [m.stopwatch, m.stopwatch, m.stopwatch], JSON.stringify(m));
  // Answered, every number goes to zero together and stays there.
  await page.locator('[data-clear]').click();
  const a = await heroNumbers(page);
  assert.deepEqual([a.pulse, a.mini, a.needs, a.stopwatch, a.pulseWait], ['0', '0', '0', '0:00', '0:00'], JSON.stringify(a));
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
