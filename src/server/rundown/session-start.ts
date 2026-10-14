// `rundown.mjs session-start`: the plugin's SessionStart hook (hooks/hooks.json). It reads the hook's
// input on stdin for the session's folder, finds the nearest .rundown/rundown.json at or above it (up to
// the git top, never above the home folder), and prints the brief as the hook's JSON when the map is
// under a week old. It never writes, never runs git and never fails a session: any problem prints
// nothing and exits 0.

import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Rundown } from '../../shared/rundown/schema.js';
import { sessionBrief, sessionStartOutput } from '../../shared/rundown/session-brief.js';

/** rundown.json is read up to this size; the page's model is far smaller. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** The nearest .rundown/rundown.json from `start` up to the git top, the home folder or /. */
export function findRundown(start: string, home = os.homedir()): string | null {
  let dir = path.resolve(start);
  for (;;) {
    const file = path.join(dir, '.rundown', 'rundown.json');
    if (existsSync(file)) return file;
    if (existsSync(path.join(dir, '.git')) || dir === home) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
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
