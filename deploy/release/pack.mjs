// Packs the release tarball, kipdeck.tgz: the package as it ships from an already built tree, with
// nothing left to build or compile on the machine that installs it. The Release workflow publishes it
// on every main push at https://github.com/zbagdzevicius/kipdeck/releases/latest/download/kipdeck.tgz,
// which the README's first command, install.sh and install.ps1 install; design/time-to-first-agent.mjs
// times the same tarball.
//
// It packs a staged copy, so the tree it runs in is left as it was:
// - no `prepare` (npm 10 runs it on `npm pack` even with --ignore-scripts, and an install from the
//   tarball has no build tools);
// - npm-shrinkwrap.json from package-lock.json, so installs get exactly the dependency versions tested;
// - the version given (the workflow's major.minor plus the commit count), else package.json's.
//
//   npm run build && node deploy/release/pack.mjs [--version 0.1.70] [--out <dir>]
//
// Prints the tarball's path.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The release asset's name, the same for every version so releases/latest/download/ finds it. */
export const ASSET = 'kipdeck.tgz';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** What npm puts in every package whether `files` lists it or not. */
const ALWAYS = ['README.md', 'LICENSE'];

/**
 * The package.json the tarball ships: the version given, no `prepare`, and the shrinkwrap in `files`.
 * Pure, so a test can check it without packing.
 */
export function releaseManifest(pkg, version) {
  const out = structuredClone(pkg);
  if (version) out.version = version;
  if (out.scripts) {
    delete out.scripts.prepare;
    if (Object.keys(out.scripts).length === 0) delete out.scripts;
  }
  out.files = [...new Set([...(out.files ?? []), 'npm-shrinkwrap.json'])];
  return out;
}

/** Packs the built tree at `root` into `<out>/kipdeck.tgz` and returns its path. */
export function packRelease({ root = ROOT, out = root, version } = {}) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const missing = pkg.files.filter((f) => !existsSync(path.join(root, f)));
  if (missing.length) throw new Error(`not built: ${missing.join(', ')} missing (npm run build first)`);
  const stage = mkdtempSync(path.join(tmpdir(), 'kipdeck-release-'));
  try {
    for (const f of [...pkg.files, ...ALWAYS]) if (existsSync(path.join(root, f))) cpSync(path.join(root, f), path.join(stage, f), { recursive: true });
    writeFileSync(path.join(stage, 'package.json'), JSON.stringify(releaseManifest(pkg, version), null, 2) + '\n');
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    if (version) {
      lock.version = version;
      if (lock.packages?.['']) lock.packages[''].version = version;
    }
    writeFileSync(path.join(stage, 'npm-shrinkwrap.json'), JSON.stringify(lock, null, 2) + '\n');
    const dest = path.join(stage, '.pack');
    mkdirSync(dest);
    execFileSync('npm', ['pack', '--ignore-scripts', '--loglevel=warn', '--pack-destination', dest], { cwd: stage, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
    const [made] = readdirSync(dest).filter((f) => f.endsWith('.tgz'));
    if (!made) throw new Error('npm pack made no tarball');
    mkdirSync(out, { recursive: true });
    const tarball = path.join(path.resolve(out), ASSET);
    rmSync(tarball, { force: true });
    try {
      renameSync(path.join(dest, made), tarball);
    } catch {
      // Another drive (Windows temp folders): copy instead.
      cpSync(path.join(dest, made), tarball);
    }
    return tarball;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    console.log(packRelease({ version: flag(args, '--version'), out: flag(args, '--out') ?? process.cwd() }));
  } catch (err) {
    console.error(`pack: ${err.message}`);
    process.exit(1);
  }
}
