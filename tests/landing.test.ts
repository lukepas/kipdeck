// The landing page (site/index.html) and its build (site/build.mjs), in a real headless browser:
// playwright-core's own Chromium, else the one in CHROMIUM_PATH, else an installed Google Chrome.
// Browser tests are skipped, not failed, where there is none. It loads nothing from other sites, says
// what it is in its first screen (the sentence and the wedge, npx mergeline and that it isn't on npm
// yet, the demo and the recording), fits a phone, and its waitlist checks its input, sends nothing
// until the build names an endpoint, then sends exactly the email, and nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
// @ts-expect-error a plain .mjs script with no types
import { buildPage, pictures } from '../site/build.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'site', 'index.html');
const PAGE = pathToFileURL(SOURCE).href;
const html = readFileSync(SOURCE, 'utf8');

let browser: Browser | undefined;
let why = '';
for (const how of [{}, ...(process.env.CHROMIUM_PATH ? [{ executablePath: process.env.CHROMIUM_PATH }] : []), { channel: 'chrome' }]) {
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
});

async function open(t: { after(fn: () => Promise<void>): void }, url = PAGE, options: { width?: number; dark?: boolean } = {}) {
  const context = await browser!.newContext({ viewport: { width: options.width ?? 1440, height: 900 }, colorScheme: options.dark ? 'dark' : 'light' });
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

const outside = (urls: string[]) => urls.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));

test('the copy is plain ASCII: no dash or quote glyphs, no ellipsis character', () => {
  assert.doesNotMatch(html, /[–—‘’“”… ​]/);
});

test('every picture the page shows is in docs/img, and the build copies those', () => {
  const pics: string[] = pictures(html);
  assert.ok(pics.includes('demo.gif'), 'the GIF is the first picture');
  for (const p of pics) assert.ok(existsSync(path.join(ROOT, 'docs', 'img', p)), `docs/img/${p} exists`);
});

test('the build fills in the addresses, opens the CSP to the waitlist only, and refuses http', () => {
  const plain = buildPage(html, {});
  assert.doesNotMatch(plain, /\.\.\/docs\/img\//);
  assert.match(plain, /data-endpoint=""/);
  assert.match(plain, /connect-src 'none'/);
  const built = buildPage(html, { MERGELINE_WAITLIST_URL: 'https://wait.example.eu/api/join', MERGELINE_DEMO_URL: 'https://demo.example.eu/', MERGELINE_REPO_URL: 'https://github.com/example/mergeline' });
  assert.match(built, /data-endpoint="https:\/\/wait\.example\.eu\/api\/join"/);
  assert.match(built, /connect-src https:\/\/wait\.example\.eu;/);
  assert.match(built, /data-link="demo" href="https:\/\/demo\.example\.eu\/" rel="noopener"/);
  assert.match(built, /data-link="repo" href="https:\/\/github\.com\/example\/mergeline"/);
  assert.match(built, /data-link="repo-run" href="https:\/\/github\.com\/example\/mergeline#run-it"/);
  // Not on npm yet: the page says so under the command, until the build says it's published.
  assert.match(plain, /data-unpublished>Not on npm yet/);
  assert.doesNotMatch(buildPage(html, { MERGELINE_NPM_PUBLISHED: '1' }), /data-unpublished|Not on npm yet/);
  assert.throws(() => buildPage(html, { MERGELINE_WAITLIST_URL: 'http://wait.example.eu/' }), /must be https/);
  assert.throws(() => buildPage(html, { MERGELINE_DEMO_URL: 'not a url' }), /not a URL/);
});

test('the first screen: the sentence and the wedge, npx mergeline, Try the demo and the recording; nothing loaded from elsewhere', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  assert.equal(await page.title(), 'Mergeline');
  assert.equal(await page.locator('h1').innerText(), 'The inbox for your AI coding agents');
  assert.match(await page.locator('.hero .lede').innerText(), /who is waiting and for how long/);
  for (const sel of ['.hero > .npx:not(.demo-cmd) code', '[data-link="demo"]', 'a[href="#recording"]', '.unpublished', '.shot img']) {
    const box = await page.locator(sel).first().boundingBox();
    assert.ok(box && box.y < 900, `${sel} is in the first screen`);
  }
  assert.match(await page.locator('.hero > .npx:not(.demo-cmd) code').innerText(), /npx mergeline$/);
  // Without a hosted demo, Try the demo shows the command that runs it.
  assert.equal(await page.locator('#try-demo').isVisible(), false);
  await page.locator('[data-link="demo"]').click();
  assert.equal(await page.locator('#try-demo').isVisible(), true);
  assert.match(await page.locator('#try-demo code').innerText(), /npx mergeline --demo/);
  // Why not the tools you have: a row each, and no 3D Bridge view on the page (it's in Labs and the docs).
  assert.equal(await page.locator('table.why tbody tr').count(), 4);
  assert.equal(await page.locator('#bridge-h, img[src*="bridge"]').count(), 0);
  assert.deepEqual(outside(requests), []);
  assert.deepEqual(errors, []);
});

test('the waitlist checks its input and says plainly that nothing was sent', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  const submit = page.getByRole('button', { name: 'Join the waitlist' });
  // One field and one button.
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
  const dir = mkdtempSync(path.join(tmpdir(), 'landing-'));
  const file = path.join(dir, 'index.html');
  writeFileSync(file, buildPage(html, { MERGELINE_WAITLIST_URL: 'https://wait.example.eu/api/join' }));
  const context = await browser!.newContext();
  t.after(() => context.close());
  const sent: unknown[] = [];
  await context.route('https://wait.example.eu/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' } });
    sent.push(JSON.parse(route.request().postData() ?? 'null'));
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '{}' });
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.fill('#email', 'lead@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await page.locator('#status.ok').waitFor({ timeout: 5000 });
  assert.deepEqual(sent, [{ email: 'lead@example.com', source: 'landing' }]);
  assert.equal(await page.inputValue('#email'), '', 'the form is cleared');
});

test('at phone width it fits without sideways scrolling', { skip: why || false }, async (t) => {
  const { page } = await open(t, PAGE, { width: 360 });
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(scroll <= client, `${scroll}px wide in a ${client}px window`);
  assert.ok(await page.locator('#waitlist-form').isVisible());
});

test('dark mode follows the system and the theme button overrides it', { skip: why || false }, async (t) => {
  const { page } = await open(t, PAGE, { dark: true });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = await bg();
  await page.click('#theme');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  assert.notEqual(await bg(), dark);
});
