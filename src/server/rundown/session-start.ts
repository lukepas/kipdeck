// `rundown.mjs session-start`: the plugin's SessionStart hook (plugins/rundown/hooks/hooks.json). It
// reads the hook's input on stdin for the session's folder, finds the map at its git top (findRundown:
// never one the repository tracks; outside git the nearest, never above the home folder), and prints
// the brief as the hook's JSON when the map is under a week old. It never writes, never runs git and never fails a session: any problem prints
// nothing and exits 0.

import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Rundown } from '../../shared/rundown/schema.js';
import { sessionBrief, sessionStartOutput } from '../../shared/rundown/session-brief.js';

/** rundown.json is read up to this size; the page's model is far smaller. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Whether the .rundown/ at git top `top` is this machine's own: the script keeps it out of git with a
 * line in the common info/exclude when it first renders, and a .rundown/ that the repository tracks
 * (one that came with a clone) is never briefed from, so a repository can't put words in the session.
 * Reads files only; anything it can't read counts as not ours.
 */
export function ownRundown(top: string): boolean {
  try {
    const dotGit = path.join(top, '.git');
    let gitDir = dotGit;
    if (statSync(dotGit).isFile()) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, 'utf8'));
      if (!m) return false;
      gitDir = path.resolve(top, m[1]);
    }
    const commonFile = path.join(gitDir, 'commondir');
    const common = existsSync(commonFile) ? path.resolve(gitDir, readFileSync(commonFile, 'utf8').trim()) : gitDir;
    const exclude = path.join(common, 'info', 'exclude');
    if (!existsSync(exclude) || !/^\/?\.rundown\/?\s*$/m.test(readFileSync(exclude, 'utf8'))) return false;
    const index = path.join(gitDir, 'index');
    return !existsSync(index) || !readFileSync(index).includes('.rundown/');
  } catch {
    return false;
  }
}

/**
 * The .rundown/rundown.json to brief from for a session in `start`: inside a git repository only the one
 * at its top (where the script writes it), and only when ownRundown says it is this machine's; outside
 * git the nearest at or above `start`, never above the home folder.
 */
export function findRundown(start: string, home = os.homedir()): string | null {
  let dir = path.resolve(start);
  let nearest: string | null = null;
  for (;;) {
    const file = path.join(dir, '.rundown', 'rundown.json');
    if (existsSync(path.join(dir, '.git'))) return existsSync(file) && ownRundown(dir) ? file : null;
    if (!nearest && existsSync(file)) nearest = file;
    const up = path.dirname(dir);
    if (dir === home || up === dir) return nearest;
    dir = up;
  }
}

/** Just enough shape to brief from; anything else is skipped. */
function looksLikeRundown(x: unknown): x is Rundown {
  const r = x as Partial<Rundown> | null;
  return !!r && typeof r.generatedAt === 'string' && !!r.project && typeof r.project.name === 'string' && Array.isArray(r.parts) && Array.isArray(r.milestones) && Array.isArray(r.decisions);
}

/** The hook's stdout for a session in `cwd`, or '' when there is nothing to say. */
export function sessionStart(cwd: string, now = new Date(), home = os.homedir()): string {
  try {
    const file = findRundown(cwd, home);
    if (!file || statSync(file).size > MAX_FILE_BYTES) return '';
    const r: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!looksLikeRundown(r)) return '';
    const brief = sessionBrief(r, now);
    return brief ? sessionStartOutput(brief) : '';
  } catch {
    return '';
  }
}

/** The folder the hook input names (`cwd`), else the project dir Claude Code sets, else the process's own. */
export function hookCwd(stdin: string, env: NodeJS.ProcessEnv = process.env): string {
  try {
    const cwd = (JSON.parse(stdin) as { cwd?: unknown }).cwd;
    if (typeof cwd === 'string' && path.isAbsolute(cwd)) return cwd;
  } catch {
    // not JSON: fall through
  }
  return env.CLAUDE_PROJECT_DIR && path.isAbsolute(env.CLAUDE_PROJECT_DIR) ? env.CLAUDE_PROJECT_DIR : process.cwd();
}

/** Reads stdin when it is piped (at most 1 s and 64 KB), else ''. */
export function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let text = '';
    const done = () => {
      clearTimeout(timer);
      process.stdin.removeAllListeners();
      process.stdin.destroy();
      resolve(text);
    };
    const timer = setTimeout(done, 1000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c: string) => {
      text += c;
      if (text.length > 64 * 1024) done();
    });
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}
