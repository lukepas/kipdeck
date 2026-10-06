// What the Review bay's board and door sign put in their tables, worked out from the store's data. Pure
// (tests/tables.test.ts), so the board (./meeting.ts) only draws.
//
// - A free bay lists what waits for review on this deck, oldest first: whose it is (a unit's call sign,
//   or the pull request's number), the work, what to do next (as Mission control's button says it),
//   its checks and how long it has waited.
// - A meeting lists its seats: the part each plays, its unit, what it's doing this round, where its turn
//   stands and what it has used; beside them, the outline of the file it is writing (its headings).
import { callSign } from '../../../shared/callsign';
import { ago, headline } from '../../../shared/rowtext';
import { fmtTokens } from '../../../shared/protocol/usage';
import type { ReviewItem } from '../../../shared/review';
import { ACTION_LABEL } from '../../../shared/attention';
import type { GhPull, Meeting } from '../../../shared/protocol';
import { PANEL } from './world';
import { INK } from './screen';
import type { Chip, TableRow } from './table';

/** A pull request's checks as a chip: red only when they fail. */
export function checksChip(c: GhPull['checks'] | undefined): Chip | null {
  switch (c) {
    case 'pass':
      return { text: 'pass', hue: PANEL.settled, glyph: 'done' };
    case 'fail':
      return { text: 'failing', hue: PANEL.stuck, glyph: 'stuck' };
    case 'pending':
      return { text: 'running', hue: INK.dim };
    default:
      return null;
  }
}

/** The review inbox's rows for one floor, oldest first (as the inbox sorts them), the snoozed left out. */
export function inboxRows(items: readonly ReviewItem[], floor: string | null, now = Date.now()): TableRow[] {
  return items
    .filter((i) => i.floor === floor && !i.snoozed)
    .map((i): TableRow => {
      const chip = checksChip(i.checks);
      const wait = { text: ago(now - i.since), mono: true };
      if (i.payout) {
        return { hue: PANEL.proof, cells: [{ text: `#${i.payout.issue}`, mono: true }, `Payout ${i.payout.amount}`, ACTION_LABEL[i.action], { chip: { text: 'devnet', hue: PANEL.proof } }, wait] };
      }
      if (i.pull) {
        return { hue: i.checks === 'fail' ? PANEL.stuck : PANEL.review, cells: [{ text: `#${i.pull.number}`, mono: true }, i.pull.title, ACTION_LABEL[i.action], chip ? { chip } : '--', wait] };
      }
      const e = i.entry;
      const who = e ? callSign(e.deskId) || e.name : '';
      const title = e ? headline(e.task, e.activity).title || e.name : i.reason;
      return { hue: i.checks === 'fail' ? PANEL.stuck : PANEL.review, cells: [{ text: who, mono: true }, title, ACTION_LABEL[i.action], chip ? { chip } : '--', wait] };
    });
}

/** One row of the Review bay's sign: whose it is, what to review, its state as a chip, how long it has waited. */
export interface SignRow {
  /** Its unit's call sign, or the pull request's or issue's number. */
  unit: string;
  /** What to review: the work's title. */
  what: string;
  /** Under it, for up close: what to do next, and its checks. */
  next: string;
  /** Its state in the attention ranking's hue and shape: to review, failing checks, or a payout (proof). */
  state: Chip;
  /** How long it has waited ("30m"). */
  age: string;
}

/** A waiting item's state on the sign: failing checks are stuck (red, the hollow triangle), a payout is the chain's, the rest wait for review (amber, the ringed dot). */
export function signState(i: Pick<ReviewItem, 'checks' | 'payout'>): Chip {
  if (i.payout) return { text: 'payout', hue: PANEL.proof, glyph: 'merged' };
  if (i.checks === 'fail') return { text: 'failing', hue: PANEL.stuck, glyph: 'stuck' };
  return { text: 'review', hue: PANEL.review, glyph: 'review' };
}

/** The sign's rows for one floor: the same items as the board's table (inboxRows), oldest first. Pure. */
export function signRows(items: readonly ReviewItem[], floor: string | null, now = Date.now()): SignRow[] {
  return items
    .filter((i) => i.floor === floor && !i.snoozed)
    .map((i): SignRow => {
      const age = ago(now - i.since);
      const checks = i.checks === 'pass' ? 'checks pass' : i.checks === 'fail' ? 'checks failing' : i.checks === 'pending' ? 'checks running' : '';
      const next = [ACTION_LABEL[i.action], checks].filter(Boolean).join(' - ');
      if (i.payout) return { unit: `#${i.payout.issue}`, what: `Payout ${i.payout.amount}`, next, state: signState(i), age };
      if (i.pull) return { unit: `#${i.pull.number}`, what: i.pull.title, next, state: signState(i), age };
      const e = i.entry;
      return { unit: e ? callSign(e.deskId) || e.name : '--', what: e ? headline(e.task, e.activity).title || e.name : i.reason, next, state: signState(i), age };
    });
}

/** A turn's state as a chip. */
function turnChip(state: 'waiting' | 'sent' | 'working' | 'done' | undefined): Chip {
  switch (state) {
    case 'working':
      return { text: 'on it', hue: PANEL.working, glyph: 'working' };
    case 'sent':
      return { text: 'sent', hue: INK.dim };
    case 'done':
      return { text: 'done', hue: PANEL.settled, glyph: 'done' };
    default:
      return { text: 'wait', hue: INK.muted, glyph: 'queued' };
  }
}

/** A meeting's seats: its part, its unit, what it's doing this round, its turn's state and its tokens. */
export function seatRows(m: Meeting): TableRow[] {
  return m.seats.map((s, i): TableRow => {
    const turn = m.turns.find((t) => t.seat === i);
    // A seat with no part this step: done once the meeting is, else waiting for its turn.
    const state = turn?.state ?? (m.status === 'running' ? 'waiting' : 'done');
    return {
      quiet: m.status === 'running' && !turn,
      cells: [s.role, s.workerName ?? '--', turn?.doing ?? (m.status === 'running' ? 'next round' : '--'), { chip: turnChip(state) }, { text: s.tokens ? fmtTokens(s.tokens) : '--', mono: true }],
    };
  });
}

/** A meeting's seats as the sign's rows: the unit, its part, what it's doing, its turn and its tokens (in the age column). Pure. */
export function meetingSignRows(m: Meeting): SignRow[] {
  return m.seats.map((s, i): SignRow => {
    const turn = m.turns.find((t) => t.seat === i);
    const state = turn?.state ?? (m.status === 'running' ? 'waiting' : 'done');
    return {
      unit: (s.deskId && callSign(s.deskId)) || s.workerName || '--',
      what: s.role,
      next: [s.workerName, turn?.doing ?? (m.status === 'running' ? 'next round' : '')].filter(Boolean).join(' - '),
      state: turnChip(state),
      age: s.tokens ? fmtTokens(s.tokens) : '--',
    };
  });
}

/** The headings of the file a meeting is writing, in order, at most `max`: the outline beside the seats. */
export function outline(preview: string | undefined, max = 8): { text: string; depth: number }[] {
  const out: { text: string; depth: number }[] = [];
  for (const raw of (preview ?? '').replace(/\r/g, '').split('\n')) {
    const h = /^(#{1,4})\s+(.*\S)\s*$/.exec(raw);
    if (!h) continue;
    out.push({ text: h[2].replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1'), depth: h[1].length });
    if (out.length >= max) break;
  }
  return out;
}

/** The meeting's state in a word and its hue, for the board's title and the door's band. */
export function bayState(m: Meeting | null | undefined): { word: string; hue: string } {
  if (!m) return { word: 'free', hue: PANEL.settled };
  if (m.status === 'running') return { word: 'in review', hue: PANEL.review };
  if (m.status === 'done') return { word: 'done', hue: PANEL.settled };
  return { word: 'stopped', hue: PANEL.stuck };
}
