import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';

// The office keeps its state in <checkout>/.agent-office, and a checkout is whatever a repository
// ships. So nothing read from there is trusted just for being there: a state file git tracks came
// from the repository, not from an office, and a symlink there could point anywhere on the machine.
// These helpers are the one way the office reads and writes its state files (see docs/security.md).

/** The folder every office keeps its state in, inside a checkout (or its home). */
export const STATE_DIR = '.agent-office';

/** Ids the office makes itself (random hex, worker and meeting ids): safe as one path segment. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && SAFE_ID.test(v);
}

/** Whether `p` is inside `root` (not `root` itself), going by the path's text alone. */
export function within(root: string, p: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * A path with its symlinks resolved. The part that isn't there yet is added back on to its nearest
 * folder that is, so a file about to be written resolves to where it would really land.
 */
export function realish(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let cur = abs;
  for (;;) {
    try {
      return path.join(realpathSync(cur), ...rest.reverse());
    } catch {
      const up = path.dirname(cur);
      if (up === cur) return abs;
      rest.push(path.basename(cur));
      cur = up;
    }
  }
}

/** Whether `p`, once every symlink is followed, is still inside `root` (with its symlinks followed too). */
export function realWithin(root: string, p: string): boolean {
  return within(realish(root), realish(p));
}

export function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Why a checkout's state folder can't be used, or undefined when it can: it (or the worktrees
 * folder in it) is a symlink, which could send the office's writes and deletes anywhere.
 */
export function stateDirProblem(checkout: string): string | undefined {
  const dir = path.join(checkout, STATE_DIR);
  if (isSymlink(dir)) return `${dir} is a symlink; the office only keeps its state in a real folder`;
  try {
    if (existsSync(dir) && !lstatSync(dir).isDirectory()) return `${dir} is not a folder`;
  } catch {
    // unreadable: mkdir says so
  }
  const trees = path.join(dir, 'worktrees');
  if (isSymlink(trees)) return `${trees} is a symlink; the office only makes worktrees in a real folder`;
  return undefined;
}

const TRACKED_MS = 2000;
interface Tracked {
  at: number;
  /** The tracked files, as git names them (absolute). */
  files: Set<string>;
  /** The same files by device and inode, as they are on disk. */
  ids: Set<string>;
}
const trackedCache = new Map<string, Tracked>();

/** A file's identity on disk (device and inode), whatever name it's reached by. */
function fileId(p: string): string | undefined {
  try {
    const st = lstatSync(p, { bigint: true });
    return `${st.dev}:${st.ino}`;
  } catch {
    return undefined;
  }
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000, maxBuffer: 64 * 1024 * 1024 });
  } catch {
    // not a git checkout, no commits yet, or no git
    return '';
  }
}

/**
 * Every name git has for the checkout's .agent-office. On a case-insensitive filesystem (macOS,
 * Windows) .Agent-Office, or a name spelled with a Kelvin sign for its k or the "ff" ligature,
 * is the same folder on disk, so a repository can ship state files under a name git doesn't list
 * for ".agent-office". Every top-level name the checkout has (its commit and its staged changes)
 * that is the same folder on disk counts.
 */
function stateDirNames(checkout: string): string[] {
  const id = fileId(path.join(checkout, STATE_DIR));
  if (!id) return [];
  const names = new Set<string>([STATE_DIR]);
  const top = [
    ...git(checkout, ['ls-tree', '-z', '--name-only', 'HEAD']).split('\0'),
    ...git(checkout, ['diff', '--cached', '--relative', '--name-only', '--no-renames', '-z']).split('\0').map((p) => p.split('/')[0]),
  ];
  for (const name of top) if (name && !names.has(name) && fileId(path.join(checkout, name)) === id) names.add(name);
  return [...names];
}

function tracked(checkout: string): Tracked {
  const key = path.resolve(checkout);
  const hit = trackedCache.get(key);
  if (hit && Date.now() - hit.at < TRACKED_MS) return hit;
  const files = new Set<string>();
  const ids = new Set<string>();
  for (const name of stateDirNames(key)) {
    for (const rel of git(key, ['ls-files', '-z', '--', `:(literal)${name}`]).split('\0')) {
      if (!rel) continue;
      const abs = path.resolve(key, rel);
      files.add(abs);
      const id = fileId(abs);
      if (id) ids.add(id);
    }
  }
  const entry = { at: Date.now(), files, ids };
  trackedCache.set(key, entry);
  return entry;
}

/** The files under a checkout's .agent-office that git tracks (absolute paths): they came with the repository. */
export function trackedState(checkout: string): Set<string> {
  return tracked(checkout).files;
}

/** Whether git tracks this file in the checkout's .agent-office, by whatever name: it's the same file on disk. */
function isTracked(checkout: string, file: string): boolean {
  const t = tracked(checkout);
  if (t.files.has(path.resolve(file))) return true;
  const id = fileId(file);
  return !!id && t.ids.has(id);
}

/** The .agent-office folder a state file is in: its nearest ancestor of that name. */
function stateRoot(file: string): string | undefined {
  let cur = path.dirname(path.resolve(file));
  for (;;) {
    if (path.basename(cur) === STATE_DIR) return cur;
    const up = path.dirname(cur);
    if (up === cur) return undefined;
    cur = up;
  }
}

const warned = new Set<string>();
function warnOnce(file: string, why: string) {
  if (warned.has(file)) return;
  warned.add(file);
  console.warn(`agent-office: ignoring ${file}: ${why}`);
}

/**
 * The symlink on the way from a path's .agent-office down to the path itself (both included), if
 * there is one. A folder of the office's state that leads somewhere else must not be listed and
 * cleaned out, or written into: that would delete or write files wherever it points.
 */
export function symlinkOnTheWay(p: string): string | undefined {
  const abs = path.resolve(p);
  const root = stateRoot(abs) ?? (path.basename(abs) === STATE_DIR ? abs : undefined);
  const steps = root ? [root, ...path.relative(root, abs).split(path.sep).filter(Boolean).map((_, i, parts) => path.join(root, ...parts.slice(0, i + 1)))] : [abs];
  return steps.find(isSymlink);
}

/**
 * Why a state file can't be trusted, or undefined when it can: it, or a folder between it and its
 * .agent-office, is a symlink, or git tracks it (so the repository shipped it).
 */
export function untrustedState(file: string): string | undefined {
  const abs = path.resolve(file);
  const link = symlinkOnTheWay(abs);
  if (link) return `${link} is a symlink`;
  const root = stateRoot(abs);
  if (root && isTracked(path.dirname(root), abs)) return 'git tracks it, so it came with the repository rather than from an office';
  return undefined;
}

/** A state file's text, or undefined when it isn't there or can't be trusted (see untrustedState). */
export function readState(file: string): string | undefined {
  if (!existsSync(file) && !isSymlink(file)) return undefined;
  const bad = untrustedState(file);
  if (bad) {
    warnOnce(file, bad);
    return undefined;
  }
  try {
    if (!lstatSync(file).isFile()) return undefined;
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** A state file's JSON, or undefined (see readState). A broken file throws, as JSON.parse does. */
export function readStateJson<T = any>(file: string): T | undefined {
  const text = readState(file);
  return text === undefined ? undefined : (JSON.parse(text) as T);
}

/** A state file's JSON, or undefined when it's missing, untrusted or broken. */
export function tryStateJson<T = any>(file: string): T | undefined {
  try {
    return readStateJson<T>(file);
  } catch {
    return undefined;
  }
}

/** Folders between a state file's .agent-office and it that are symlinks: writing there would land somewhere else. */
function unsafeParents(file: string): string | undefined {
  const abs = path.resolve(file);
  const root = stateRoot(abs);
  if (!root) return undefined;
  let cur = path.dirname(abs);
  for (;;) {
    if (isSymlink(cur)) return cur;
    if (cur === root) return undefined;
    const up = path.dirname(cur);
    if (up === cur) return undefined;
    cur = up;
  }
}

/**
 * Writes a state file without following a symlink: into a new file next to it, then renamed over
 * it, which replaces a symlink there rather than writing through it. Throws, as writeFileSync does.
 */
export function writeState(file: string, data: string | Buffer, mode = 0o600) {
  const parent = unsafeParents(file);
  if (parent) throw new Error(`${parent} is a symlink`);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  // wx: O_CREAT|O_EXCL, which never follows a symlink someone left at that name.
  const fd = openSync(tmp, 'wx', mode);
  try {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    let at = 0;
    while (at < buf.length) at += writeSync(fd, buf, at, buf.length - at);
  } catch (err) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw err;
  }
  closeSync(fd);
  try {
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

/** Opens a state file to append to (or, with `truncate`, to write from scratch), refusing a symlink. Returns the fd. */
export function openState(file: string, truncate = false, mode = 0o600): number {
  const parent = unsafeParents(file);
  if (parent) throw new Error(`${parent} is a symlink`);
  if (isSymlink(file)) throw new Error(`${file} is a symlink`);
  const flags = constants.O_WRONLY | constants.O_CREAT | NOFOLLOW | (truncate ? constants.O_TRUNC : constants.O_APPEND);
  return openSync(file, flags, mode);
}

/** Appends to a state file, refusing to write through a symlink. Throws, as appendFileSync does. */
export function appendState(file: string, data: string, mode = 0o600) {
  const fd = openState(file, false, mode);
  try {
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
}
