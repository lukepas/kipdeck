// "While you were away" on the page itself: watching for your return, the palette's way back to it
// and the 2D view's card with its summary. The window with the events themselves is digest.ts, which
// the Deck opens; the home page draws only this card, so it doesn't load the timeline's rows up front
// (tests/home-budget.test.ts).

import { duration } from '../../../shared/attention';
import { digest, type Digest } from '../../../shared/digest';
import type { Net } from '../../net';
import { stampHere, store } from '../../state';
import { h, modalOpen, onModalChange } from '../dom';
import { icon } from '../icons';

/** The digest of what happened since `store.away.since`, once the server has answered. */
export function awayDigest(): (Digest & { since: number }) | undefined {
  const a = store.away;
  return a?.events ? { ...digest(a.events, store.ranked()), since: a.since } : undefined;
}

export const sinceLabel = (since: number) => `Since ${new Date(since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${duration(Date.now() - since)} ago)`;

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

/** The 2D view's first card: the digest's summary, until you dismiss it or go to what needs you. */
export function digestCard(showAttention: () => void, dismiss: () => void): HTMLElement | null {
  const d = awayDigest();
  if (!d) return null;
  return h(
    'li.lite-digest',
    {},
    h('div.dg-head', {}, h('b', {}, 'While you were away'), h('button.btn.small', { type: 'button', 'aria-label': 'Dismiss', onclick: dismiss }, icon('close', 16))),
    h('p.dg-since', {}, sinceLabel(d.since)),
    h('p.dg-summary', {}, d.summary),
    h('button.btn.primary.small', { type: 'button', onclick: showAttention }, 'Show what needs me'),
  );
}
