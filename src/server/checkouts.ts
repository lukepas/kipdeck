// Checkouts on this computer: paths as people read them, which folder is inside which, whether the
// office can make checkouts somewhere, and what a folder holds (its GitHub origin, a commit).
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeRepo, sameRepo } from '../shared/floors.js';

/** A path under the home folder as ~/..., for showing people. */
export function tildify(p: string): string {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

export function untildify(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** `dir` is `parent` or somewhere under it. */
export function within(dir: string, parent: string): boolean {
  const rel = path.relative(parent, dir);
  return !rel || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** Why the office couldn't make checkouts under `dir`, if it couldn't. It's made on the first clone, so it needn't exist yet. */
export function unwritable(dir: string): string | undefined {
  let at = dir;
  while (!existsSync(at) && path.dirname(at) !== at) at = path.dirname(at);
  try {
    if (!statSync(at).isDirectory()) return `${tildify(at)} isn't a folder`;
    accessSync(at, constants.W_OK);
  } catch {
    return `The office can't write in ${tildify(at)}`;
  }
  return undefined;
}

/** The GitHub repository a checkout's origin points at. */
export function originRepo(dir: string): string | undefined {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim();
    return /github\.com[/:]/i.test(url) ? normalizeRepo(url) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What's at `dest`: nothing yet ('none'), a checkout of `repo` ('ok'), or why it's in the way. A
 * clone that was cut off has its origin but no commit checked out; an `empty` repository has none to.
 */
export function checkoutAt(dest: string, repo: string, empty: boolean): 'none' | 'ok' | string {
  if (!existsSync(dest)) return 'none';
  if (!statSync(dest).isDirectory()) return `${dest} is already there and isn't a folder`;
  if (!readdirSync(dest).length) return 'none';
  if (!sameRepo(originRepo(dest), repo)) return `${dest} already exists and isn't a checkout of ${repo} - move it out of the way first`;
  if (!empty && !hasCommit(dest)) return `${dest} is a clone of ${repo} that didn't finish - delete that folder and add the floor again`;
  return 'ok';
}

export function hasCommit(dir: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: dir, stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** The top of the git checkout `dir` is in (its real path), or undefined when it isn't in one. */
export function gitTop(dir: string): string | undefined {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim();
    return top ? realpathSync(top) : undefined;
  } catch {
    return undefined;
  }
}
