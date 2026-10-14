// The one place Kipdeck writes into a person's .rundown/decisions.md, and only two narrow edits
// (shared/rundown/answer.ts): an admin's answer fills in one decision's empty Answer: line, and an
// agent's `kipdeck decide` adds one decision to Open. Each reads the file fresh, refuses a symlink on
// the way or a file outside the checkout, and writes it whole through safefs.writeState (a new file
// renamed over the old, never written through a link). An answer also carries the file's mtime as the
// page saw it: when the file changed since (someone edited it by hand, or /rundown ran), nothing is
// written and the page is told to look again.

import { lstatSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isoLocal } from '../../shared/rundown/model.js';
import { raisedByOf, raiseDecision, setAnswer, type DecisionAsk, type RaisedBy } from '../../shared/rundown/answer.js';
import { parseDecisions } from '../../shared/rundown/markdown.js';
import type { Decision } from '../../shared/rundown/schema.js';
import { LIMITS } from '../../shared/rundown/schema.js';
import { isSymlink, realWithin, writeState } from '../safefs.js';

export const DECISIONS_REL = path.join('.rundown', 'decisions.md');

/** Where `dir`'s decisions.md is, or why it can't be touched: .rundown or the file is a symlink, or it leads out of the checkout. */
export function decisionsPath(dir: string): { file: string } | { error: string } {
  const folder = path.join(dir, '.rundown');
  const file = path.join(dir, DECISIONS_REL);
  if (isSymlink(folder) || isSymlink(file)) return { error: '.rundown/decisions.md is behind a symlink: Kipdeck leaves it alone' };
  if (!realWithin(dir, file)) return { error: '.rundown/decisions.md is outside the project' };
  return { file };
}

/** decisions.md's text and mtime (ms), or nulls when there's none (or it's too big to be a person's file). */
export function readDecisionsFile(file: string): { md: string | null; mtime: number | null } {
  try {
    const st = lstatSync(file);
    if (!st.isFile() || st.size > LIMITS.skillFileBytes) return { md: null, mtime: null };
    return { md: readFileSync(file, 'utf8'), mtime: Math.trunc(st.mtimeMs) };
  } catch {
    return { md: null, mtime: null };
  }
}

/** The mode a rewritten file keeps: the old one's, else rw for its owner and readable by others. */
function modeOf(file: string): number {
  try {
    return lstatSync(file).mode & 0o777;
  } catch {
    return 0o644;
  }
}

export type AnswerResult = { ok: true; decision: Decision; raisedBy: RaisedBy | null } | { ok: false; error: string; stale?: boolean };

/**
 * Answers decision `id` in `dir`'s decisions.md with `answer`, as of the file at `mtime` (null: the
 * page saw no file, so there is nothing to answer). Changes that one line and nothing else.
 */
export function answerDecision(dir: string, id: string, answer: string, mtime: number | null): AnswerResult {
  if (!/^D\d{1,5}$/.test(id)) return { ok: false, error: 'No such decision' };
  const where = decisionsPath(dir);
  if ('error' in where) return { ok: false, error: where.error };
  const { md, mtime: now } = readDecisionsFile(where.file);
  if (md === null) return { ok: false, error: 'There is no .rundown/decisions.md in this project any more', stale: true };
  if (mtime === null || now !== Math.trunc(mtime)) return { ok: false, error: 'decisions.md changed since you looked: here it is again', stale: true };
  const next = setAnswer(md, id, answer);
  if ('error' in next) return { ok: false, error: next.error, stale: true };
  writeState(where.file, next.md, modeOf(where.file));
  const decision = parseDecisions(next.md).find((d) => d.id === id)!;
  return { ok: true, decision, raisedBy: raisedByOf(next.md, id) };
}

/**
 * Raises `ask` as a new open decision in `dir`'s decisions.md (making .rundown/ and the file when
 * there's none yet), by `by` when an agent asked. Says the id it got.
 */
export function raiseInFile(dir: string, ask: DecisionAsk, by?: RaisedBy, now = new Date()): { id: string; file: string } | { error: string } {
  const where = decisionsPath(dir);
  if ('error' in where) return where;
  try {
    mkdirSync(path.dirname(where.file), { recursive: true });
  } catch (err) {
    return { error: `Couldn't make .rundown/: ${err instanceof Error ? err.message : String(err)}` };
  }
  const { md } = readDecisionsFile(where.file);
  const raised = raiseDecision(md, ask, isoLocal(now).slice(0, 10), by);
  writeState(where.file, raised.md, modeOf(where.file));
  return { id: raised.id, file: where.file };
}
