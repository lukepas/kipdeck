// `kipdeck rundown` and the office's first map, as units: what the command line asks for, the command
// registry it's found through, where the package's skill files are, and RundownService.prime with
// first.ts (once per floor, in the background, only with the lab on and never in the read-only demo),
// and Signal's gist pushed to everyone when the office's map of a floor moves on.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, commandOf } from '../src/server/commands.js';
import { packagedFiles, packageRoot, parseRundownArgs, RUNDOWN_HELP } from '../src/server/rundown/command.js';
import { packagedSkill } from '../src/server/rundown/cli.js';
import { primeFloors, startFirstMaps } from '../src/server/rundown/first.js';
import { RundownService } from '../src/server/rundown/service.js';
import { pushGist } from '../src/server/signal/push.js';
import { forgetGists } from '../src/server/signal/gist.js';
import { Labs } from '../src/server/labs.js';
import { dispatch } from '../src/server/ws/dispatch.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { Floor } from '../src/server/floor.js';
import type { ServerMsg } from '../src/shared/protocol.js';
import { makeRundownFixture } from './support/rundown-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(tmpdir(), 'rundown-command-'));
const fx = makeRundownFixture();
after(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(fx.tmp, { recursive: true, force: true });
});

test('kipdeck rundown: a path, --open, --no-gh, install with --dry-run, help, and what it refuses', () => {
  assert.deepEqual(parseRundownArgs([]), { cmd: 'map', open: false, gh: true });
  assert.deepEqual(parseRundownArgs(['~/code/app', '--open', '--no-gh']), { cmd: 'map', path: '~/code/app', open: true, gh: false });
  assert.deepEqual(parseRundownArgs(['install']), { cmd: 'install', dryRun: false });
  assert.deepEqual(parseRundownArgs(['install', '--dry-run']), { cmd: 'install', dryRun: true });
  assert.deepEqual(parseRundownArgs(['install', '-n']), { cmd: 'install', dryRun: true });
  assert.deepEqual(parseRundownArgs(['--help']), { cmd: 'help' });
  assert.deepEqual(parseRundownArgs(['install', '-h']), { cmd: 'help' });
  assert.equal(parseRundownArgs(['--force']).cmd, 'error');
  assert.equal(parseRundownArgs(['install', '--force']).cmd, 'error');
  assert.equal(parseRundownArgs(['a', 'b']).cmd, 'error');
  assert.match(RUNDOWN_HELP, /kipdeck rundown install \[--dry-run\]/);
  assert.match(RUNDOWN_HELP, /\.git\/info\/exclude/);
});

test('the command registry: rundown is one of the commands, and only a command it lists runs', () => {
  for (const name of ['prune', 'accounts', 'setup', 'tunnel', 'attach', 'open', 'rundown']) assert.equal(typeof COMMANDS[name], 'function', name);
  assert.equal(commandOf(['rundown', 'install']), COMMANDS.rundown);
  assert.equal(commandOf([]), undefined);
  assert.equal(commandOf(['--port', '4700']), undefined);
  assert.equal(commandOf(['constructor']), undefined, 'not a key of every object');
  assert.equal(commandOf(['~/code/app']), undefined);
});

test("the package's skill files: found from the source and from the bundled script, and what's missing said", () => {
  assert.equal(packageRoot(), ROOT);
  assert.equal(packageRoot(path.join(tmp, 'nowhere', 'x.js')), null);
  const empty = path.join(tmp, 'empty-pkg');
  mkdirSync(empty);
  assert.match((packagedFiles(empty) as { missing: string }).missing, /rundown\.mjs \(run npm run build:rundown/);
  // The bundled script finds SKILL.md and README.md two folders up, as the package lays them out...
  const pkg = path.join(tmp, 'pkg');
  mkdirSync(path.join(pkg, 'dist', 'rundown'), { recursive: true });
  mkdirSync(path.join(pkg, 'skills', 'rundown'), { recursive: true });
  writeFileSync(path.join(pkg, 'dist', 'rundown', 'rundown.mjs'), '');
  writeFileSync(path.join(pkg, 'skills', 'rundown', 'SKILL.md'), '');
  assert.deepEqual(packagedSkill(path.join(pkg, 'dist', 'rundown', 'rundown.mjs')), { skill: path.join(pkg, 'skills', 'rundown', 'SKILL.md') });
  writeFileSync(path.join(pkg, 'skills', 'rundown', 'README.md'), '');
  assert.equal(packagedSkill(path.join(pkg, 'dist', 'rundown', 'rundown.mjs'))?.readme, path.join(pkg, 'skills', 'rundown', 'README.md'));
  assert.equal((packagedFiles(pkg) as { script: string }).script, path.join(pkg, 'dist', 'rundown', 'rundown.mjs'));
  // ...and the installed copy, with none beside it, finds none.
  assert.equal(packagedSkill(path.join(tmp, '.claude', 'skills', 'rundown', 'scripts', 'rundown.mjs')), null);
});

const floor = { id: 'f1', dir: fx.repo, def: { id: 'f1', name: 'Fixture' }, workers: { list: () => [] }, github: { pulls: { items: [], fetchedAt: 0 }, issues: { items: [], fetchedAt: 0 } }, mission: { state: () => ({ milestones: [], active: undefined }) }, timeline: { list: () => ({ events: [] }) } } as unknown as Floor;

function office(readOnly = false) {
  const sent: ServerMsg[] = [];
  const broadcast: ServerMsg[] = [];
  const computed: string[] = [];
  const labs = new Labs(undefined);
  const rundown = new RundownService({ floor: (id) => (id === 'f1' ? floor : undefined), send: (_ids, msg) => sent.push(msg), computed: (id) => computed.push(id) });
  const ctx = {
    cfg: { demo: readOnly ? { readOnly: true } : undefined },
    labs,
    rundown,
    floors: new Map([['f1', floor]]),
    broadcast: (msg: ServerMsg) => broadcast.push(msg),
    meOf: () => ({ admin: true }),
    warn: () => {},
  } as unknown as Ctx;
  return { ctx, labs, rundown, sent, broadcast, computed };
}

async function until(fn: () => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test("a floor's first map: once, in the background, with nobody watching, and kept in memory", async () => {
  const o = office();
  assert.equal(o.rundown.current('f1'), null);
  assert.equal(o.rundown.prime('nope'), false, 'no such floor');
  assert.equal(o.rundown.prime('f1', 0), true);
  assert.equal(o.rundown.prime('f1', 0), false, 'once per floor');
  await until(() => o.rundown.current('f1') !== null);
  const r = o.rundown.current('f1')!;
  assert.ok(r.parts.length > 0);
  assert.ok(r.parts.every((p) => p.statusSource === 'inferred'));
  assert.deepEqual(o.computed, ['f1']);
  assert.deepEqual(o.sent, [], 'nobody watched, so nobody was sent the map');
  // The window opened now hears the map at once, not "computing".
  const c = { id: 'c1' } as Client;
  o.rundown.watch(c.id, 'f1');
  const first = o.sent[0] as Extract<ServerMsg, { t: 'rundown.state' }>;
  assert.equal(first.computing, false);
  assert.equal(first.rundown?.generatedAt, r.generatedAt);
  o.rundown.close();
});

test('first maps only with the Rundown lab on, never in the read-only demo, and again when the lab comes back on', async () => {
  const off = office();
  off.labs.set({ rundown: false }, 'test');
  assert.equal(primeFloors(off.ctx), 0);
  const ro = office(true);
  assert.equal(primeFloors(ro.ctx), 0, 'the read-only demo has no rundown');
  assert.equal(startFirstMaps(ro.ctx)(), undefined);
  // An admin switches it back on: every floor's first map is asked for.
  const c = { id: 'c1', peer: { name: 'Ada' }, accountId: 'a' } as unknown as Client;
  dispatch(off.ctx, c, { t: 'labs.set', patch: { rundown: true } });
  await until(() => off.rundown.current('f1') !== null);
  assert.equal(primeFloors(off.ctx), 0, 'already asked for');
  // The delay holds it back, and closing the service (the office shutting down) cancels it.
  const later = office();
  assert.equal(primeFloors(later.ctx), 1);
  later.rundown.close();
  await new Promise((r) => setTimeout(r, 2_300));
  assert.equal(later.rundown.current('f1'), null);
  off.rundown.close();
  ro.rundown.close();
});

test("Signal's gist goes to everyone when the office's map moves on, once per change, never in the read-only demo", async () => {
  forgetGists();
  const o = office();
  o.rundown.prime('f1', 0);
  await until(() => o.rundown.current('f1') !== null);
  assert.equal(await pushGist(o.ctx, 'f1'), true);
  const msg = o.broadcast[0] as Extract<ServerMsg, { t: 'signal.gist' }>;
  assert.equal(msg.t, 'signal.gist');
  assert.equal(msg.gist.rundown?.source, 'inferred');
  assert.ok((msg.gist.rundown?.parts?.total ?? 0) > 0);
  assert.equal(await pushGist(o.ctx, 'f1'), false, 'the same gist is not sent twice');
  assert.equal(await pushGist(o.ctx, 'nope'), false);
  const ro = office(true);
  assert.equal(await pushGist(ro.ctx, 'f1'), false);
  assert.deepEqual(ro.broadcast, []);
  o.rundown.close();
  ro.rundown.close();
});
