// Shots of the units' callouts at each level of detail (src/client/features/workers/lod.ts): the
// Overview at zoom 0.8 (tabs), 1.6 (one line with what each is doing) and 3.0 (the three-line cards),
// the deck's framed Overview, a unit up close on foot, and a frame part way through a zoom's staggered
// pop-in. Starts the built office on a spare port with a throwaway home, password and project, deploys
// a crew of stand-in units (one waiting on you, one done), and always stops the office at the end.
//
//   npm run build && node design/shoot-callouts.mjs [out dir]
//   SHOOT_PORT=4731 (the default) picks the port; SHOOT_GPU=1 draws on the real GPU.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'design', 'shots', 'callout-lod'));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4731);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-callouts-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code: its prompt's [word] says which tool call it reports.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit "{\\"prompt\\":\\"$(echo "$last" | sed 's/\\[[a-z]*\\] //')\\"}"
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'; sleep 1; post Stop '{}' ;;
  *"[edit]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/x/src/client/world/worker.ts"}}' ;;
  *"[grep]"*) post PreToolUse '{"tool_name":"Grep","tool_input":{"pattern":"tierFor"}}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 600 ]; do echo "  ok $i"; i=$((i+1)); sleep 3; done
`,
);
chmodSync(agent, 0o755);

const CREW = [
  ['desk-1', '[edit] Migrate the payments webhook to the new queue'],
  ['desk-2', 'Fix flaky checkout e2e'],
  ['desk-3', '[ask] Pick the session store for the auth rewrite'],
  ['desk-4', '[grep] Add rate limits to the public API'],
  ['desk-5', '[done] Port the settings page to the new form kit'],
  ['desk-6', 'Cache the reputation index'],
  ['desk-9', '[edit] Tighten the CSP for the showcase'],
  ['desk-10', 'Write the onboarding docs'],
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
  const { chromium } = await import('playwright-core');
  const args = process.env.SHOOT_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ headless: true, args });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    await context.addInitScript(() => {
      try {
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
    for (const [deskId, prompt] of CREW) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await wait(9000);
    const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
    const tiers = () =>
      page.evaluate(() => {
        const o = window.__office;
        const half = o.overview.active() ? ` (half-height ${o.overview.camera.top.toFixed(1)} m)` : '';
        return [...o.workerViews.values()].map((v) => v.model.tier).join(',') + half;
      });

    // Up into the Overview, framed as the deck opens it.
    await page.evaluate(() => window.__office.overview.toggle(true));
    await wait(2500);
    await shot('deck-overview');
    console.log('deck-overview', await tiers());
    // Over pod A, then each zoom: the wheel all the way out to 0.75, then in to the zoom wanted.
    const centre = await page.evaluate(() => {
      const ps = [...window.__office.workerViews.values()].slice(0, 4).map((v) => v.model.where(v.model.root.position.clone()));
      return [ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.z, 0) / ps.length];
    });
    await page.evaluate(([x, z]) => window.__office.overview.flyTo(x, z), centre);
    await wait(2000);
    const zoomTo = (z) =>
      page.evaluate((z) => {
        const c = window.__office.renderer.domElement;
        c.dispatchEvent(new WheelEvent('wheel', { deltaY: 6000 }));
        c.dispatchEvent(new WheelEvent('wheel', { deltaY: -Math.log(z / 0.75) / 0.0015 }));
      }, z);
    for (const z of [0.8, 1.6, 3.0]) {
      await zoomTo(z);
      await wait(3500);
      await shot(`overview-zoom-${z.toFixed(1)}`);
      console.log(`zoom ${z}`, await tiers());
    }
    // Part way through a zoom's pop-in: out to 1.6 from 3.0, caught 120 ms in.
    await zoomTo(1.6);
    await wait(120);
    await shot('overview-stagger-120ms');
    console.log('stagger', await page.evaluate(() => [...window.__office.workerViews.values()].map((v) => v.model.tier).join(',')));
    await wait(1200);
    // On foot, a unit up close: the card with its clock ticking.
    await page.evaluate(() => window.__office.overview.toggle(false));
    const unitAt = await page.evaluate(() => {
      const o = window.__office;
      const e = o.store.roster.find((x) => x.deskId === 'desk-3' && x.floor === o.store.floor);
      const v = e && o.workerViews.get(e.id);
      const p = v.model.where(v.model.root.position.clone());
      return [p.x, p.y, p.z];
    });
    await page.evaluate(([x, y, z]) => {
      const o = window.__office;
      const p = o.player;
      const update = p.update;
      const len = Math.hypot(x, z);
      const k = (len + 2.6) / len;
      p.update = (dt) => {
        update.call(p, dt);
        o.camera.position.set(x * k, y + 1.9, z * k);
        o.camera.lookAt(x, y + 1.5, z);
      };
    }, unitAt);
    await wait(2500);
    await shot('walk-near');
    console.log('walk-near', await tiers());
    if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
    await context.close();
  } finally {
    await browser.close();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
