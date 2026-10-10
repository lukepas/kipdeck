// The files the rundown counts, and what's in them: listed by git (tracked, and new ones that aren't
// ignored), never by walking folders, so nested worktrees, node_modules and the office's own data stay
// out. Symlinks are never followed, names on the deny list are counted and never opened, binaries are
// skipped, and every read is capped (a file, a run, a deadline). What a file holds (its lines, its
// TODO tags by line number, its test cases) is cached by its git blob, so a second run only reads what
// changed. No contents leave here: only counts and line numbers.

import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { binaryByName, excludedPath, generatedPath, sensitivePath, toolCachePath } from '../../shared/rundown/paths.js';
import { LIMITS } from '../../shared/rundown/schema.js';
import type { GitRunner } from './git.js';

export interface FileStat {
  lines: number;
  todos: { line: number; tag: 'TODO' | 'FIXME' | 'HACK' }[];
  cases: number;
}

/** What a run read, by blob (or by path, size and time for a file git doesn't have yet). */
export type StatCache = Map<string, FileStat>;

export interface Listed {
  path: string;
  /** The blob in the index, for tracked files. */
  sha: string | null;
  bytes: number;
  sensitive: boolean;
  /** Counted but not read for lines (lockfiles, built output, binaries). */
  skipLines: boolean;
  stat: FileStat | null;
}

export interface Listing {
  files: Listed[];
  truncated: boolean;
  sensitive: number;
}

/** Tracked files (with their blobs) and new ones git doesn't ignore, minus what's never counted. */
export async function listFiles(git: GitRunner): Promise<{ entries: { path: string; sha: string | null }[]; truncated: boolean } | null> {
  const tracked = await git(['ls-files', '-z', '-s']);
  if (tracked === null) return null;
  const out: { path: string; sha: string | null }[] = [];
  for (const e of tracked.split('\x00')) {
    const tab = e.indexOf('\t');
    if (tab < 0) continue;
    const [mode, sha] = e.slice(0, tab).split(' ');
    const p = e.slice(tab + 1);
    // Symlinks (120000) and submodules or nested worktrees (160000) are never followed.
    if (mode === '120000' || mode === '160000' || excludedPath(p)) continue;
    out.push({ path: p, sha });
  }
  const others = await git(['ls-files', '-z', '--others', '--exclude-standard', '--directory', '--no-empty-directory']);
  for (const p of (others ?? '').split('\x00')) {
    // A folder git lists whole is a repository of its own (a worktree, a clone): left out. So are tools'
    // caches nobody committed (.playwright-mcp/ page snapshots are not the project's YAML).
    if (!p || p.endsWith('/') || excludedPath(p) || toolCachePath(p)) continue;
    out.push({ path: p, sha: null });
  }
  // A file staged twice (a merge in progress) is listed once.
  const seen = new Set<string>();
  const unique = out.filter((e) => !seen.has(e.path) && !!seen.add(e.path));
  return { entries: unique.slice(0, LIMITS.files), truncated: unique.length > LIMITS.files };
}

const TAG = /\b(TODO|FIXME|HACK)\b/;
const CASE = /(^|\s)(it|test|describe\.each|it\.each|test\.each)\s*\(|^\s*(async\s+)?def\s+test_|^\s*func\s+Test[A-Z_]|@Test\b|#\[test\]|^\s*fn\s+test_/gm;

/** Lines, TODO tags by line and test cases in a file's text. */
export function statOf(text: string, isTest: boolean): FileStat {
  if (!text) return { lines: 0, todos: [], cases: 0 };
  const all = text.split('\n');
  const lines = text.endsWith('\n') ? all.length - 1 : all.length;
  const todos: FileStat['todos'] = [];
  for (let i = 0; i < all.length && todos.length < 500; i++) {
    if (all[i].length > 2000) continue;
    const m = TAG.exec(all[i]);
    if (m) todos.push({ line: i + 1, tag: m[1] as FileStat['todos'][number]['tag'] });
  }
  const cases = isTest ? (text.match(CASE)?.length ?? 0) : 0;
  return { lines, todos, cases };
}

export interface ReadBudget {
  bytes: number;
  deadline: number;
}

/**
 * Stats every listed file: sensitive ones are only counted, binaries and generated ones only sized,
 * the rest read (up to LIMITS.bytesPerFile each) unless the cache has them. Stops reading at the
 * deadline or the run's byte budget and says it was cut short.
 */
export async function readFiles(root: string, entries: readonly { path: string; sha: string | null }[], opts: { cache: StatCache; changed: Set<string>; isTest(p: string): boolean; budget: ReadBudget }): Promise<Listing> {
  const realRoot = await realpath(root);
  const dirOk = new Map<string, boolean>();
  const files: Listed[] = [];
  let sensitive = 0;
  let truncated = false;
  let i = 0;
  for (const e of entries) {
    if (++i % 500 === 0) await new Promise((r) => setImmediate(r));
    if (sensitivePath(e.path)) {
      sensitive++;
      files.push({ path: e.path, sha: e.sha, bytes: 0, sensitive: true, skipLines: true, stat: null });
      continue;
    }
    const abs = path.join(root, e.path);
    let bytes = 0;
    try {
      const st = await lstat(abs);
      // A symlink, or something that isn't a plain file (a deleted one is just gone).
      if (!st.isFile()) continue;
      bytes = st.size;
      const dir = path.dirname(abs);
      let ok = dirOk.get(dir);
      if (ok === undefined) {
        const real = await realpath(dir);
        ok = real === realRoot || real.startsWith(realRoot + path.sep);
        dirOk.set(dir, ok);
      }
      if (!ok) continue;
      const skipLines = binaryByName(e.path) || generatedPath(e.path);
      const item: Listed = { path: e.path, sha: e.sha, bytes, sensitive: false, skipLines, stat: null };
      files.push(item);
      if (skipLines) continue;
      const key = e.sha && !opts.changed.has(e.path) ? `b:${e.sha}` : `p:${e.path}:${st.size}:${st.mtimeMs}`;
      const cached = opts.cache.get(key);
      if (cached) {
        item.stat = cached;
        continue;
      }
      if (truncated || Date.now() > opts.budget.deadline || opts.budget.bytes <= 0) {
        truncated = true;
        continue;
      }
      const want = Math.min(st.size, LIMITS.bytesPerFile);
      const buf = Buffer.alloc(want);
      const fh = await open(abs, 'r');
      try {
        await fh.read(buf, 0, want, 0);
      } finally {
        await fh.close();
      }
      opts.budget.bytes -= want;
      // A NUL in the first 8 KB: a binary file.
      if (buf.subarray(0, 8192).includes(0)) {
        item.skipLines = true;
        continue;
      }
      item.stat = statOf(buf.toString('utf8'), opts.isTest(e.path));
      opts.cache.set(key, item.stat);
    } catch {
      // Gone since git listed it, or unreadable: left out.
    }
  }
  return { files, truncated, sensitive };
}

/** Reads one small text file in the checkout (a manifest, a README), never through a symlink. */
export async function readSmall(root: string, rel: string, max = 256 * 1024): Promise<string | null> {
  if (sensitivePath(rel) || rel.includes('..')) return null;
  const abs = path.join(root, rel);
  try {
    const st = await lstat(abs);
    if (!st.isFile()) return null;
    const real = await realpath(abs);
    const realRoot = await realpath(root);
    if (!real.startsWith(realRoot + path.sep)) return null;
    const want = Math.min(st.size, max);
    const buf = Buffer.alloc(want);
    const fh = await open(abs, 'r');
    try {
      await fh.read(buf, 0, want, 0);
    } finally {
      await fh.close();
    }
    return buf.toString('utf8');
  } catch {
    return null;
  }
}
