// The pane with nothing selected: the work first (shared/empty-pane.ts). The next agent that needs
// you, with its task, what it wants and how long it has waited, and one button to open it; with nobody
// waiting, Kip (kip-moments.ts, the one place the pane has a picture, and never while anyone needs
// you), "All clear. Nobody's waiting on you.", one warm line (warm.ts) and the day so far on one line.
// What shipped today is in Shipped today under the list, so the pane doesn't say it twice. Before the first agent
// the setup card's preview has it. With the Deck lab switched on, the deck plan sits under the work as
// a small extra (its Proof corner only once Proof of Merge is set up, client/proof-ready.ts).

import { emptyPane, moreWords } from '../../shared/empty-pane';
import { todayPulse } from '../../shared/metrics';
import { waitWords } from '../../shared/wait';
import { store } from '../state';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { proofReady } from '../proof-ready';
import type { Actions } from './actions';
import { calmPose, ALL_CLEAR } from '../../shared/warm';
import { clearLine, said } from './warm';
import { agentMark, currentView, entryTitle, needsYouNow, waitingNow } from './list';
import { preview } from './preview';
import * as lazy from './lazy';
import { home } from './state';
import './empty.css';

/** "3 working · 1 merged today · median wait 32s": the day so far on one line, for the calm pane. */
export function daySoFar(working: number, merged: number, medianWaitMs: number | undefined): string {
  const parts = [`${working} working`, `${merged} merged today`];
  if (medianWaitMs !== undefined) parts.push(`median wait ${waitWords(medianWaitMs)}`);
  return parts.join(' · ');
}

/** When the last one waiting on you was dealt with, so the cleared queue is marked once, just then. */
let clearedAt = 0;

/** The queue of people-waits just emptied: the all-clear check draws itself in on the next paint. */
export function markCleared() {
  clearedAt = Date.now();
}

/** The pane with nothing selected, drawn from what the list shows now. */
export function emptyState(actions: Actions): HTMLElement {
  const keys = h('p.pe-keys', {}, h('kbd', {}, 'Up'), h('kbd', {}, 'Down'), ' to move · ', h('kbd', {}, 'Enter'), ' to open · ', h('kbd', {}, '?'), ' for help');
  const view = currentView();
  const records = home.project ? home.records.filter((r) => r.floor === home.project) : home.records;
  const now = Date.now();
  const pane = emptyPane(view, records, now, store.roster.length > 0);
  if (pane.kind === 'start') return preview();
  if (pane.kind === 'clear') {
    // Cleared just now: the check draws itself in, once (under reduced motion it is simply there).
    const earned = clearedAt > 0 && now - clearedAt < 1_500;
    clearedAt = 0;
    const day = todayPulse(records, waitingNow(view), now);
    // Kip and the warm words only while nobody waits on you, on any project or filter. The gate and
    // his pose are in the markup, so the pane is drawn again (and Kip leaves) the moment a question
    // lands outside the filtered view, where this pane would otherwise say the same as before.
    const calm = needsYouNow() === 0;
    const kip = calm ? h('span.kip.pe-kip', { 'data-pose': calmPose(pane.working, new Date(now).getHours()) }) : null;
    if (kip) void lazy.kipMoments().then((k) => k.fillKip(kip));
    return h(
      'div.pe.calm',
      { class: earned ? 'earned' : '' },
      kip,
      h('h2.warm-clear', {}, ...said(ALL_CLEAR, calm)),
      calm ? clearLine(now) : null,
      h('p.pe-day', {}, daySoFar(pane.working, day.merged, day.medianWaitMs)),
      h('button.btn', { type: 'button', onclick: () => actions.deploy() }, icon('plus', 16), 'Deploy agent'),
      keys,
    );
  }
  const { next, section, waitedMs, more, working } = pane;
  const asks = section === 'needs-you';
  const open = () => home.select(next.entry.id, next.entry.status === 'needs_input' ? 'terminal' : 'changes');
  return h(
    'div.pe.pe-next',
    {},
    h('p.pe-eyebrow', {}, asks ? 'Next up: needs you' : 'Next up: to review'),
    h(
      'button.pe-item',
      { type: 'button', class: asks ? 'needs-you' : 'review', 'data-id': next.entry.id, onclick: open },
      agentMark(next.entry.provider, next.entry.kind),
      h('span.pe-item-text', {}, h('b', {}, entryTitle(next.entry)), h('span', {}, `${next.att.label} · waiting ${waitWords(waitedMs)}`)),
    ),
    h(asks ? 'button.btn.primary.needs-you' : 'button.btn.primary', { type: 'button', 'data-id': next.entry.id, onclick: open }, asks ? 'Answer it' : 'Review it'),
    h('p', {}, [moreWords(more), working ? `${working} agent${working === 1 ? ' is' : 's are'} working.` : ''].filter(Boolean).join(' ')),
    keys,
  );
}

/** The deck plan under the empty pane, while the Deck lab is on; rebuilt when Proof of Merge's readiness changes. */
let plan: { el: HTMLElement; proof: boolean; stop?: () => void; gone?: boolean } | undefined;

/** Stops the plan's live painting and forgets it (the lab went off, or it is being rebuilt). */
function dropPlan() {
  if (!plan) return;
  plan.gone = true;
  plan.stop?.();
  plan = undefined;
}

async function deckPlan(): Promise<HTMLElement | null> {
  if (!store.lab('bridge')) {
    dropPlan();
    return null;
  }
  const proof = proofReady();
  if (plan && plan.proof === proof) return plan.el;
  dropPlan();
  const mine: NonNullable<typeof plan> = { el: h('div.lite-plot', { 'aria-label': 'Deck plan' }), proof };
  plan = mine;
  const { mountLitePlot } = await import('../lite-plot');
  // Replaced while the module loaded: never start painting a plan nobody shows.
  if (mine.gone) return plan?.el ?? null;
  mine.stop = mountLitePlot(mine.el, (id) => home.select(id, 'terminal')).stop;
  return mine.el;
}

/** Puts the deck plan (or none, with the lab off) under the work in `box`, and takes away any older one. */
export async function placeDeckPlan(box: HTMLElement) {
  const el = await deckPlan();
  for (const old of box.querySelectorAll('.lite-plot')) if (old !== el) old.remove();
  if (el && el.parentElement !== box) box.append(el);
}
