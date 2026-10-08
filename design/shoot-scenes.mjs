// Shoots the landing page's scenes (dist/site) at chosen points of their progress, for review while
// building them: a pinned section at several scroll depths through its track, a played or view-linked
// one at moments after it comes into view.
//
//   npm run build:site && node design/shoot-scenes.mjs <out dir> [--port 4692] [--only funnel,loop]
//        [--width 1440 --height 900] [--light] [--phone] [--endpoint]
//
// It serves the build on 127.0.0.1 itself and stops when done.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../site/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, d) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : d);
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--light', '--phone', '--endpoint'].includes(args[i - 1]))) ?? path.join(ROOT, 'design/shots/landing/scenes'));
const phone = args.includes('--phone');
const width = Number(opt('width', phone ? 390 : 1440));
const height = Number(opt('height', phone ? 844 : 900));
const scheme = args.includes('--light') ? 'light' : 'dark';
const only = (opt('only', '') || '').split(',').filter(Boolean);
const port = Number(opt('port', 4692));
const site = path.resolve(opt('site', path.join(ROOT, 'dist', 'site')));
mkdirSync(out, { recursive: true });

/** Where to look in each scene: progress points through a pinned track, or ms after it shows. */
const PLAN = {
  funnel: { pin: [0.02, 0.2, 0.4, 0.58, 0.68, 0.78, 0.9, 1] },
  problem: { pin: [0.05, 0.2, 0.36, 0.48, 0.62, 0.78, 0.9, 0.97, 1] },
  loop: { pin: [0.04, 0.1, 0.16, 0.22, 0.32, 0.42, 0.48, 0.56, 0.64, 0.72, 0.8, 0.9, 1] },
  why: { after: [300, 900, 1600, 2600] },
  yours: { after: [400, 1500, 3000, 5000, 7000] },
  phone: { after: [300, 1200, 2400, 3600, 5200] },
  numbers: { view: [0.2, 0.5, 0.8, 1, 1.3] },
  labs: { view: [0.1, 0.4, 0.7, 1, 1.4], settle: 2500 },
  proof: { view: [0.2, 0.6, 1, 1.4], settle: 3000 },
  teams: { after: [300, 1000, 2000] },
  end: { view: [0.3, 0.7, 1.2] },
};

const { server, url } = await serve(site, port);
const browser = await chromium.launch({ headless: true });
const errors = [];
const shots = [];
try {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (args.includes('--endpoint')) await ctx.route('https://wait.example.eu/**', (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }, body: '{}' }));
  await page.goto(url, { waitUntil: 'load' });
  await page.keyboard.press('Shift');
  await page.waitForTimeout(600);
  const tag = `${phone ? 'phone' : width}-${scheme}`;
  for (const [id, plan] of Object.entries(PLAN)) {
    if (only.length && !only.includes(id)) continue;
    const has = await page.evaluate((sid) => !!document.getElementById(sid), id);
    if (!has) continue;
    // Bring it near so its scene mounts, then step through.
    await page.evaluate((sid) => document.getElementById(sid).scrollIntoView({ block: 'start' }), id);
    await page.waitForTimeout(500);
    const mode = await page.evaluate((sid) => document.querySelector(`#${sid} .staged`)?.dataset.mode ?? 'none', id);
    if (plan.pin && mode === 'pin') {
      for (const p of plan.pin) {
        await page.evaluate(([sid, pp]) => {
          const t = document.querySelector(`#${sid} .track`);
          const top = t.getBoundingClientRect().top + scrollY;
          scrollTo(0, top + pp * (t.offsetHeight - innerHeight));
        }, [id, p]);
        await page.waitForTimeout(900);
        const f = path.join(out, `${tag}-${id}-p${String(Math.round(p * 100)).padStart(3, '0')}.png`);
        await page.screenshot({ path: f });
        shots.push(f);
      }
    } else if (plan.view) {
      for (const v of plan.view) {
        // v: how far the section's top has risen, in viewports from the bottom.
        await page.evaluate(([sid, vv]) => {
          const el = document.getElementById(sid);
          const top = el.getBoundingClientRect().top + scrollY;
          scrollTo(0, top - innerHeight + vv * innerHeight);
        }, [id, v]);
        await page.waitForTimeout(plan.settle && v >= 1 ? plan.settle : 900);
        const f = path.join(out, `${tag}-${id}-v${String(Math.round(v * 100)).padStart(3, '0')}.png`);
        await page.screenshot({ path: f });
        shots.push(f);
      }
    } else {
      const steps = plan.after ?? [300, 1500, 3000, 4500, 6000];
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.evaluate((sid) => {
        const el = document.getElementById(sid);
        const t = el.querySelector('.track') ?? el;
        t.scrollIntoView({ block: 'start' });
        scrollBy(0, -60);
      }, id);
      let at = 0;
      for (const ms of steps) {
        await page.waitForTimeout(ms - at);
        at = ms;
        const f = path.join(out, `${tag}-${id}-t${String(ms).padStart(5, '0')}.png`);
        await page.screenshot({ path: f });
        shots.push(f);
      }
    }
  }
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
writeFileSync(path.join(out, `scenes-${phone ? 'phone' : width}-${scheme}.json`), JSON.stringify({ errors, shots }, null, 2));
console.log(JSON.stringify({ errors, shots: shots.map((s) => path.basename(s)) }, null, 2));
