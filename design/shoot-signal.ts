// Signal screenshots: the built office with `--demo` on a spare port (4790-4799), in-process with a
// throwaway home, walked through the four statuses (No goal, On track, At risk with an open decision
// from a /rundown, Off track past its due date). Shoots the chip over the inbox list and the card, each
// dark and light, at 1440 and on a 390 px phone: 32 shots. Exits 1 on a page error or a horizontal
// scroll on the phone.
//
//   npm run build && node --import tsx design/shoot-signal.ts
//
// Into design/shots/signal/ (SHOOT_OUT another folder). Stops its own office at the end; it never
// touches an office on 4600.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.SHOOT_OUT ?? path.join('design', 'shots', 'signal'));
const PORT = Number(process.env.SHOOT_PORT ?? 4791);
if (PORT < 4790 || PORT > 4799) throw new Error('SHOOT_PORT must be 4790-4799');
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const root = mkdtempSync(path.join(tmpdir(), 'signal-shoot-'));
for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_') || k.startsWith('KIPDECK_')) delete process.env[k];
writeFileSync(path.join(root, '.gitconfig'), '');
Object.assign(process.env, { HOME: root, USERPROFILE: root, KIPDECK_DEMO_PACE: '6', GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig') });
const { loadConfig } = await import('../src/server/config.js');
const { startServer } = await import('../src/server/server.js');
const { setUpDemo } = await import('../src/server/demo/index.js');
const cfg = loadConfig(['--demo', '--home', path.join(root, 'office'), '--port', String(PORT), '--password', PASSWORD, '--no-open']);
const ws = setUpDemo(cfg);
if (typeof ws === 'string') throw new Error(ws);
const log = console.log;
console.log = () => {};
const office = await startServer(cfg, { publicDir: path.join(ROOT, 'dist', 'public') });
console.log = log;

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let failed = false;
const browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: 'chrome' }));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => ((failed = true), console.error('page error:', e.message)));
  await page.goto(`${base}/login`);
  await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row').first().waitFor({ timeout: 30_000 });
  const send = (msg: object) => page.evaluate((m) => (window as any).__lite.net.send(m), msg);
  const wait = (level: string) => page.locator(`#signal .sig-chip[data-level="${level}"]`).waitFor({ timeout: 20_000 });

  async function shoot(state: string) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
        // On a phone the selected agent's pane covers the list: put it away, as Esc does.
        await page.evaluate(() => {
          const home = (window as any).__lite.home;
          home.held = true;
          home.select(undefined);
        });
        await page.waitForTimeout(250);
        const col = await page.locator('.inbox-col').boundingBox();
        const chip = await page.locator('#signal').boundingBox();
        if (!col || !chip) throw new Error('no chip');
        const top = Math.max(0, chip.y - 12);
        await page.screenshot({ path: path.join(OUT, `chip-${state}-${scheme}-${width}.png`), clip: { x: col.x, y: top, width: col.width, height: Math.min(260, 900 - top) } });
        await page.locator('#signal .sig-chip').click();
        await page.locator('.modal.signal').waitFor();
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(OUT, `card-${state}-${scheme}-${width}.png`) });
        if (width < 600 && (await page.evaluate(() => document.documentElement.scrollWidth)) > width) ((failed = true), console.error(`${state} ${scheme}: the phone scrolls sideways`));
        await page.keyboard.press('Escape');
        await page.locator('.modal.signal').waitFor({ state: 'detached' });
      }
    }
    console.log(`shot ${state}`);
  }

  await wait('no-goal');
  await shoot('no-goal');
  await send({ t: 'mission.milestone', op: 'add', title: 'Auth rewrite', issues: [1, 2, 3, 4, 5, 6, 7, 8, 9], due: day(30) });
  await wait('on-track');
  await shoot('on-track');
  mkdirSync(path.join(ws.repo, '.rundown'), { recursive: true });
  writeFileSync(
    path.join(ws.repo, '.rundown', 'rundown.json'),
    JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), project: { name: 'demo' }, parts: [], milestones: [], nextStep: { text: 'Wire the refresh endpoint', why: '' }, decisions: [{ id: 'D1', question: 'JWT or opaque tokens?', options: ['JWT', 'Opaque'], default: 'JWT', raised: day(-2) }] }),
  );
  await page.reload();
  await wait('at-risk');
  await shoot('at-risk');
  const id = await page.evaluate(() => (window as any).__lite.store.mission.milestones[0].id as string);
  await send({ t: 'mission.milestone', op: 'update', id, due: day(-1) });
  await wait('off-track');
  await shoot('off-track');
} finally {
  await browser.close();
  office.shutdown();
  try {
    execFileSync('pkill', ['-f', path.join(root, 'office')]);
  } catch {
    // none left
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
console.log(`into ${OUT}`);
process.exit(failed ? 1 : 0);
