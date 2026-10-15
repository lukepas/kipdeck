// "While you were away": back after AWAY_MS or more, a short summary of what happened since you left
// (shared/digest.ts) and the events themselves, once. In the 3D office it's this window, which waits
// for you to finish with any other window and to stop typing (watchAway, away.ts); in the 2D view
// it's the first card, also in away.ts. The command palette opens it again.

import { digestShown, type Digest } from '../../../shared/digest';
import { store } from '../../state';
import { h, openModal, type Modal } from '../dom';
import type { MissionDeps } from './act';
import { eventRow } from './timeline';
import { awayDigest, sinceLabel } from './away';

/** What the digest's window shows. */
function digestBody(deps: MissionDeps, d: Digest & { since: number }, showFloor: boolean): HTMLElement[] {
  const shown = digestShown(d.events, 50);
  return [
    h('p.dg-since', {}, sinceLabel(d.since)),
    h('p.dg-summary', {}, d.summary),
    shown.length ? h('ul.mc-rows.tl-rows.dg-events', {}, ...shown.map((e) => eventRow(deps, e, showFloor))) : h('p.mc-empty', {}, 'Nothing went on the timeline.'),
    d.events.length > shown.length || store.away?.more ? h('p.mc-note', {}, 'More on the Timeline tab.') : h('span'),
  ];
}

let modal: Modal | null = null;

/** Opens the digest's window, once the server has said what happened. */
export function openDigest(deps: MissionDeps, showAttention: () => void) {
  const d = awayDigest();
  if (!d || modal) return;
  const showFloor = store.floors.length > 1;
  const go = h('button.btn.primary', { type: 'button' }, 'Show what needs me');
  const el = h('div.modal.mission-control.digest', { role: 'dialog', 'aria-label': 'While you were away' }, h('header', {}, h('h2', {}, 'While you were away')), h('div.mc-body', {}, ...digestBody(deps, d, showFloor)), h('footer', {}, go));
  modal = openModal(el, { closeButton: true, doing: 'catching up', onClose: () => (modal = null) });
  go.addEventListener('click', () => {
    modal?.close();
    showAttention();
  });
  setTimeout(() => go.focus({ preventScroll: true }), 30);
}
