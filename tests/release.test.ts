// The prebuilt first run: the Release workflow packs kipdeck.tgz (deploy/release/pack.mjs) and
// publishes it as a GitHub release asset on every main push, and every place that tells someone how to
// start Kipdeck (the README, the CLI help, install.sh, install.ps1, the landing page and its /get
// address) points at that one address, releases/latest/download/kipdeck.tgz, with npx github: as the
// fallback that builds from source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error a plain .mjs script with no types
import { ASSET, packRelease, releaseManifest } from '../deploy/release/pack.mjs';
import { RELEASE_ASSET, npxSpec } from '../site/npx.mjs';
// @ts-expect-error a plain .mjs script with no types
import { buildPage } from '../site/build.mjs';
import { FROM_SOURCE_COMMAND, INSTALL_COMMAND, NPX_SPEC, ON_NPM, RELEASE_TARBALL } from '../src/shared/demo.ts';
import { REPO_URL } from '../src/shared/copy.ts';
import { startedAs } from '../src/server/runcmd.ts';
import { BRANDS } from '../site/landing/brand.ts';

const ROOT = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const LATEST = 'https://github.com/zbagdzevicius/kipdeck/releases/latest/download/kipdeck.tgz';

test('one address for the newest release, the same in the app, the landing page and the packer', () => {
  assert.equal(RELEASE_TARBALL, LATEST);
  assert.equal(RELEASE_TARBALL, `${REPO_URL}/releases/latest/download/${ASSET}`);
  assert.equal(ASSET, RELEASE_ASSET);
  assert.equal(npxSpec(REPO_URL), RELEASE_TARBALL);
  assert.equal(npxSpec('https://github.com/example/agent-inbox.git'), 'https://github.com/example/agent-inbox/releases/latest/download/kipdeck.tgz');
  // A host with no release downloads runs the repository from git.
  assert.equal(npxSpec('https://git.example.eu/team/kipdeck/'), 'git+https://git.example.eu/team/kipdeck.git');
  if (!ON_NPM) assert.equal(NPX_SPEC, RELEASE_TARBALL);
  assert.equal(INSTALL_COMMAND, `npx ${NPX_SPEC}`);
  assert.equal(FROM_SOURCE_COMMAND, 'npx github:zbagdzevicius/kipdeck');
});

test('the README, the CLI help and both install scripts lead with the release and keep github: as the fallback', () => {
  const top = read('README.md').split('\n').slice(0, 20).join('\n');
  assert.ok(top.includes(`npx ${LATEST}`), 'the README opens with the release command');
  assert.ok(top.includes('npx github:zbagdzevicius/kipdeck'), 'and names the from-source fallback near it');
  // The CLI help ends with both (server/runcmd.ts, after the "started as" line).
  const help = startedAs({ root: '/opt/kipdeck', find: () => null, win: false, home: '/home/ada' });
  assert.ok(help.includes(`  ${INSTALL_COMMAND}\n`), help);
  assert.ok(help.includes(`  ${FROM_SOURCE_COMMAND}\n`), help);
  assert.ok(help.indexOf(INSTALL_COMMAND) < help.indexOf(FROM_SOURCE_COMMAND), 'the release first');
  for (const f of ['install.sh', 'install.ps1']) {
    const s = read(f);
    assert.ok(s.includes('/latest/download/kipdeck.tgz'), `${f} installs the newest release`);
    assert.ok(s.includes('/download/v'), `${f} installs a given release with KIPDECK_VERSION`);
    assert.ok(s.includes('npx github:zbagdzevicius/kipdeck'), `${f} prints the from-source fallback`);
    assert.doesNotMatch(s, /npm view|kipdeck@/, `${f} never asks the registry, which doesn't have it`);
  }
});

test('the landing site sends /get to the newest release, on Vercel and on hosts that read _redirects', () => {
  const vercel = JSON.parse(read('vercel.json')) as { redirects: { source: string; destination: string; permanent: boolean }[] };
  const get = vercel.redirects.find((r) => r.source === '/get');
  assert.ok(get, 'vercel.json has /get');
  assert.equal(get.destination, RELEASE_TARBALL);
  assert.equal(get.permanent, false, 'a temporary redirect, so nothing caches an old target');
  assert.equal(read('site/landing/public/_redirects').trim(), `/get ${RELEASE_TARBALL} 302`);
  // The page's start commands use that short address, the README's names it.
  assert.equal(BRANDS.kipdeck.get, 'https://kipdeck.com/get');
  assert.ok(read('README.md').includes(`npx ${BRANDS.kipdeck.get}`));
});

test('a moved repository moves the start commands once, even when its name begins with the old one', () => {
  const html = `<html data-repo="${REPO_URL}"><a data-link="repo" href="${REPO_URL}">Source</a><code>npx ${npxSpec(REPO_URL)} --demo</code></html>`;
  const moved = buildPage(html, { KIPDECK_REPO_URL: `${REPO_URL}-fork` });
  assert.ok(moved.includes(`<code>npx ${REPO_URL}-fork/releases/latest/download/kipdeck.tgz --demo</code>`), moved);
  assert.ok(moved.includes(`href="${REPO_URL}-fork"`), moved);
  assert.doesNotMatch(moved, /-fork-fork/);
  // A page whose commands use the brand's short /get address moves to the new repository's release.
  const short = `<html data-repo="${REPO_URL}" data-npx="https://kipdeck.com/get"><code>npx https://kipdeck.com/get --demo</code></html>`;
  const away = buildPage(short, { KIPDECK_REPO_URL: 'https://github.com/example/agent-inbox' });
  assert.ok(away.includes('<code>npx https://github.com/example/agent-inbox/releases/latest/download/kipdeck.tgz --demo</code>'), away);
  assert.doesNotMatch(away, /kipdeck\.com\/get/);
});

test('the release manifest builds nothing on install and ships the shrinkwrap', () => {
  const pkg = { name: 'kipdeck', version: '0.1.0', files: ['bin'], scripts: { prepare: 'npm run build', start: 'node bin/x.js' } };
  const out = releaseManifest(pkg, '0.1.70');
  assert.equal(out.version, '0.1.70');
  assert.equal(out.scripts.prepare, undefined);
  assert.equal(out.scripts.start, 'node bin/x.js');
  assert.deepEqual(out.files, ['bin', 'npm-shrinkwrap.json']);
  assert.equal(pkg.scripts.prepare, 'npm run build', 'the given manifest is left alone');
  assert.equal(releaseManifest({ ...pkg, scripts: { prepare: 'x' } }, undefined).scripts, undefined);
  assert.equal(releaseManifest(pkg, undefined).version, '0.1.0');
});

/** A tiny built package, enough to pack and install with no network. */
function fixture(dir: string): string {
  const root = path.join(dir, 'tree');
  mkdirSync(path.join(root, 'bin'), { recursive: true });
  writeFileSync(path.join(root, 'bin', 'agent-office.js'), "#!/usr/bin/env node\nconsole.log('kipdeck fixture ' + require('../package.json').version);\n");
  writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  const pkg = { name: 'kipdeck', version: '0.1.0', bin: { kipdeck: 'bin/agent-office.js' }, files: ['bin'], scripts: { prepare: 'exit 1' } };
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'kipdeck', version: '0.1.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'kipdeck', version: '0.1.0', bin: pkg.bin } } }));
  return root;
}

test('pack.mjs packs kipdeck.tgz with the version given, no prepare and the shrinkwrap, leaving the tree as it was', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kipdeck-pack-'));
  try {
    const root = fixture(dir);
    const before = readFileSync(path.join(root, 'package.json'), 'utf8');
    const tarball = packRelease({ root, out: path.join(dir, 'out'), version: '0.1.70' });
    assert.equal(tarball, path.join(dir, 'out', 'kipdeck.tgz'));
    const list = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n');
    for (const f of ['package/package.json', 'package/npm-shrinkwrap.json', 'package/bin/agent-office.js', 'package/README.md']) assert.ok(list.includes(f), f);
    const shipped = JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
    assert.equal(shipped.version, '0.1.70');
    assert.equal(shipped.scripts, undefined);
    const shrink = JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/npm-shrinkwrap.json'], { encoding: 'utf8' }));
    assert.equal(shrink.packages[''].version, '0.1.70');
    assert.equal(readFileSync(path.join(root, 'package.json'), 'utf8'), before);
    assert.ok(!existsSync(path.join(root, 'npm-shrinkwrap.json')));
    // Not built: it says so rather than packing half a package.
    rmSync(path.join(root, 'bin'), { recursive: true });
    assert.throws(() => packRelease({ root, out: path.join(dir, 'out') }), /not built: bin missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('install.sh installs a release tarball and links the kipdeck command, with no network', { skip: process.platform === 'win32' ? 'install.sh is for macOS and Linux' : false, timeout: 120_000 }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kipdeck-install-'));
  try {
    const tarball = packRelease({ root: fixture(dir), out: path.join(dir, 'release'), version: '0.1.71' });
    const home = path.join(dir, 'home');
    mkdirSync(home);
    const env = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      npm_config_cache: path.join(dir, 'npm-cache'),
      npm_config_offline: 'true',
      npm_config_update_notifier: 'false',
      KIPDECK_TARBALL: tarball,
      KIPDECK_PREFIX: path.join(dir, 'install'),
      KIPDECK_BIN_DIR: path.join(dir, 'bin'),
      KIPDECK_INSTALL_ONLY: '1',
    };
    execFileSync('bash', [path.join(ROOT, 'install.sh')], { env, stdio: 'pipe' });
    const link = path.join(dir, 'bin', 'kipdeck');
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.equal(execFileSync(link, { encoding: 'utf8' }).trim(), 'kipdeck fixture 0.1.71');
    // A tarball that isn't there stops it before npm runs.
    assert.throws(() => execFileSync('bash', [path.join(ROOT, 'install.sh')], { env: { ...env, KIPDECK_TARBALL: path.join(dir, 'nope.tgz') }, stdio: 'pipe' }), /no such file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Release workflow publishes kipdeck.tgz from main and smoke-tests it on Linux, macOS and Windows first', () => {
  const wf = read('.github/workflows/release.yml');
  const job = (name: string) => (new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`).exec(wf) ?? [])[1] ?? '';
  const publish = job('publish');
  assert.match(publish, /needs: \[test, pack, smoke\]/);
  assert.match(publish, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(publish, /permissions:\n\s+contents: write/);
  assert.match(publish, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(publish, /gh release create "\$TAG" release\/kipdeck\.tgz [^\n]*--latest/);
  assert.match(publish, /releases\/latest\/download\/kipdeck\.tgz/, 'and checks the README address serves it');
  assert.match(wf, /\npermissions:\n\s+contents: read\n/, 'every other job reads only');
  assert.match(job('pack'), /node deploy\/release\/pack\.mjs --version/);
  assert.match(job('smoke'), /os: \[ubuntu-latest, macos-latest\]/);
  assert.match(job('smoke'), /bash install\.sh/);
  assert.match(job('smoke-windows'), /runs-on: windows-latest/);
  assert.match(job('smoke-windows'), /\.\/install\.ps1/);
  // Every test runs somewhere: the landing page's in a job of its own, the rest in the gate.
  assert.match(job('test'), /grep -v '\^tests\/landing'/);
  assert.match(job('landing'), /--test tests\/landing\*\.test\.ts/);
});
