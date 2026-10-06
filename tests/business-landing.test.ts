import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';

/**
 * The waitlist page in a real headless browser: playwright-core's own Chromium, else the one in
 * CHROMIUM_PATH, else an installed Google Chrome. Skipped, not failed, where there is none
 * (`npx playwright-core install chromium-headless-shell` adds one).
 */
const PAGE = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'business', 'landing', 'index.html')).href;

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

/** Opens the page, recording every request it makes and every console error, CSP reports included. */
async function open(t: { after(fn: () => Promise<void>): void }, options: { width?: number; dark?: boolean } = {}) {
  const context = await browser!.newContext({
    viewport: { width: options.width ?? 1280, height: 900 },
    colorScheme: options.dark ? 'dark' : 'light',
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  return { page, requests, errors };
}

const statusOf = (page: Page) => page.locator('#status').textContent();

test('the page loads nothing but itself and logs no errors', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  await page.waitForLoadState('load');
  assert.deepEqual(requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:')), []);
  assert.deepEqual(errors, []);
  assert.equal(await page.title(), await page.locator('.brand [data-name]').textContent());
});

test('the waitlist form checks its input and says plainly that nothing was sent', { skip: why || false }, async (t) => {
  const { page, requests, errors } = await open(t);
  const submit = page.getByRole('button', { name: 'Join the waitlist' });

  await page.fill('#email', 'not-an-email');
  await submit.click();
  assert.match((await statusOf(page)) ?? '', /valid email/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'email');

  await page.fill('#email', 'someone@example.com');
  await submit.click();
  assert.match((await statusOf(page)) ?? '', /tick the box/);

  await page.check('#consent');
  await submit.click();
  assert.match((await statusOf(page)) ?? '', /nothing was sent/);
  // Still on the page, and still nothing went anywhere.
  assert.equal(page.url(), PAGE);
  assert.deepEqual(requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:')), []);
  assert.deepEqual(errors, []);
});

test('at phone width the page fits without sideways scrolling', { skip: why || false }, async (t) => {
  const { page } = await open(t, { width: 360 });
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(scroll <= client, `${scroll}px wide in a ${client}px window`);
  assert.ok(await page.locator('#waitlist-form').isVisible());
});

test('dark mode follows the system and the theme button overrides it', { skip: why || false }, async (t) => {
  const { page } = await open(t, { dark: true });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = await bg();
  await page.click('#theme');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  const light = await bg();
  assert.notEqual(dark, light);
  await page.click('#theme');
  assert.equal(await bg(), dark);
});
