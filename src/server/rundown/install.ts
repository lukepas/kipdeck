// Installing the /rundown skill into ~/.claude/skills/rundown/ (or another folder): the built script,
// SKILL.md and README.md. It lists what changes first, refuses to replace a newer install with an older
// build unless forced, backs the old folder up to ~/.claude/backups/rundown-<time>/, and takes out the
// files of an older install (they stay in the backup). Screenshots in examples/ are left alone.

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isoLocal } from '../../shared/rundown/model.js';
import { compareVersions, RUNDOWN_VERSION } from '../../shared/rundown/version.js';

export interface InstallArgs {
  skill?: string;
  readme?: string;
  dryRun: boolean;
  /** Install even over a newer copy. */
  force?: boolean;
}

const tildify = (p: string) => {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
};

/** Every file under `dir`, relative, with '/'. */
function filesUnder(dir: string, rel = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? filesUnder(dir, r) : e.isFile() ? [r] : [];
  });
}

const read = (file: string): string | null => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

/**
 * The version a script carries: the stamp the build writes on its second line, else the constant the
 * older builds had (`VERSION = 'x.y.z'`, in rundown.mjs or, for the standalone skill, lib/common.mjs).
 */
export function scriptVersion(file: string): string | null {
  const text = read(file);
  if (text === null) return null;
  return /^\/\/ rundown-version: (\d+\.\d+\.\d+)$/m.exec(text.slice(0, 4096))?.[1] ?? /\bVERSION = '(\d+\.\d+\.\d+)'/.exec(text)?.[1] ?? null;
}

/** The version installed in `dir`, or null when there is none or it can't be told. */
export function installedVersion(dir: string): string | null {
  return scriptVersion(path.join(dir, 'scripts', 'rundown.mjs')) ?? scriptVersion(path.join(dir, 'scripts', 'lib', 'common.mjs'));
}

export interface InstallPlan {
  dir: string;
  /** What goes in, by its path in the skill. */
  files: Map<string, string>;
  added: string[];
  changed: string[];
  same: string[];
  /** There now and not in this build (an older install's scripts): backed up, then taken out. */
  stale: string[];
}

/** What installing would do to `dir`: nothing is written. */
export function planInstall(dir: string, files: Map<string, string>): InstallPlan {
  const plan: InstallPlan = { dir, files, added: [], changed: [], same: [], stale: [] };
  for (const [rel, src] of files) {
    const dst = path.join(dir, rel);
    if (!existsSync(dst)) plan.added.push(rel);
    else if (readFileSync(dst).equals(readFileSync(src))) plan.same.push(rel);
    else plan.changed.push(rel);
  }
  plan.stale = filesUnder(dir).filter((rel) => !files.has(rel) && !rel.startsWith('examples/') && !rel.endsWith('.DS_Store'));
  return plan;
}

/**
 * The skill's own files beside this script: SKILL.md and README.md one folder up, as the package and
 * the plugin ship them (skills/rundown/scripts/rundown.mjs). Null when there is no SKILL.md there.
 */
export function packagedSkill(self: string): { skill: string; readme?: string } | null {
  const dir = path.resolve(path.dirname(self), '..');
  const skill = path.join(dir, 'SKILL.md');
  if (!existsSync(skill)) return null;
  const readme = path.join(dir, 'README.md');
  return { skill, ...(existsSync(readme) ? { readme } : {}) };
}

/** Puts `self` (the built script), SKILL.md and README.md into `dir`. Returns the exit code. */
export function install(a: InstallArgs, dir = path.join(os.homedir(), '.claude', 'skills', 'rundown'), backups = path.join(os.homedir(), '.claude', 'backups'), self: string): number {
  const files = new Map<string, string>([['scripts/rundown.mjs', self]]);
  const packaged = packagedSkill(self);
  for (const [rel, src] of [['SKILL.md', a.skill ?? packaged?.skill], ['README.md', a.readme ?? packaged?.readme]] as const) {
    if (!src) continue;
    if (!existsSync(src)) {
      console.error(`rundown: no such file: ${src}`);
      return 2;
    }
    files.set(rel, path.resolve(src));
  }
  const mine = scriptVersion(self) ?? RUNDOWN_VERSION;
  const theirs = installedVersion(dir);
  const older = theirs !== null && compareVersions(mine, theirs) < 0;
  const plan = planInstall(dir, files);
  const list = (label: string, xs: string[]) => xs.length && console.log(`  ${label}: ${xs.join(', ')}`);
  console.log(`${a.dryRun ? 'Would install' : 'Installing'} rundown ${mine} into ${tildify(dir)}${theirs ? ` (installed now: ${theirs})` : ''}:`);
  list('new', plan.added);
  list('changed', plan.changed);
  list('unchanged', plan.same);
  list('taken out (an older install, kept in the backup)', plan.stale);
  if (older) {
    const msg = `the installed copy is newer (${theirs}) than this one (${mine})`;
    if (!a.force) {
      console.error(`rundown: ${msg}: nothing changed. Add --force to replace it anyway (it is backed up first).`);
      return 3;
    }
    console.log(`Replacing a newer copy (--force): ${msg}.`);
  }
  if (a.dryRun) {
    if (plan.changed.includes('SKILL.md')) {
      const d = spawnSync('diff', ['-u', path.join(dir, 'SKILL.md'), files.get('SKILL.md')!], { encoding: 'utf8', timeout: 10_000 });
      if (d.stdout) console.log(d.stdout.split('\n').slice(0, 80).join('\n'));
    }
    return 0;
  }
  if (!plan.added.length && !plan.changed.length && !plan.stale.length) {
    console.log('Nothing to change.');
    return 0;
  }
  if (existsSync(dir) && (plan.changed.length || plan.stale.length)) {
    // Two installs in the same second each keep their own backup.
    const stamp = path.join(backups, `rundown-${isoLocal(new Date()).slice(0, 19).replace(/[-:]/g, '')}`);
    let backup = stamp;
    for (let i = 2; existsSync(backup); i++) backup = `${stamp}-${i}`;
    mkdirSync(backups, { recursive: true });
    cpSync(dir, backup, { recursive: true, errorOnExist: true, force: false });
    console.log(`Backed up the old copy to ${tildify(backup)}  (diff -ru ${tildify(backup)} ${tildify(dir)})`);
  }
  for (const [rel, src] of files) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    copyFileSync(src, path.join(dir, rel));
  }
  for (const rel of plan.stale) unlinkSync(path.join(dir, rel));
  console.log(`Installed rundown ${mine} in ${tildify(dir)}`);
  return 0;
}
