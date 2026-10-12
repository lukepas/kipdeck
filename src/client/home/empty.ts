// The pane with nothing selected: the work first (shared/empty-pane.ts). The next agent that needs
// you, with its task, what it wants and how long it has waited, and one button to open it; with nobody
// waiting, "All clear" with the day so far and what shipped today, under the greeting and Kip (warm.ts,
// the one place the pane has a picture, and never while anyone needs you). Before the first agent
// the setup card's preview has it. With the Deck lab switched on, the deck plan sits under the work as
// a small extra (its Proof corner only once Proof of Merge is set up, client/proof-ready.ts).

import { emptyPane, moreWords } from '../../shared/empty-pane';
import { todayPulse } from '../../shared/metrics';
import { waitWords } from '../../shared/wait';
import type { ShipRecord } from '../../shared/protocol';
import { store } from '../state';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { proofReady } from '../proof-ready';
import type { Actions } from './actions';
import { agentMark, currentView, entryTitle, needsYouNow, waitingNow } from './list';
import { preview } from './preview';
import * as lazy from './lazy';
import { home } from './state';
import './empty.css';

/** "3 agents working, 1 merged today, median wait 32s today": the day so far, for the calm pane. */
export function daySoFar(working: number, merged: number, medianWaitMs: number | undefined): string {
  const parts = [working ? `${working} agent${working === 1 ? '' : 's'} working` : 'no agent working', `${merged} merged today`];
  if (medianWaitMs !== undefined) parts.push(`median wait ${waitWords(medianWaitMs)} today`);
  const s = parts.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

/** When the last one waiting on you was dealt with, so the cleared queue is marked once, just then. */
let clearedAt = 0;

/** The queue of people-waits just emptied: the all-clear check draws itself in on the next paint. */
export function markCleared() {
  clearedAt = Date.now();
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function shippedItem(r: ShipRecord): HTMLElement {
  return h('li', {}, agentMark(r.provider), h('span.pe-ship-title', {}, r.task ?? r.branch ?? 'Agent work'), h('span.pe-ship-at', {}, time(r.at)));
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
    // The greeting and Kip, and the night shift's line, filled by warm.ts once it's loaded (never while anyone needs you).
    // The gate is in the markup, so the pane is drawn again (and Kip leaves) the moment a question
    // lands outside the filtered view, where this pane would otherwise say the same as before.
    const warm = h('div.pe-warm', { 'data-quiet': needsYouNow() === 0 ? 'yes' : 'no' });
    const warmLine = h('p.pe-warm-line');
    void lazy.warm().then((w) => w.fillCalm(warm, warmLine, pane.working));
    return h(
      'div.pe.calm',
      { class: earned ? 'earned' : '' },
      warm,
      h('span.pe-ok', {}, icon('check', 20)),
      h('h2', {}, 'All clear'),
      warmLine,
      h('p', {}, daySoFar(pane.working, day.merged, day.medianWaitMs)),
      pane.shipped.length
        ? h(
            'section.pe-shipped',
            { 'aria-label': 'Shipped today' },
            h('h3', {}, 'Shipped today', h('small', {}, pane.line)),
            h('ol', {}, ...pane.shipped.map(shippedItem)),
            pane.total > pane.shipped.length ? h('p.pe-more', {}, `and ${pane.total - pane.shipped.length} more in Shipped today`) : null,
          )
        : null, // the line above already says 0 merged today
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
