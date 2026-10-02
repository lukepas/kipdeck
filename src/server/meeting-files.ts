// Where a meeting's files are, and whether a meeting read back from meetings.json is one the office
// could have made. Its paths are later read, copied from and deleted, so a meetings.json the
// repository ships must not reach files outside the checkout (see docs/security.md).
import { closeSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { MEETING_NOTES_DIR, isMeetingPattern, outputProblem } from '../shared/meetings.js';
import type { Meeting } from '../shared/protocol.js';
import { isSafeId, realWithin, within } from './safefs.js';
import { BRANCH_PREFIX, WORKTREES_DIR, type WorktreeRef } from './worktrees.js';

/** The checkout a meeting works in: its worktree, or the floor's own. `dir` is the floor's checkout. */
export function meetingCwd(dir: string, m: Meeting): string {
  return m.worktree ? path.join(dir, m.worktree.path) : dir;
}

/**
 * A file of the meeting's, relative to its checkout, as an absolute path: undefined when it would
 * land outside that checkout once symlinks are followed (a symlink the repository ships, say).
 */
export function meetingFile(dir: string, m: Meeting, rel: string): string | undefined {
  const cwd = meetingCwd(dir, m);
  const abs = path.resolve(cwd, rel);
  return within(cwd, abs) && realWithin(cwd, abs) ? abs : undefined;
}

/**
 * Whether a meeting read back from meetings.json is one this office could have made: its id is
 * one of its own, its worktree is under .agent-office/worktrees on an office/ branch, its notes
 * are where the office keeps them, and its output and every part's file are inside its checkout.
 */
export function restorableMeeting(dir: string, m: Partial<Meeting>): m is Meeting {
  if (!isSafeId(m.id) || !isMeetingPattern(m.pattern) || !Array.isArray(m.seats) || !Array.isArray(m.turns)) return false;
  if (m.seats.some((s) => !s || typeof s.deskId !== 'string' || (s.workerId !== undefined && !isSafeId(s.workerId)))) return false;
  if (m.worktree !== undefined) {
    const wt = m.worktree as Partial<WorktreeRef> | null;
    if (!wt || typeof wt.path !== 'string' || typeof wt.branch !== 'string') return false;
    const trees = path.join(dir, WORKTREES_DIR);
    const abs = path.resolve(dir, wt.path);
    if (path.dirname(abs) !== trees || !isSafeId(path.basename(abs)) || !realWithin(trees, abs)) return false;
    if (!wt.branch.startsWith(BRANCH_PREFIX) || !/^[\w./-]+$/.test(wt.branch) || wt.branch.includes('..')) return false;
    if (wt.base !== undefined && (typeof wt.base !== 'string' || !/^[0-9a-f]{7,64}$/.test(wt.base))) return false;
  }
  const notes = m.worktree ? MEETING_NOTES_DIR : `.agent-office/meetings/${m.id}`;
  if (m.notes !== notes) return false;
  if (typeof m.output !== 'string' || outputProblem(m.output)) return false;
  if (m.turns.some((t) => !t || typeof t.file !== 'string' || !relativeInside(t.file))) return false;
  const probe = m as Meeting;
  return [m.output, m.notes, ...m.turns.map((t) => t.file)].every((f) => meetingFile(dir, probe, f) !== undefined);
}

/** A path relative to a checkout that stays in it: no leading slash or drive, no . or .. parts. */
function relativeInside(p: string): boolean {
  if (!p || p.length > 300 || /^[/\\]|^[a-zA-Z]:|[\0-\x1f]/.test(p)) return false;
  return p.split(/[/\\]/).every((x) => x !== '..' && x !== '.' && x !== '');
}

/** The start of a file, at most `bytes` of it. */
export function readStart(file: string, bytes: number): string {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString('utf8').replace(/�+$/, '');
  } finally {
    closeSync(fd);
  }
}
