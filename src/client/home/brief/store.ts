// The line comments left on agents' diffs in this page, by agent, until they go with a Send back
// (shared/brief/comments.ts bundles them). Small and loaded with the page, so Send back can read them;
// drawing them in the diff is comments.ts, loaded with the brief's view.

import { bundleComments, type LineComment } from '../../../shared/brief/comments';

const byWorker = new Map<string, LineComment[]>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

export function onComments(fn: () => void) {
  listeners.add(fn);
}

export function commentsOf(workerId: string): readonly LineComment[] {
  return byWorker.get(workerId) ?? [];
}

/** The start of a Send back note: the comments on its diff, anchored. Empty with none. */
export function commentsNote(workerId: string): string {
  return bundleComments(commentsOf(workerId));
}

/** They went with a Send back (or are thrown away). */
export function clearComments(workerId: string) {
  if (byWorker.delete(workerId)) changed();
}

export function addComment(workerId: string, c: LineComment) {
  const list = byWorker.get(workerId) ?? [];
  byWorker.set(workerId, [...list.filter((x) => !(x.path === c.path && x.line === c.line && !!x.removed === !!c.removed)), c]);
  changed();
}

export function removeComment(workerId: string, c: LineComment) {
  const list = (byWorker.get(workerId) ?? []).filter((x) => x !== c);
  if (list.length) byWorker.set(workerId, list);
  else byWorker.delete(workerId);
  changed();
}

