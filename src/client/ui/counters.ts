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
import { sumUnits, tokenUnits } from '../../shared/money';

/** The levels on the bar, most urgent first; parked units are not counted there. */
const SHOWN: readonly AttentionLevel[] = ['needs-you', 'stuck', 'review', 'working'];

/** The words after each number. */
const WORDS: Record<AttentionLevel, string> = { 'needs-you': 'need you', stuck: 'stuck', review: 'to review', working: 'working', parked: 'parked' };

/** The words after `n` at `level`: "1 needs you", "2 need you" (the pod plates say it the same way). */
export const countWord = (level: AttentionLevel, n: number) => (level === 'needs-you' && n === 1 ? 'needs you' : WORDS[level]);

/** Paid-out bounties on every floor: how many, and how much of each token (shared/money.ts, as /pom/ writes it). */
export function proofTally(): { released: number; amounts: Map<string, string>; network?: string } {
  let released = 0;
  const paid = new Map<string, { amount: string; decimals: number }[]>();
  let network: string | undefined;
  for (const b of Object.values(store.bounties ?? {})) {
    if (!b?.enabled) continue;
    network ??= b.network;
    for (const item of b.items) {
      if (item.phase !== 'released') continue;
      released++;
      paid.set(item.symbol, [...(paid.get(item.symbol) ?? []), { amount: item.amount, decimals: item.decimals }]);
    }
  }
  const amounts = new Map([...paid].map(([sym, items]) => {
    const t = sumUnits(items);
    return [sym, tokenUnits(t.units, t.decimals)] as const;
  }));
  return { released, amounts, network };
}

/**
 * Fills `el` with the counters and keeps them current. `open` takes you to the Mission control tab
 * for a level (needs you, stuck and working land on Attention; to review on Review).
 */
export function mountCounters(el: HTMLElement, open: (tab: MissionTab) => void): () => void {
  let last = '';
  /** The numbers as last drawn, so a number that changed rolls once (120 ms) toward its new value. */
  let was: Record<string, number> | null = null;
  const roll = (key: string, n: number) => (was && was[key] !== undefined && was[key] !== n ? (n > was[key] ? '.roll.up' : '.roll.down') : '');
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
          'aria-label': `${n} ${countWord(level, n)}`,
          onclick: () => open(level === 'review' ? 'review' : 'attention'),
        },
        icon(LEVEL_ICON[level], 14),
        h(`b${roll(level, n)}`, {}, String(n)),
        h('span.cw', {}, countWord(level, n)),
      );
    });
    const tally = proof.network
      ? h(
          'button.counter.c-proof',
          { type: 'button', title: `Proof of Merge on ${proof.network}: bounties paid only on a human merge. Open the review inbox`, onclick: () => open('review') },
          icon('merged', 14),
          h(`b${roll('proof', proof.released)}`, {}, String(proof.released)),
          h('span.cw', {}, 'merged'),
          ...[...proof.amounts].map(([sym, amt]) => h('span.cw.amt', {}, `${amt} ${sym}`)),
          h('span.net', {}, proof.network === 'mock' ? 'mock' : 'devnet'),
        )
      : null;
    el.replaceChildren(...buttons, ...(tally ? [h('span.counter-sep', { 'aria-hidden': 'true' }), tally] : []));
    was = { ...counts, proof: proof.released };
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
