// The agent sessions running in a terminal on this computer right now, in a project's folder: what the
// setup card offers to bring in (protocol/setup.ts `sessions`, adopt.ts does the bringing).
//
// Claude Code writes a small file for each running session, `~/.claude/sessions/<pid>.json`, with its
// session id and folder: a session is running when that process still is. Codex keeps no such file,
// so a Codex process whose working folder is the project's counts, matched to that folder's newest
// Codex sessions (attach.ts reads them). Codex can't carry on a copy of a session still running
// elsewhere, so those are listed with what to do instead. Nothing here starts or changes anything.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SetupSession } from '../shared/protocol.js';
import { CLI } from '../shared/copy.js';
import { claudeSessions, codexSessions } from './attach.js';
import { FORKABLE } from './adopt.js';

export interface LiveDeps {
  home: string;
  env: NodeJS.ProcessEnv;
  /** Whether a process is still running. */
  alive(pid: number): boolean;
  /** The pids of running `codex` processes. */
  codexPids(): number[];
  /** A process's working folder, when it can be told. */
  cwdOf(pid: number): string | undefined;
}

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function codexPids(): number[] {
  if (process.platform === 'win32') return [];
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8', timeout: 2_000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out
      .split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => !!m && path.basename(m[2]) === 'codex')
      .map((m) => Number(m[1]));
  } catch {
    return [];
  }
}

function cwdOf(pid: number): string | undefined {
  try {
    if (process.platform === 'linux') return readlinkSync(`/proc/${pid}/cwd`);
    if (process.platform !== 'darwin') return undefined;
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', timeout: 2_000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').find((l) => l.startsWith('n'))?.slice(1) || undefined;
  } catch {
    return undefined;
  }
}

export const liveDeps = (): LiveDeps => ({ home: os.homedir(), env: process.env, alive, codexPids, cwdOf });

interface RunningClaude {
  id: string;
  at: number;
  name?: string;
  /** Its folder, resolved. */
  cwd: string;
}

/** Every interactive Claude Code session running on this computer, read once from its per-process files. */
function runningClaude(deps: LiveDeps): RunningClaude[] {
  const root = path.join(deps.env.CLAUDE_CONFIG_DIR || path.join(deps.home, '.claude'), 'sessions');
  let names: string[] = [];
  try {
    names = readdirSync(root).filter((n) => /^\d+\.json$/.test(n));
  } catch {
    return [];
  }
  const out: RunningClaude[] = [];
  for (const n of names) {
    let s: Record<string, unknown>;
    try {
      s = JSON.parse(readFileSync(path.join(root, n), 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const pid = Number(s.pid ?? n.slice(0, -5));
    if (typeof s.sessionId !== 'string' || typeof s.cwd !== 'string' || !Number.isInteger(pid) || pid <= 0) continue;
    // A one-off `claude -p` run isn't a session anyone is sitting at.
    if (s.kind !== undefined && s.kind !== 'interactive') continue;
    if (!deps.alive(pid)) continue;
    const at = typeof s.updatedAt === 'number' ? s.updatedAt : typeof s.startedAt === 'number' ? s.startedAt : 0;
    out.push({ id: s.sessionId, at, cwd: real(s.cwd), ...(typeof s.name === 'string' ? { name: s.name } : {}) });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** The folders running `codex` processes work in, one per process: ps once, then lsof (or /proc) per process. */
function codexFolders(deps: LiveDeps): string[] {
  return deps
    .codexPids()
    .map((pid) => deps.cwdOf(pid))
    .filter((cwd): cwd is string => !!cwd)
    .map(real);
}

/** Claude Code sessions running in `dir` (its own folder, not one inside it), newest first. */
export function liveClaude(dir: string, deps: LiveDeps): { id: string; at: number; name?: string }[] {
  const want = real(dir);
  return runningClaude(deps)
    .filter((s) => s.cwd === want)
    .map((s) => ({ id: s.id, at: s.at, ...(s.name !== undefined ? { name: s.name } : {}) }));
}

/** How many Codex processes are running in `dir`. */
export function liveCodexCount(dir: string, deps: LiveDeps): number {
  const want = real(dir);
  return codexFolders(deps).filter((cwd) => cwd === want).length;
}

/**
 * What the setup card offers for each project folder: its running Claude Code sessions (brought in as a
 * copy, the terminal keeps going) and its running Codex ones (quit first, then `kipdeck attach`).
 * `taken` says whether a session is already an agent's. It runs on the office's own thread, so each
 * look at the computer happens once a call, however many projects there are, and only the running
 * sessions' transcripts are opened for their titles.
 */
export function liveSessions(projects: { floor: string; dir: string }[], taken: (provider: 'claude' | 'codex', id: string) => boolean, deps: LiveDeps = liveDeps()): SetupSession[] {
  if (!projects.length) return [];
  const claudes = runningClaude(deps);
  const codexes = codexFolders(deps);
  const out: SetupSession[] = [];
  for (const { floor, dir } of projects) {
    const want = real(dir);
    const claude = claudes.filter((s) => s.cwd === want && !taken('claude', s.id));
    if (claude.length) {
      const titles = new Map(claudeSessions(dir, deps.home, deps.env, new Set(claude.map((s) => s.id))).map((s) => [s.id, s.title]));
      for (const s of claude) {
        const title = titles.get(s.id) ?? s.name;
        out.push({ provider: 'claude', id: s.id, floor, at: s.at, canAdopt: FORKABLE.includes('claude'), ...(title ? { title } : {}) });
      }
    }
    const codex = codexes.filter((cwd) => cwd === want).length;
    if (codex) {
      const found = codexSessions(dir, deps.home, deps.env, 2).filter((s) => !taken('codex', s.id)).slice(0, codex);
      for (const s of found) out.push({ provider: 'codex', id: s.id, floor, at: s.at, canAdopt: false, why: `Codex can't share a session: quit it in its terminal, then run ${CLI} attach there.`, ...(s.title ? { title: s.title } : {}) });
    }
  }
  return out;
}
