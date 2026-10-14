// The registry behind the index of every project's rundown: ~/.claude/rundown/index.json and
// index.html (RUNDOWN_HOME moves both; tests use it). Every render upserts its project, and pages that
// are gone drop off, unless their folder only sits on a drive that isn't mounted right now. One run at a
// time holds index.lock, so parallel renders (worktrees) never drop each other's entry.

import { randomBytes } from 'node:crypto';
import { existsSync, promises as fsp, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PageStyle } from '../../shared/rundown/html.js';
import { renderIndexPage, validEntry, type IndexEntry } from '../../shared/rundown/index-page.js';

const SCHEMA = 1;
const LOCK_WAIT_MS = 5000;
const LOCK_STALE_MS = 10_000;

/** Where the index lives. A relative RUNDOWN_HOME would give each repo its own index inside it, so it is refused. */
export function indexHome(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.RUNDOWN_HOME;
  if (!v) return path.join(os.homedir(), '.claude', 'rundown');
  const dir = v === '~' || v.startsWith('~/') ? path.join(os.homedir(), v.slice(1)) : v;
  if (!path.isAbsolute(dir)) throw new Error(`RUNDOWN_HOME must be an absolute path, got "${v}"`);
  return path.resolve(dir);
}

export const indexPaths = (dir = indexHome()) => ({ dir, json: path.join(dir, 'index.json'), html: path.join(dir, 'index.html') });

export const devOf = (p: string): number | null => {
  try {
    return statSync(p).dev;
  } catch {
    return null;
  }
};

const tildify = (p: string) => {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
};

function load(file: string): IndexEntry[] {
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { projects?: unknown };
    return Array.isArray(doc.projects) ? doc.projects.filter(validEntry).filter((e) => path.isAbsolute(e.htmlPath)) : [];
  } catch {
    return [];
  }
}

const MOUNT_DIR = /^\/(Volumes|mnt|media|run\/media\/[^/]+|media\/[^/]+)$/;
function nearestExisting(p: string): string {
  let d = p;
  while (!existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  return d;
}

/**
 * Keep an entry while its page exists, or while its folder is only out of reach: the nearest folder
 * still there sits on another device (an unmounted volume), or, with no device recorded, its parent is
 * missing or a mount folder such as /Volumes.
 */
export function keepEntry(e: Pick<IndexEntry, 'htmlPath' | 'root' | 'dev'>): boolean {
  if (existsSync(e.htmlPath)) return true;
  const near = nearestExisting(e.root);
  if (e.dev != null) return devOf(near) !== e.dev;
  const parent = path.dirname(e.root);
  return near !== e.root && (near !== parent || MOUNT_DIR.test(parent));
}

const newestFirst = (a: IndexEntry, b: IndexEntry) => (Date.parse(b.generatedAt) || 0) - (Date.parse(a.generatedAt) || 0);

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** A file written whole or not at all; a failed write takes its temp file with it. */
function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/** Temp files of index.json and index.html that a killed run left behind; a live run's stay. */
function sweepTmp(dir: string) {
  for (const f of readdirSync(dir)) {
    const m = /^index\.(json|html)\.(\d+)\.[0-9a-f]+\.tmp$/.exec(f);
    if (m && !alive(Number(m[2]))) rmSync(path.join(dir, f), { force: true });
  }
}

function write(dir: string, projects: IndexEntry[], style: PageStyle): { html: string; json: string; count: number } {
  const p = indexPaths(dir);
  sweepTmp(dir);
  const list = projects.filter(keepEntry).sort(newestFirst);
  writeAtomic(p.json, `${JSON.stringify({ schemaVersion: SCHEMA, updatedAt: new Date().toISOString(), projects: list }, null, 1)}\n`);
  writeAtomic(p.html, renderIndexPage(list.map((e) => ({ ...e, href: pathToFileURL(e.htmlPath).href, pathLabel: tildify(e.root) })), style));
  return { html: p.html, json: p.json, count: list.length };
}

async function lockStale(file: string): Promise<{ text: string; stale: boolean } | null> {
  const [st, text] = await Promise.all([fsp.stat(file).catch(() => null), fsp.readFile(file, 'utf8').catch(() => null)]);
  if (!st || text === null) return null;
  const pid = Number(text.split(' ')[0]);
  return { text, stale: Date.now() - st.mtimeMs > LOCK_STALE_MS || (Number.isInteger(pid) && pid > 0 && !alive(pid)) };
}

/** Removes `lock` if it is still stale, under a short guard so two runs can't remove each other's fresh lock. */
async function breakStale(lock: string): Promise<boolean> {
  const guard = `${lock}.break`;
  let fh: fsp.FileHandle;
  try {
    fh = await fsp.open(guard, 'wx');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    const g = await lockStale(guard);
    if (g?.stale) await fsp.rm(guard, { force: true });
    return false;
  }
  try {
    await fh.writeFile(String(process.pid));
    await fh.close();
    if ((await lockStale(lock))?.stale) await fsp.rm(lock, { force: true });
    return true;
  } finally {
    await fsp.rm(guard, { force: true });
  }
}

async function withLock<T>(dir: string, fn: () => T): Promise<T> {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EEXIST' || code === 'ENOTDIR') throw new Error(`cannot use ${tildify(dir)} for the index: ${code === 'EEXIST' ? 'it is a file, not a folder' : 'a folder above it is a file'}`);
    throw e;
  }
  const lock = path.join(dir, 'index.lock');
  const token = `${process.pid} ${randomBytes(8).toString('hex')}`;
  const until = Date.now() + LOCK_WAIT_MS;
  let fh: fsp.FileHandle | null = null;
  while (!fh) {
    try {
      fh = await fsp.open(lock, 'wx');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const l = await lockStale(lock);
      if (l?.stale && (await breakStale(lock))) continue;
      if (Date.now() > until) throw new Error(`index is locked by another run (${tildify(lock)}); try again in a moment`);
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
    }
  }
  try {
    await fh.writeFile(token);
    await fh.close();
    return fn();
  } finally {
    if ((await lockStale(lock))?.text === token) await fsp.rm(lock, { force: true });
  }
}

/** The same folder reached through a symlink is one entry: keyed on the real path. */
async function real(e: IndexEntry): Promise<IndexEntry> {
  const root = await fsp.realpath(e.root).catch(() => e.root);
  return root === e.root ? e : { ...e, root, htmlPath: path.join(root, path.relative(e.root, e.htmlPath)) };
}

/** Upserts one project, drops entries whose page is gone, and rewrites both files. */
export async function updateIndex(entry: IndexEntry, style: PageStyle = {}, dir = indexHome()): Promise<{ html: string; json: string; count: number }> {
  const e = await real(entry);
  return withLock(dir, () => write(dir, [e, ...load(indexPaths(dir).json).filter((x) => x.root !== e.root)], style));
}

/** Prunes and rewrites without adding anything (the `index` command). */
export async function rebuildIndex(style: PageStyle = {}, dir = indexHome()): Promise<{ html: string; json: string; count: number }> {
  return withLock(dir, () => write(dir, load(indexPaths(dir).json), style));
}

/** The index page as a file: URL, for the "All rundowns" link. */
export const indexHref = (dir = indexHome()) => pathToFileURL(indexPaths(dir).html).href;
