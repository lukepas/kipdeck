/**
 * The counters on the top bar: how many units need you, are stuck, wait for review and are at work,
 * across the building (the one ranking in shared/attention.ts, as the tab title and Mission control
 * count them), each its glyph and a mono number, and each a button into Mission control. After them,
 * in violet, what Proof of Merge has settled on devnet. No three.js here: the 2D view uses it too.
 */
import './counters.css';
import { LEVEL_LABEL, type AttentionLevel } from '../../shared/attention';
import { store, type MissionTab } from '../state';
import { h } from './dom';
import { icon, LEVEL_ICON } from './icons';

/** The levels on the bar, most urgent first; parked units are not counted there. */
const SHOWN: readonly AttentionLevel[] = ['needs-you', 'stuck', 'review', 'working'];

/** The words after each number. */
const WORDS: Record<AttentionLevel, string> = { 'needs-you': 'need you', stuck: 'stuck', review: 'to review', working: 'working', parked: 'parked' };

/** Paid-out bounties on every floor: how many, and how much of each token. */
export function proofTally(): { released: number; amounts: Map<string, number>; network?: string } {
  let released = 0;
  const amounts = new Map<string, number>();
  let network: string | undefined;
  for (const b of Object.values(store.bounties ?? {})) {
    if (!b?.enabled) continue;
    network ??= b.network;
    for (const item of b.items) {
      if (item.phase !== 'released') continue;
      released++;
      const n = Number(item.amount) / 10 ** item.decimals;
      if (Number.isFinite(n)) amounts.set(item.symbol, (amounts.get(item.symbol) ?? 0) + n);
    }
  }
  return { released, amounts, network };
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/**
 * Fills `el` with the counters and keeps them current. `open` takes you to the Mission control tab
 * for a level (needs you, stuck and working land on Attention; to review on Review).
 */
export function mountCounters(el: HTMLElement, open: (tab: MissionTab) => void): () => void {
  let last = '';
  function render() {
    const counts = store.counts();
    const proof = proofTally();
    const key = JSON.stringify([counts, proof.released, [...proof.amounts]]);
    if (key === last) return;
    last = key;
    const buttons = SHOWN.map((level) => {
      const n = counts[level];
      return h(
        'button.counter',
        {
          type: 'button',
          class: `c-${level}${n ? ' live' : ''}`,
          title: `${LEVEL_LABEL[level]}: ${n}. Open Mission control`,
          'aria-label': `${n} ${WORDS[level]}`,
          onclick: () => open(level === 'review' ? 'review' : 'attention'),
        },
        icon(LEVEL_ICON[level], 14),
        h('b', {}, String(n)),
        h('span.cw', {}, WORDS[level]),
      );
    });
    const tally = proof.network
      ? h(
          'button.counter.c-proof',
          { type: 'button', title: `Proof of Merge on ${proof.network}: bounties paid only on a human merge. Open the review inbox`, onclick: () => open('review') },
          icon('merged', 14),
          h('b', {}, String(proof.released)),
          h('span.cw', {}, 'merged'),
          ...[...proof.amounts].map(([sym, amt]) => h('span.cw.amt', {}, `${num(amt)} ${sym}`)),
          h('span.net', {}, proof.network === 'mock' ? 'mock' : 'devnet'),
        )
      : null;
    el.replaceChildren(...buttons, ...(tally ? [h('span.counter-sep', { 'aria-hidden': 'true' }), tally] : []));
  }
  const offs = (['roster', 'bounties', 'workers', 'signins', 'floors'] as const).map((t) => store.on(t, render));
  // Times in a state move a unit between levels without a message (working long enough to be stuck).
  const timer = setInterval(render, 30_000);
  render();
  return () => {
    clearInterval(timer);
    for (const off of offs) off?.();
  };
}
