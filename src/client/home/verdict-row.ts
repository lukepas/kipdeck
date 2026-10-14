// A To review row's verdict, so review is a scan: a check and "Tested, nothing flagged", or a warning
// and the gaps ("No tests, touches sign-in code"), then what it changed. The office works it out and
// sends it with the row (RosterEntry.verdict); the words are shared/brief/row-verdict.ts. The row's
// button stays Review changes: Merge is in the pane, with the brief and the diff in view.

import { verdictWords } from '../../shared/brief/row-verdict';
import { changeSummary } from '../../shared/inbox';
import type { RosterEntry } from '../../shared/protocol';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import './verdict-row.css';

/** The row's status for `e` with its verdict, and the words a screen reader hears; undefined without one. */
export function verdictStatus(e: RosterEntry): { el: HTMLElement; spoken: string } | undefined {
  if (!e.verdict) return undefined;
  const { ready, text } = verdictWords(e.verdict);
  const size = changeSummary(e.work);
  return {
    el: h('span.row-verdict', { class: ready ? 'v-ready' : 'v-gap' }, icon(ready ? 'check' : 'warning', 13), h('span.rv-words', {}, text), size ? h('span.rv-size', {}, size) : null),
    spoken: [ready ? `Ready: ${text}` : text, size].filter(Boolean).join(', '),
  };
}
