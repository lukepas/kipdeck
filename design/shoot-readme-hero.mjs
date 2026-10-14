// The README's hero: the inbox at 1440x900 from the built office's `--demo`, with numbered notes on
// the four sections and the top bar's figures, so a first look says what each part is. The notes are
// drawn over the page in the browser just before the shot; the page itself is not changed.
//
//   npm run build && node design/shoot-readme-hero.mjs [out.png] [--port 5410] [--plain]
//
// Writes docs/img/inbox-annotated.png by default. --plain leaves the notes out. It starts its own
// office with a throwaway HOME and password, and stops it (and its demo agents) when done.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') ?? path.join(ROOT, 'docs', 'img', 'inbox-annotated.png'));
const PORT = Number(value('--port') ?? 5410);
const PASSWORD = 'hero-' + Math.random().toString(36).slice(2, 8);
mkdirSync(path.dirname(out), { recursive: true });

const home = mkdtempSync(path.join(tmpdir(), 'hero-home-'));
const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD], {
  env: { ...process.env, HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
function stop() {
  try {
    // SIGINT: the office stops its agents and deletes the demo's temporary repository.
    process.kill(-child.pid, 'SIGINT');
  } catch {
    // gone
  }
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {
    // not yet
  }
  if (i > 100) throw new Error('office did not start:\n' + log);
  await wait(300);
}

/** Numbered notes over the page: each points at an element, with a short line of what it is. */
function annotate() {
  const notes = [
    ['.hb-pulse', 'Who waits on you, and for how long', 'below'],
    ['.hb-fleet', 'Pause every agent at once', 'below'],
    ['.sec-needs-you', 'Needs you: a question or a permission', 'right'],
    ['.sec-review', 'To review: finished work, read and merge', 'right'],
    ['.sec-working', 'Working: nothing to decide', 'right'],
    ['.sec-idle', 'Idle: no task, asleep, merged or snoozed', 'right'],
  ];
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;font:600 13px/1.3 system-ui,sans-serif';
  let n = 0;
  for (const [sel, text, side] of notes) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    n++;
    const ring = document.createElement('div');
    ring.style.cssText = `position:absolute;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:2px solid #e8590c;border-radius:8px`;
    const tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;display:flex;gap:6px;align-items:center;padding:4px 9px 4px 4px;border-radius:999px;background:#1f1d1a;color:#fff;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.25)';
    const dot = document.createElement('span');
    dot.textContent = String(n);
    dot.style.cssText = 'display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#e8590c;color:#fff;font-size:12px';
    tag.append(dot, document.createTextNode(text));
    if (side === 'below') {
      tag.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 340))}px`;
      tag.style.top = `${r.bottom + 8}px`;
    } else {
      tag.style.left = `${r.left + Math.min(r.width, 420) - 8}px`;
      tag.style.top = `${r.top + 4}px`;
      tag.style.transform = 'translateX(-100%)';
    }
    layer.append(ring, tag);
  }
  document.body.append(layer);
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo Lead', color: '#4FA3A5' }));
      // Idle open, so all four sections are in the shot.
      localStorage.setItem('kipdeck.idle-open', '1');
    } catch {
      // storage blocked
    }
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  if (status !== 200) throw new Error('login failed ' + status);
  await page.goto(`${base}/`);
  await page.locator('.sec-needs-you .row').first().waitFor({ timeout: 60_000 });
  await page.locator('.sec-review .row').first().waitFor({ timeout: 60_000 });
  await page.locator('.sec-working .row').first().waitFor({ timeout: 60_000 }).catch(() => {});
  await wait(1500);
  await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
  if (!flag('--plain')) await page.evaluate(annotate);
  await page.screenshot({ path: out });
  console.log('wrote', path.relative(process.cwd(), out));
} finally {
  await browser.close();
  stop();
  await wait(500);
  rmSync(home, { recursive: true, force: true });
}
