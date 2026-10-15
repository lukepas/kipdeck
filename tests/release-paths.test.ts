// The Release workflow is the only check that builds on a pull request, and it runs only when a changed
// file matches its `paths`. So every file `npm run build` (and so `prepare`, which a GitHub install
// runs) reads, and every file the packed release ships from the source tree, has to match them, or a
// change to it merges green and breaks the next install. The replay demo is no install's business: it
// stays out of `build` and gets a step of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { name: string; bin: Record<string, string>; files: string[]; scripts: Record<string, string> };
const workflow = readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');

/** The `paths` list under an event (`push:` or `pull_request:`) in the workflow's `on:`. */
function pathsOf(event: string): string[] {
  const block = workflow.split(/\n(?=\S)/).find((b) => b.startsWith('on:'));
  assert.ok(block, 'release.yml has an on: block');
  const lines = block.split('\n');
  const start = lines.findIndex((l) => l.trim() === `${event}:`);
  assert.ok(start >= 0, `release.yml runs on ${event}`);
  const out: string[] = [];
  let inPaths = false;
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}\S/.test(line)) break;
    if (line.trim() === 'paths:') inPaths = true;
    else if (inPaths && /^\s+- /.test(line)) out.push(line.trim().slice(2).replace(/^'|'$/g, ''));
    else if (inPaths) inPaths = false;
  }
  return out;
}

/** GitHub's path filter: `**` crosses folders, `*` doesn't. */
function matches(file: string, glob: string): boolean {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*');
  return new RegExp(`^${re}$`).test(file);
}

/** The scripts `build` runs, followed through `npm run`. */
function scriptsUnder(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const body = pkg.scripts[name] ?? '';
  return [body, ...[...body.matchAll(/npm run ([\w:-]+)/g)].flatMap((m) => scriptsUnder(m[1], seen))];
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

/** What a build or the packed release reads from the tree, outside src/ (always covered). */
function inputs(): string[] {
  const configs = scriptsUnder('build')
    .join('\n')
    .match(/-c (\S+)/g)!
    .map((m) => m.slice(3));
  const replay = scriptsUnder('build:replay').join('\n').match(/-c (\S+)/)![1];
  const shipped = pkg.files.filter((f) => !f.startsWith('dist/'));
  const under = (dir: string) => tracked.filter((f) => f === dir || f.startsWith(`${dir}/`));
  return [...new Set(['vite.config.ts', ...configs, replay, ...under('deploy/replay'), ...shipped.flatMap(under)])];
}

test('installs never build the replay demo', () => {
  const run = scriptsUnder('prepare').join('\n');
  assert.match(run, /npm run build\b/, 'prepare builds the app');
  assert.doesNotMatch(run, /build:replay|vite\.replay\.config/, 'prepare (npm run build) builds the replay demo, which no install uses');
  assert.ok(!pkg.files.some((f) => f.startsWith('dist/replay')), 'the package ships dist/replay');
});

test('the Release workflow builds the replay demo before the tests', () => {
  const build = workflow.indexOf('npm run build:replay');
  assert.ok(build >= 0, 'release.yml runs npm run build:replay');
  const tests = workflow.indexOf('run: npm run test:main');
  assert.ok(tests >= 0, 'release.yml runs npm run test:main');
  assert.ok(build < tests, 'release.yml builds the replay demo before the tests, so replay-e2e runs');
});

for (const event of ['push', 'pull_request']) {
  test(`every file the build and the release read sets off Release on ${event}`, () => {
    const globs = pathsOf(event);
    assert.ok(globs.includes('src/**'), `${event} paths cover src/`);
    const files = inputs();
    assert.ok(files.includes('vite.replay.config.ts') && files.includes('deploy/replay/vercel.json'), 'the inputs include the replay build');
    const missed = files.filter((f) => !globs.some((g) => matches(f, g)));
    assert.deepEqual(missed, [], `release.yml's ${event} paths miss these build inputs`);
  });
}

// The package was renamed (agent-office to kipdeck) and install.sh with it; the release steps kept the
// old tarball name and the old variables, which install.sh ignores, so Release could pack nothing and
// would have installed from the registry. These keep the steps on the names the package and script use.
test('the Release workflow packs whatever npm names the tarball and installs it with install.sh as it is now', () => {
  const install = readFileSync(path.join(root, 'install.sh'), 'utf8');
  // deploy/release/pack.mjs packs and takes whatever .tgz npm made, then names it kipdeck.tgz, the
  // asset the README's address and install.sh fetch.
  const pack = readFileSync(path.join(root, 'deploy/release/pack.mjs'), 'utf8');
  assert.match(workflow, /node deploy\/release\/pack\.mjs --version/, 'the pack step runs pack.mjs');
  assert.match(pack, /readdirSync\(dest\)\.filter\(\(f\) => f\.endsWith\('\.tgz'\)\)/, 'pack.mjs takes the tarball npm made, whatever its name');
  assert.ok(!/agent-office(-\$version)?\.tgz/.test(workflow + pack), 'no tarball name from before the rename');
  // Unique names: the Linux/macOS and the Windows smoke jobs set the same ones.
  const vars = [...new Set([...workflow.matchAll(/^\s+(KIPDECK_\w+|AGENT_OFFICE_\w+):/gm)].map((m) => m[1]))];
  assert.ok(vars.includes('KIPDECK_TARBALL'), 'the install step hands install.sh the packed tarball');
  for (const v of vars.filter((v) => v.startsWith('KIPDECK_'))) assert.ok(install.includes(`\${${v}`), `install.sh reads ${v}`);
  assert.deepEqual(vars.filter((v) => v.startsWith('AGENT_OFFICE_')), ['AGENT_OFFICE_HOME'], 'install.sh reads no AGENT_OFFICE_ variable; the office reads AGENT_OFFICE_HOME');
  assert.ok(pkg.bin.kipdeck && workflow.includes('"$RUNNER_TEMP/bin/kipdeck"'), 'the step starts the kipdeck command install.sh links');
  assert.ok(workflow.includes(`lib/node_modules/${pkg.name}/package.json`), 'the step checks the installed package version');
});
