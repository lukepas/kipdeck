// N in Walk, shot: a unit that needs you has glided to its pod's ready line, and N flies you to it
// there (features/waiting/frame.ts), framed, with the target-acquire bracket closing in on it
// (features/waiting/acquire.ts). Shoots the view before, mid-flight, as the bracket closes, as it
// holds and after it has gone, under full and reduced motion, and checks you land 2.2 m from the unit
// facing it, the crosshair lands on it and the bracket shows then goes. It starts the built office on
// a spare port with a throwaway home, password and project, and always stops it.
//
//   npm run build && node design/shoot-nframe.mjs
//
// NFRAME_PORT picks the port (default 4741), NFRAME_OUT the folder. Exits 1 if a check fails.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = HERE;
const PORT = Number(process.env.NFRAME_PORT ?? 4741);
const OUT = process.env.NFRAME_OUT ?? path.join(HERE, 'design', 'out', 'nframe');
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-interior-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// The same stand-in for Claude Code as design/shoot.mjs: its state comes from a word in its prompt.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit "{\\"prompt\\":\\"$(echo "$last" | sed 's/\\[[a-z]*\\] //')\\"}"
echo "> $last"
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'; sleep 1; post Stop '{}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 120 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 5; done
`,
);
chmodSync(agent, 0o755);

// A busy crew, every unit at work but two done, and desk-2's asking you (the need fixture).
const TASKS = [
  ['desk-1', 'Pick the session store for the auth rewrite'],
  ['desk-2', '[ask] Migrate the payments webhook to the new queue'],
  ['desk-3', 'Publish the SDK release candidate'],
  ['desk-5', 'Port the settings page to the new form kit'],
  ['desk-6', '[done] Fix flaky checkout e2e'],
  ['desk-9', 'Add rate limits to the public API'],
  ['desk-10', 'Write the onboarding docs for devnet bounties'],
  ['desk-11', 'Bump the Anchor toolchain'],
  ['desk-13', '[done] Tighten the CSP for the showcase'],
  ['desk-14', 'Cache the reputation index'],
  ['desk-15', 'Trim the bundle under 300 kB'],
];

const office = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), project, '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD, '--agent', agent, '--home', path.join(home, '.agent-office')], {
  env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
office.stdout.on('data', (d) => (log += d));
office.stderr.on('data', (d) => (log += d));
function stop() {
  try {
    process.kill(-office.pid, 'SIGTERM');
  } catch {
    // gone
  }
  try {
    execFileSync('pkill', ['-f', agent]);
  } catch {
    // none left
  }
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));
const deadline = setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, Number(process.env.NFRAME_TIMEOUT ?? 240_000));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/login`)).ok) return;
    } catch {
      // not yet
    }
    await wait(300);
  }
  throw new Error('office did not start:\n' + log);
}

async function main() {
  await waitUp();
  mkdirSync(OUT, { recursive: true });
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let failed = 0;
  const check = (ok, what) => {
    console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`);
    if (!ok) failed++;
  };
  try {
    for (const motion of ['full', 'reduced']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference' });
      await context.addInitScript(() => {
        try {
          localStorage.setItem('agent-office.settings', JSON.stringify({ lighting: 'night', quality: 'medium' }));
          localStorage.setItem('agent-office.lite-declined', '1');
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
        } catch {
          // storage blocked
        }
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/login`);
      await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
      await page.goto(`${base}/`, { waitUntil: 'commit' });
      await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
      if (motion === 'full') {
        for (const [deskId, prompt] of TASKS) {
          await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
          await wait(200);
        }
      }
      // desk-2's unit needs you: wait till it has glided off its console onto the ready line.
      const asker = await page.waitForFunction(
        () => {
          const o = window.__office;
          const w = [...o.store.workers.values()].find((x) => x.deskId === 'desk-2');
          const v = w && o.workerViews.get(w.id);
          if (!v || v.model.showing !== 'needs-you') return null;
          const at = v.model.where(v.model.root.position.clone());
          return Math.hypot(at.x, at.z) < 5 ? { id: w.id, x: at.x, z: at.z } : null;
        },
        null,
        { timeout: 60_000, polling: 250 },
      );
      const unit = await asker.jsonValue();
      console.log(JSON.stringify({ motion, unit }));
      await wait(1500);
      await page.evaluate(() => document.querySelector('section.debrief button.close')?.click());
      // Somewhere else on the deck first, looking aft: by the dais.
      await page.evaluate(() => {
        const p = window.__office.player;
        p.pos.set(6, 0, -6);
        p.vy = 0;
        p.camYaw = Math.PI;
      });
      await page.locator('#scene').click({ position: { x: 720, y: 450 } }).catch(() => {});
      await wait(800);
      const tag = motion === 'full' ? '' : '-reduced';
      await page.screenshot({ path: path.join(OUT, `0-before${tag}.png`) });
      await page.keyboard.press('KeyN');
      if (motion === 'full') {
        await wait(250);
        await page.screenshot({ path: path.join(OUT, `1-flying${tag}.png`) });
        await wait(560);
        await page.screenshot({ path: path.join(OUT, `2-closing${tag}.png`) });
      } else {
        await wait(150);
      }
      await wait(250);
      const landed = await page.evaluate((id) => {
        const o = window.__office;
        const v = o.workerViews.get(id);
        const at = v.model.where(v.model.root.position.clone());
        const p = o.player;
        const cam = o.camera;
        const dir = cam.position.clone();
        cam.getWorldDirection(dir);
        const to = { x: at.x - cam.position.x, z: at.z - cam.position.z };
        const n = Math.hypot(to.x, to.z);
        const err = (Math.acos(Math.max(-1, Math.min(1, (dir.x * to.x + dir.z * to.z) / (n * Math.hypot(dir.x, dir.z))))) * 180) / Math.PI;
        const aimed = window.__world.waiting.aimed();
        const box = document.querySelector('.acquire')?.getBoundingClientRect();
        return {
          pos: [p.pos.x, p.pos.z].map((v) => +v.toFixed(2)),
          dist: +Math.hypot(p.pos.x - at.x, p.pos.z - at.z).toFixed(2),
          aimErrorDeg: +err.toFixed(1),
          bracket: window.__world.waiting.bracket(),
          box: box ? [box.x, box.y, box.width, box.height].map((v) => Math.round(v)) : null,
          aimed: aimed ? { kind: aimed.kind, deskId: aimed.deskId } : null,
        };
      }, unit.id);
      console.log(JSON.stringify({ motion, landed }));
      await page.screenshot({ path: path.join(OUT, `3-held${tag}.png`) });
      check(Math.abs(landed.dist - 2.2) < 0.3, `${motion}: N put you 2.2 m from the unit where it stands`);
      check(landed.aimErrorDeg < 5, `${motion}: the view faces the unit`);
      check(landed.bracket, `${motion}: the bracket shows`);
      check(!!landed.box && Math.abs(landed.box[0] + landed.box[2] / 2 - 720) < 160, `${motion}: the bracket (the unit) is near the middle of the view`);
      check(landed.aimed?.deskId === 'desk-2', `${motion}: the crosshair lands on the unit (its desk's actions in the hint)`);
      await wait(motion === 'full' ? 1400 : 700);
      check(!(await page.evaluate(() => window.__world.waiting.bracket())), `${motion}: the bracket has gone`);
      await page.screenshot({ path: path.join(OUT, `4-after${tag}.png`) });
      if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
      check(!errors.length, `${motion}: no page errors`);
      await context.close();
    }
  } finally {
    await browser.close();
    clearTimeout(deadline);
  }
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    stop();
    process.exit();
  });
