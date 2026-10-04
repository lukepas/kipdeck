// The unit console's left column, beside its terminal: who the unit is and where its work stands, so
// the terminal window reads as a console for one unit rather than a bare shell. Its call sign, its
// harness and model, its branch, its pull request, the bounty its merge would pay and what it has
// spent. Kept current by the terminal window (paint), from the store.
import './term-meta.css';
import { callSign, address } from '../../shared/callsign';
import { tokenLabel } from '../../shared/money';
import { ago } from '../../shared/rowtext';
import type { WorkerInfo } from '../../shared/protocol';
import { store } from '../state';
import { h } from './dom';
import { icon } from './icons';
import { engineLabel } from './provider';

/** One line of the column: a small mono label over its value. */
const line = (label: string, value: Node | string | null | undefined) => (value ? h('div.tm-line', {}, h('span.tm-k', {}, label), h('span.tm-v', {}, value)) : null);

export function termMeta(): { el: HTMLElement; paint(w: WorkerInfo): void } {
  const el = h('aside.term-meta', { 'aria-label': 'Unit' });
  let last = '';
  const paint = (w: WorkerInfo) => {
    const att = store.ranked(store.floor).find((r) => r.entry.id === w.id)?.att;
    const bounty = (store.bounties?.[store.floor ?? '']?.items ?? []).find((b) => (w.pr && b.claimPr === w.pr.number) || (w.issue !== undefined && b.issue === w.issue));
    const key = JSON.stringify([w.name, w.deskId, w.status, w.worktree?.branch, w.pr, w.usage?.cost, att?.label, bounty?.phase, bounty?.amount]);
    if (key === last) return;
    last = key;
    const parts: (HTMLElement | null)[] = [
      h('div.tm-sign', {}, callSign(w.deskId) || '--'),
      h('div.tm-name', {}, w.name, h('small', {}, address(w.deskId))),
      att ? h('div.tm-state', { class: att.level }, att.label, h('small', {}, ago(Date.now() - att.since))) : null,
      line('Harness', w.kind === 'agent' ? engineLabel(w, store.project) : 'shell'),
      line('Branch', w.worktree?.branch ?? 'main checkout'),
      line('Pull request', w.pr ? h('a', { href: w.pr.url, target: '_blank', rel: 'noopener noreferrer' }, `#${w.pr.number}`, icon('external', 11)) : 'none yet'),
      line('Bounty', bounty ? h('span.tm-proof', {}, tokenLabel(bounty.amount, bounty.decimals, bounty.symbol), h('small', {}, bounty.phase === 'released' ? 'paid on devnet' : 'paid on a merge')) : null),
      line('Spent', w.usage && w.usage.cost > 0 ? `$${w.usage.cost.toFixed(2)}` : null),
    ];
    el.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
  };
  return { el, paint };
}
