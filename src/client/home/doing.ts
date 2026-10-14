// A Working row's own parts (list.ts draws the row): the muted line under what it's doing, with the
// turn's phase, the files it touched this turn and how its last test run went (a check or a warning
// shape beside the words, never colour alone), and its clock, "working 12m", or "quiet 4m" once it has
// gone still for a while before it would count as stuck. The words and rules are src/shared/doing.ts.

import { turnWords, workingClock } from '../../shared/doing';
import type { RosterEntry } from '../../shared/protocol';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import './doing.css';

/** The words a screen reader hears for the row's second line and clock. */
export function workingSpoken(e: RosterEntry, now: number): string {
  const t = e.turn ? turnWords(e.turn) : undefined;
  return [workingClock(e, now).text, t?.phase, t?.files, t?.test].filter(Boolean).join(', ');
}

/** "Editing, 3 files, [check] tests passed" (dots between them, from doing.css), or nothing before its turn has any facts. */
export function workingFacts(e: RosterEntry): HTMLElement | null {
  if (!e.turn) return null;
  const t = turnWords(e.turn);
  const pass = e.turn.test === 'pass';
  return h(
    'span.row-facts',
    { 'aria-hidden': 'true' },
    h('span.rf-phase', {}, t.phase),
    t.files ? h('span.rf-item', {}, t.files) : null,
    t.test ? h('span.rf-item.rf-test', { class: pass ? 't-pass' : 't-fail' }, icon(pass ? 'check' : 'warning', 11), t.test) : null,
  );
}

/** Its clock: "working 12m", or "quiet 4m" in the text colour once it has gone still. */
export function workingAge(e: RosterEntry, now: number): HTMLElement {
  const c = workingClock(e, now);
  return h('span.row-age', { class: c.quiet ? 'quiet' : undefined, 'data-quiet': c.quiet ? 'true' : undefined }, c.text);
}
