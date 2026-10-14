// Collision radar: two live agents on one project changing the same files, found while they work
// rather than at merge time. The server (server/landqueue.ts) lists what each live agent has changed
// against its base; this decides which of those files say anything. Lockfiles and build output
// change under every agent that installs or builds, so they never count. Pure, for the tests.

import { LAND_FILES_MAX, type OverlapState } from './landqueue.js';

/** Files every package manager rewrites: two agents touching them is noise, not a collision. */
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'composer.lock',
  'go.sum',
  'mix.lock',
  'pubspec.lock',
  'Podfile.lock',
  'flake.lock',
]);

/** Folders of build output: anything under one is made, not written. */
const OUTPUT_DIRS = new Set(['dist', 'node_modules', '.next', '.nuxt', '.turbo', '.svelte-kit', 'coverage', '__pycache__']);

/** Whether a changed file says anything about a collision: not a lockfile, not build output. */
export function counts(file: string): boolean {
  const parts = file.split('/');
  const name = parts[parts.length - 1];
  if (LOCKFILES.has(name)) return false;
  return !parts.slice(0, -1).some((p) => OUTPUT_DIRS.has(p));
}

/** One live agent and the files it has changed against its base (committed or not). */
export interface Touching {
  id: string;
  files: readonly string[];
}

/**
 * For each agent that shares a file with another, who with and which files, sorted. Agents with
 * nothing in common are left out. Every agent passed in is taken to be on the same project.
 */
export function overlaps(agents: readonly Touching[]): Map<string, OverlapState> {
  const byFile = new Map<string, string[]>();
  for (const a of agents) {
    for (const f of new Set(a.files)) {
      if (!counts(f)) continue;
      const ids = byFile.get(f);
      if (ids) ids.push(a.id);
      else byFile.set(f, [a.id]);
    }
  }
  const found = new Map<string, { with: Set<string>; files: string[] }>();
  for (const [file, ids] of byFile) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const o = found.get(id) ?? { with: new Set<string>(), files: [] };
      for (const other of ids) if (other !== id) o.with.add(other);
      o.files.push(file);
      found.set(id, o);
    }
  }
  const out = new Map<string, OverlapState>();
  for (const [id, o] of found) {
    const files = o.files.sort();
    const shown = files.slice(0, LAND_FILES_MAX);
    out.set(id, { with: [...o.with].sort(), files: shown, ...(files.length > shown.length ? { more: files.length - shown.length } : {}) });
  }
  return out;
}
