// The Relay Beacon's shots (features/relay): starts the built office on a spare port with a throwaway
// home, password and project, deploys a calm crew (everyone at work, nobody asking), flies six sister
// decks (as design/perf-probe.mjs does) so the rings carry the fleet's units, lights a few of the
// ledger's segments, and saves the beacon from the captain's chair, from the chair turned to starboard,
// out of the starboard ports, from the lounge's stool and from the Overview, on the GPU (ANGLE Metal on
// a Mac). SHOOT_CLIP=1 adds a 12 s clip from the chair turned to starboard: a deploy, a merge, a payout,
// and the jump (spool, streak away, drop back in), as <name>-clip.mp4. Always stops the office (and its
// terminals) at the end.
//
//   npm run build && SHOOT_LIGHT=night SHOOT_QUALITY=high node design/shoot-relay.mjs stellar/build
//
// SHOOT_LIGHT night|day (default night). SHOOT_QUALITY high|medium|low (default high). SHOOT_PORT
// (default 4686). SHOOT_ONLY=conn,starboard,... picks shots. SHOOT_RELAY=off switches the beacon off
// (Settings > Bridge > Life) for a before shot. SHOOT_GIVEWAY=1 puts a unit on a question first.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'stellar/scratch';
const OUT = path.join(ROOT, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4686);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const LIGHT = process.env.SHOOT_LIGHT ?? 'night';
const QUALITY = process.env.SHOOT_QUALITY ?? 'high';
const ONLY = process.env.SHOOT_ONLY ? new Set(process.env.SHOOT_ONLY.split(',')) : null;
const RELAY_ON = process.env.SHOOT_RELAY !== 'off';
const NAME = `${LIGHT}-${QUALITY}${RELAY_ON ? '' : '-off'}${process.env.SHOOT_GIVEWAY ? '-giveway' : ''}`;
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const want = (s) => !ONLY || ONLY.has(s);

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-relay-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// The same stand-in for Claude Code as design/shoot-interior.mjs: its state comes from a word in its prompt.
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

const TASKS = [
  ['desk-1', 'Pick the session store for the auth rewrite'],
  ['desk-2', `${process.env.SHOOT_GIVEWAY ? '[ask] ' : ''}Migrate the payments webhook to the new queue`],
  ['desk-3', 'Publish the SDK release candidate'],
  ['desk-5', 'Port the settings page to the new form kit'],
  ['desk-6', '[done] Fix flaky checkout e2e'],
  ['desk-9', 'Add rate limits to the public API'],
  ['desk-10', 'Write the onboarding docs for devnet bounties'],
  ['desk-11', 'Bump the Anchor toolchain'],
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
}, Number(process.env.SHOOT_TIMEOUT ?? 300_000));

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

/** Runs in the page: six sister decks (as the perf probe flies them), kept on the store as the server's own lists come in. */
function seedFleet() {
  const s = window.__office.store;
  const sisters = [
    ['billing-api', 7, 5],
    ['web-console', 3, 2],
    ['mobile-app', 11, 8],
    ['docs-site', 2, 1],
    ['data-pipeline', 5, 3],
    ['infra', 1, 0],
  ].map(([name, workers, busy], i) => ({ id: `sister-${i}`, name, repo: `acme/${name}`, dir: `/tmp/${name}`, palette: i, addedBy: 'Tess', addedAt: i + 1, workers, busy, waiting: 0, people: 0, wing: 0 }));
  const put = () => {
    if (s.floors.some((f) => f.id.startsWith('sister-'))) return;
    s.floors = [...s.floors, ...sisters];
    s.emit('floors');
  };
  put();
  setInterval(put, 400);
}

/** The seated eye in the captain's chair, and a point toward the beacon from it (bearing 40 degrees to starboard, 5 up). */
const EYE = [0, 2.98, 11];
const toward = (from, bearing, up) => {
  const b = (bearing * Math.PI) / 180;
  const e = (up * Math.PI) / 180;
  return [from[0] + 100 * Math.sin(b) * Math.cos(e), from[1] + 100 * Math.sin(e), from[2] - 100 * Math.cos(b) * Math.cos(e)];
};
const VANTAGES = {
  starboard: [EYE, toward(EYE, 24, 14)],
  'deck-fwd': [[7.5, 2.4, -1.5], toward([7.5, 2.4, -1.5], 18, 22)],
  lounge: [[2.45, 1.25, -4.2], toward([2.45, 1.25, -4.2], 26, 30)],
};

async function main() {
  await waitUp();
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const clipDir = process.env.SHOOT_CLIP ? mkdtempSync(path.join(tmpdir(), 'ugc-relay-clip-')) : null;
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: LIGHT === 'day' ? 'light' : 'dark',
      ...(clipDir ? { recordVideo: { dir: clipDir, size: { width: 1440, height: 900 } } } : {}),
    });
    const pageAt = Date.now();
    await context.addInitScript(
      ([light, quality, on]) => {
        try {
          const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
          const lifeParts = { destination: true, fleet: true, sorties: true, epithets: true, droid: true, relay: on };
          localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light, quality, lifeParts }));
          localStorage.setItem('agent-office.lite-declined', '1');
          if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
        } catch {
          // storage blocked
        }
      },
      [LIGHT, QUALITY, RELAY_ON],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 1500)));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(200);
    }
    await page.evaluate(seedFleet);
    await wait(9000);
    // Sat in the captain's chair, the conn taken, the toasts closed, nine payouts on the ledger ring.
    await page.evaluate(() => {
      const o = window.__office;
      const p = o.player;
      p.__update ??= p.update;
      const it = o.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
      p.sit({ key: 'conn:0', seatId: 'conn', x: it.x, y: it.y, z: it.z + 0.05, rotY: Math.PI, hips: it.hips ?? 0.48, out: 0.8 });
    });
    await wait(400);
    await page.evaluate(() => window.__world?.takeConn?.skip?.());
    await page.waitForFunction(() => window.__office.space.phase() === 'idle', null, { timeout: 60_000 }).catch(() => {});
    await page.evaluate(() => {
      for (let i = 0; i < 9; i++) window.__world?.relay?.play('payout');
    });
    await wait(4000);
    const clear = () =>
      page.evaluate(() => {
        document.getElementById('toasts')?.replaceChildren();
        document.querySelector('section.debrief button.close')?.click();
      });
    await clear();
    await wait(300);
    console.log(JSON.stringify({ relay: await page.evaluate(() => window.__world?.relay?.state()), tier: await page.evaluate(() => window.__office.quality.tier()) }));
    if (process.env.SHOOT_EVAL) console.log(JSON.stringify({ eval: await page.evaluate(process.env.SHOOT_EVAL) }));
    if (want('conn')) await page.screenshot({ path: path.join(OUT, `${NAME}-conn.png`) });
    const view = (from, to) =>
      page.evaluate(
        ([from, to]) => {
          const o = window.__office;
          o.player.update = (dt) => {
            o.player.__update.call(o.player, dt);
            o.camera.position.set(...from);
            o.camera.lookAt(...to);
          };
        },
        [from, to],
      );
    for (const [key, [from, to]] of Object.entries(VANTAGES)) {
      if (!want(key)) continue;
      await view(from, to);
      await wait(1500);
      await clear();
      if (process.env.SHOOT_EVAL2) console.log(JSON.stringify({ key, eval: await page.evaluate(process.env.SHOOT_EVAL2) }));
      await page.screenshot({ path: path.join(OUT, `${NAME}-${key}.png`) });
    }
    if (want('overview')) {
      await page.evaluate(() => {
        const o = window.__office;
        o.player.update = o.player.__update;
        o.overview.toggle(true);
      });
      await wait(2500);
      await clear();
      await page.screenshot({ path: path.join(OUT, `${NAME}-overview.png`) });
      await page.evaluate(() => window.__office.overview.toggle(false));
      await wait(500);
    }
    if (clipDir) {
      // 12 s from the chair turned to starboard: a deploy, a merge, a payout, then the jump.
      await view(...VANTAGES.starboard);
      await wait(1500);
      await clear();
      const start = Date.now();
      const at = (s) => wait(Math.max(0, start + s * 1000 - Date.now()));
      await at(0.4);
      await page.evaluate(() => window.__world.relay.play('deploy'));
      await at(0.8);
      await page.evaluate(() => window.__world.relay.play('merge'));
      await at(1.4);
      await page.evaluate(() => window.__world.relay.play('payout'));
      await at(3.2);
      await page.evaluate(() => window.__office.space.jump({ n: 3, title: 'Payments webhook', final: false }));
      for (let s = 4; s <= 12; s += 1) {
        await at(s);
        await clear();
      }
      await at(12.3);
      const offset = (start - pageAt) / 1000;
      const video = await page.video()?.path();
      await page.close();
      await context.close();
      if (video) {
        execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', offset.toFixed(2), '-i', video, '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '25', path.join(OUT, `${NAME}-clip.mp4`)]);
        console.log(JSON.stringify({ clip: `${NAME}-clip.mp4`, offset }));
      }
    }
    if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    clearTimeout(deadline);
  }
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
