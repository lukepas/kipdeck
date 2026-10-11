// Rundown as it ships: the npm package carries the /rundown skill (skills/rundown/SKILL.md and
// README.md) and its bundled script (dist/rundown/rundown.mjs), `kipdeck rundown install` from an
// unpacked package puts all three into ~/.claude/skills/rundown/ of a throwaway HOME (a dry run writes
// nothing, a second run backs up what it replaces), and `kipdeck rundown <path>` writes a fixture
// repository's map with no Claude, kept out of git.
//
// The package is packed from a staged copy whose package.json has no scripts: npm 10 runs `prepare`
// (the whole build) on `npm pack` even with --ignore-scripts, which would rebuild dist/ under the
// other tests. The copy keeps the real `files` list, so what it packs is what the package ships.
// Skipped (not failed) when there is no build or it is older than its sources (npm run build).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INFERRED_NOTE } from '../src/shared/rundown/infer.js';
import { forgetGists, rundownGist } from '../src/server/signal/gist.js';
import { computeSignal } from '../src/shared/signal.js';
import { sampleRundown } from './support/rundown-sample.js';
import { bundleWhy } from './support/bundle.js';
import { makeRundownFixture } from './support/rundown-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const why =
  bundleWhy(path.join(ROOT, 'dist', 'rundown', 'rundown.mjs'), [path.join(ROOT, 'src', 'server', 'rundown'), path.join(ROOT, 'src', 'shared', 'rundown')], 'rundown script') ||
  bundleWhy(path.join(ROOT, 'dist', 'server', 'server', 'rundown', 'command.js'), [path.join(ROOT, 'src', 'server'), path.join(ROOT, 'src', 'shared')], 'server build');
const tmp = mkdtempSync(path.join(tmpdir(), 'rundown-ship-'));
const fx = makeRundownFixture();
after(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(fx.tmp, { recursive: true, force: true });
});

/** A copy of the package as `files` lists it, with no scripts to run (the client bundle stands in as one page). */
function stage(): string {
  const dir = path.join(tmp, 'stage');
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { files: string[]; scripts?: unknown };
  delete pkg.scripts;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const f of ['bin', 'skills', 'NOTICE', 'LICENSE', 'README.md', 'dist/rundown', 'dist/server']) cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  mkdirSync(path.join(dir, 'dist', 'public'), { recursive: true });
  writeFileSync(path.join(dir, 'dist', 'public', 'index.html'), '<!doctype html>');
  // A source file the package must not ship.
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'x.ts'), '');
  return dir;
}

let staged = '';
const npm = (args: string[], cwd: string) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, env: { ...process.env, npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' } });

test('the npm package ships the skill and its bundled script', (t) => {
  if (why) return t.skip(why);
  staged = stage();
  const [packed] = JSON.parse(npm(['pack', '--dry-run', '--json'], staged)) as { files: { path: string }[] }[];
  const files = packed.files.map((f) => f.path);
  for (const f of ['skills/rundown/SKILL.md', 'skills/rundown/README.md', 'dist/rundown/rundown.mjs', 'dist/server/server/rundown/command.js', 'dist/server/server/commands.js', 'bin/agent-office.js']) assert.ok(files.includes(f), `${f} is in the package`);
  assert.ok(!files.some((f) => f.startsWith('src/')), 'no sources');
  // The installed skill points at the script the installer puts beside it.
  assert.match(readFileSync(path.join(ROOT, 'skills', 'rundown', 'SKILL.md'), 'utf8'), /RUNDOWN=~\/\.claude\/skills\/rundown\/scripts\/rundown\.mjs/);
  assert.match(readFileSync(path.join(ROOT, 'skills', 'rundown', 'SKILL.md'), 'utf8'), /kipdeck rundown install/);
});

test('kipdeck rundown install, from the unpacked package, into a throwaway HOME', (t) => {
  if (why) return t.skip(why);
  staged ||= stage();
  const out = path.join(tmp, 'packed');
  mkdirSync(out, { recursive: true });
  npm(['pack', '--pack-destination', out], staged);
  const tarball = readdirSync(out).find((f) => f.endsWith('.tgz'))!;
  execFileSync('tar', ['-xzf', path.join(out, tarball), '-C', out]);
  const pkg = path.join(out, 'package');
  // Its dependencies, as npm would install them next to it.
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(pkg, 'node_modules'), 'dir');
  const home = path.join(tmp, 'home');
  mkdirSync(home);
  const run = (...args: string[]) => spawnSync(process.execPath, [path.join(pkg, 'bin', 'agent-office.js'), 'rundown', ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home }, timeout: 60_000 });
  const skillDir = path.join(home, '.claude', 'skills', 'rundown');

  const dry = run('install', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would install into ~\/\.claude\/skills\/rundown:\n {2}new: scripts\/rundown\.mjs, SKILL\.md, README\.md/);
  assert.equal(existsSync(path.join(home, '.claude')), false, 'a dry run writes nothing');

  const real = run('install');
  assert.equal(real.status, 0, real.stderr);
  assert.match(real.stdout, /Installed ~\/\.claude\/skills\/rundown/);
  for (const [rel, src] of [['scripts/rundown.mjs', 'dist/rundown/rundown.mjs'], ['SKILL.md', 'skills/rundown/SKILL.md'], ['README.md', 'skills/rundown/README.md']]) assert.ok(readFileSync(path.join(skillDir, rel)).equals(readFileSync(path.join(pkg, src))), rel);

  // A changed copy is backed up before it's replaced, and the installed script still runs.
  writeFileSync(path.join(skillDir, 'SKILL.md'), 'an edited copy\n');
  const again = run('install');
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /changed: SKILL\.md/);
  assert.match(again.stdout, /Backed up the old copy to ~\/\.claude\/backups\/rundown-\d{8}T\d{6}/);
  const backups = readdirSync(path.join(home, '.claude', 'backups'));
  assert.equal(readFileSync(path.join(home, '.claude', 'backups', backups[0], 'SKILL.md'), 'utf8'), 'an edited copy\n');
  // The bundled script alone finds the skill's files beside it in the package, too.
  const alone = spawnSync(process.execPath, [path.join(pkg, 'dist', 'rundown', 'rundown.mjs'), 'install', '--dry-run'], { encoding: 'utf8', env: { ...process.env, HOME: home }, timeout: 60_000 });
  assert.match(alone.stdout, /unchanged: scripts\/rundown\.mjs, SKILL\.md, README\.md/);
  const help = spawnSync(process.execPath, [path.join(skillDir, 'scripts', 'rundown.mjs'), 'help'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(help.status, 0);
});

test('kipdeck rundown <path> writes the map of a checkout with no Claude, kept out of git', async () => {
  const home = path.join(tmp, 'map-home');
  mkdirSync(home, { recursive: true });
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'src', 'server', 'cli.ts'), 'rundown', ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, HOME: home }, timeout: 60_000 });
  const first = run(fx.repo, '--no-gh');
  assert.equal(first.status, 0, first.stderr);
  const lines = first.stdout.trim().split('\n');
  assert.match(lines[0], /^Rundown: .*\/\.rundown\/rundown\.html$/);
  assert.match(first.stdout, /First rundown/);
  assert.match(first.stdout, /Parts: .*\[inferred\]/);
  // The same next step the office's window and Signal's card infer, and the parts in one line.
  assert.match(first.stdout, /^Next step: .+ \(inferred from the code\)$/m);
  assert.match(first.stdout, /^\d+ parts?(: |, all )/m);
  // The page says it too, not "Run /rundown for a suggestion".
  const page = readFileSync(path.join(fx.repo, '.rundown', 'map.html'), 'utf8');
  assert.doesNotMatch(page, /Run \/rundown for a suggestion/);
  assert.equal(lines.at(-1), INFERRED_NOTE);
  assert.ok(lines.length <= 12, `a short summary (${lines.length} lines)`);
  const out = path.join(fx.repo, '.rundown');
  for (const f of ['facts.json', 'rundown.json', 'state.json', 'rundown.html', 'map.html']) assert.ok(existsSync(path.join(out, f)), f);
  const r = JSON.parse(readFileSync(path.join(out, 'rundown.json'), 'utf8')) as { parts: { statusSource: string }[] };
  assert.ok(r.parts.length > 0 && r.parts.every((p) => p.statusSource === 'inferred'));
  assert.match(readFileSync(path.join(fx.repo, '.git', 'info', 'exclude'), 'utf8'), /^\/\.rundown\/$/m);
  assert.equal(existsSync(path.join(fx.repo, '.gitignore')), false);
  assert.equal(execFileSync('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '--', '.rundown'], { cwd: fx.repo, encoding: 'utf8' }), '');
  assert.equal(existsSync(fx.marker), false, 'nothing in the checkout ran');
  // A second run refreshes it, and says what changed.
  const second = run(fx.repo, '--no-gh');
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Nothing changed since the last rundown|Changed since/);
  // Signal reads that file as no judgement at all: the office's own map still stands in, with its parts and next thing.
  forgetGists();
  const gist = await rundownGist('ship', fx.repo, sampleRundown());
  assert.equal(gist?.source, 'inferred');
  assert.equal(gist?.parts?.total, 4);
  const s = computeSignal({ now: Date.now(), goal: null, burn: null, rundown: gist, ranked: [], merges: { week: 0, before: 0 } });
  assert.equal(s.inferred, true);
  assert.ok(s.parts && s.next, 'a parts line and a next thing');
  // A folder outside git: refused, nothing written into it.
  const nogit = path.join(tmp, 'nogit');
  mkdirSync(nogit, { recursive: true });
  const outside = run(nogit, '--no-gh');
  assert.equal(outside.status, 2);
  assert.match(outside.stderr, /is not inside a git checkout/);
  assert.equal(existsSync(path.join(nogit, '.rundown')), false);
  // A folder that isn't there: exit 2, nothing made.
  const missing = run(path.join(tmp, 'no-such'), '--no-gh');
  assert.equal(missing.status, 2);
  assert.equal(existsSync(path.join(tmp, 'no-such')), false);
  assert.equal(run('--bogus').status, 2);
});
