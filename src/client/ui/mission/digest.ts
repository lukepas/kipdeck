// "While you were away": back after AWAY_MS or more, a short summary of what happened since you left
// (shared/digest.ts) and the events themselves, once. In the 3D office it's a window, which waits
// for you to finish with any other window and to stop typing; in the 2D view it's the first card.
// The command palette opens it again.

import { duration } from '../../../shared/attention';
import { digest, type Digest } from '../../../shared/digest';
import type { Net } from '../../net';
import { stampHere, store } from '../../state';
import { h, modalOpen, onModalChange, openModal, type Modal } from '../dom';
import type { MissionDeps } from './act';
import { eventRow } from './timeline';

/** The digest of what happened since `store.away.since`, once the server has answered. */
export function awayDigest(): (Digest & { since: number }) | undefined {
  const a = store.away;
  return a?.events ? { ...digest(a.events, store.ranked()), since: a.since } : undefined;
}

const sinceLabel = (since: number) => `Since ${new Date(since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${duration(Date.now() - since)} ago)`;

/** What the digest shows, for the window and for the 2D view's card. */
function digestBody(deps: MissionDeps, d: Digest & { since: number }, showFloor: boolean): HTMLElement[] {
  const shown = d.events.slice(0, 50);
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

/** Someone is typing somewhere on the page: a window shouldn't take that away. */
function typing(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.matches('input, textarea, select') || a.isContentEditable);
}

/** The palette asked for it, or you just came back: open it once the server answers. */
let wanted = false;
/** It opened by itself once already. */
let opened = false;

/**
 * Looks after the digest: asks the server what happened since you left when the welcome says you
 * were away, then `show`s it once nothing is in the way (no other window, nobody typing). Also keeps
 * this browser's "last here" fresh, for the shared password where there's no account to remember it.
 */
export function watchAway(net: Net, show: () => void, inTheWay: () => boolean = () => modalOpen() || typing()) {
  let stamping = 0;
  const tryShow = () => {
    if (!wanted || !store.away?.events) return;
    if (inTheWay()) return;
    wanted = false;
    opened = true;
    show();
  };
  store.on('away', () => {
    const a = store.away;
    if (a === undefined) return;
    // From the first welcome on, this browser is here.
    if (!stamping) {
      stampHere();
      stamping = window.setInterval(() => stampHere(), 60_000);
      window.addEventListener('pagehide', () => stampHere());
    }
    if (!a) return;
    if (!a.events) {
      if (!opened) wanted = true;
      net.send({ t: 'timeline.get', since: a.since });
      return;
    }
    tryShow();
  });
  onModalChange((open) => !open && setTimeout(tryShow, 300));
  window.setInterval(tryShow, 2000);
}

/** The palette's "While you were away": the digest again, or the last hour's when you weren't away. */
export function recallDigest(show: () => void) {
  if (store.away?.events) return show();
  wanted = true;
  // The 'away' topic asks the server (see watchAway).
  store.away = { since: Date.now() - 60 * 60_000 };
  store.emit('away');
}

/** The 2D view's first card: the digest, until you dismiss it or go to what needs you. */
export function digestCard(deps: MissionDeps, showAttention: () => void, dismiss: () => void): HTMLElement | null {
  const d = awayDigest();
  if (!d) return null;
  return h(
    'li.lite-digest',
    {},
    h('div.dg-head', {}, h('b', {}, 'While you were away'), h('button.btn.small', { type: 'button', 'aria-label': 'Dismiss', onclick: dismiss }, '✕')),
    ...digestBody(deps, d, store.floors.length > 1).slice(0, 2),
    h('button.btn.primary.small', { type: 'button', onclick: showAttention }, 'Show what needs me'),
  );
}
