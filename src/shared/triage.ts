// Triage: the inbox one card at a time, from the keyboard (client/home/triage.ts draws it). The cards
// come in the inbox's own attention order, Needs you then To review, and each key does one thing to
// the card on show. Pure, so the tests read it directly: which cards, in what order, what a key does
// on which kind of card, when a key is taken at all, and which keys must be held.
import type { Ranked } from './attention.js';
import type { InboxView } from './inbox.js';
import type { ApprovalRisk, ApprovalView } from './protocol/approvals.js';

/** Keys are ignored this long after a card appears, so a key meant for the last card never lands on the next. */
export const TRIAGE_ARM_MS = 300;

/** How long a key (or a click) is held to allow a destructive call. */
export const TRIAGE_HOLD_MS = 700;

/** How long Z puts an agent aside. */
export const TRIAGE_SNOOZE_MS = 60 * 60_000;

/** What a card is about, which decides the keys it takes. */
export type TriageKind = 'approval' | 'question' | 'review' | 'other';

/** What a key does to the card on show. */
export type TriageVerb = 'once' | 'always' | 'deny' | 'same' | 'choice' | 'reply' | 'snooze' | 'merge' | 'send-back' | 'undo' | 'open' | 'next' | 'prev';

/** The keys as Help and docs/controls.md list them. */
export const TRIAGE_KEYS: readonly [string, string][] = [
  ['Y', 'Allow once'],
  ['A', 'Always allow (the rule it shows)'],
  ['N', 'Deny'],
  ['Shift Y', 'Allow the same call for every agent waiting on it'],
  ['1-9', 'Pick a choice it offered'],
  ['R', 'Reply in words'],
  ['M', 'Merge, with Undo for 7 seconds (U undoes)'],
  ['S', 'Send back with a note'],
  ['Z', 'Snooze for an hour'],
  ['Enter', 'Open it in the pane'],
  ['J K', 'Next or previous card'],
];

/** One card: the agent, and its request when it's an approval. */
export interface TriageCard {
  id: string;
  kind: TriageKind;
  /** Changes when what it waits on changes: a new request, a new wait. Answered cards are skipped by it. */
  key: string;
  ranked: Ranked;
  approval?: ApprovalView;
}

/** What a card is about: an open request first, then finished work, then a question in its terminal. */
export function triageKind(r: Ranked, approval?: ApprovalView): TriageKind {
  if (approval) return 'approval';
  if (r.att.level === 'review') return 'review';
  if (r.entry.kind === 'agent' && r.entry.status === 'needs_input') return 'question';
  return 'other';
}

/**
 * The cards, in the inbox's order: Needs you, then To review. `approvalOf` is an agent's oldest open
 * request; `skip` leaves out a card by its key (answered here and not gone yet, snoozed) or by its
 * agent (a merge held for its Undo).
 */
export function triageCards(view: Pick<InboxView, 'sections'>, approvalOf: (id: string) => ApprovalView | undefined, skip: (key: string, id: string) => boolean): TriageCard[] {
  const out: TriageCard[] = [];
  for (const r of [...view.sections['needs-you'], ...view.sections.review]) {
    const approval = approvalOf(r.entry.id);
    const kind = triageKind(r, approval);
    const key = approval ? `a:${approval.id}` : `${r.entry.id}:${r.att.level}:${r.att.since}`;
    if (!skip(key, r.entry.id)) out.push({ id: r.entry.id, kind, key, ranked: r, approval });
  }
  return out;
}

/** What a key press does on a card of `kind`, or undefined when that card has no use for it. */
export function triageVerb(k: { key: string; shiftKey?: boolean }, kind: TriageKind, o: { always?: boolean; choices?: number } = {}): { verb: TriageVerb; choice?: string } | undefined {
  const key = k.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (lower === 'j' || key === 'ArrowDown' || key === 'ArrowRight') return { verb: 'next' };
  if (lower === 'k' || key === 'ArrowUp' || key === 'ArrowLeft') return { verb: 'prev' };
  if (key === 'Enter') return { verb: 'open' };
  if (lower === 'z') return { verb: 'snooze' };
  if (lower === 'u') return { verb: 'undo' };
  if (kind === 'approval') {
    if (lower === 'y') return { verb: k.shiftKey || key === 'Y' ? 'same' : 'once' };
    if (lower === 'a' && o.always) return { verb: 'always' };
    if (lower === 'n') return { verb: 'deny' };
    return undefined;
  }
  if (kind === 'question') {
    if (/^[1-9]$/.test(key) && Number(key) <= (o.choices ?? 0)) return { verb: 'choice', choice: key };
    if (lower === 'r') return { verb: 'reply' };
    return undefined;
  }
  if (kind === 'review') {
    if (lower === 'm') return { verb: 'merge' };
    if (lower === 's') return { verb: 'send-back' };
  }
  return undefined;
}

/**
 * Whether a key may act yet: not in the first TRIAGE_ARM_MS after its card appeared. Undo is about the
 * merge held last, not the card on show, so it never waits.
 */
export const triageArmed = (shownAt: number, now: number, verb?: TriageVerb) => verb === 'undo' || now - shownAt >= TRIAGE_ARM_MS;

/** Whether `verb` has to be held: allowing a call tagged destructive. */
export function needsHold(verb: TriageVerb, risks: readonly ApprovalRisk[] = []): boolean {
  return (verb === 'once' || verb === 'always' || verb === 'same') && risks.includes('destructive');
}

/** The open requests asking for the same call as `a` (the same tool with the same input, `call` in approval.ts), `a` first. */
export function sameCallRequests(all: Iterable<ApprovalView>, a: ApprovalView): ApprovalView[] {
  if (!a.call) return [a];
  return [a, ...[...all].filter((x) => x.id !== a.id && x.call === a.call)];
}

/** The card to show after the list changed: the same one if it's still there, else the one now in its place. */
export function nextCardIndex(cards: readonly Pick<TriageCard, 'key'>[], currentKey: string | undefined, lastIndex: number): number {
  if (!cards.length) return -1;
  const i = currentKey ? cards.findIndex((c) => c.key === currentKey) : -1;
  return i >= 0 ? i : Math.min(Math.max(0, lastIndex), cards.length - 1);
}
