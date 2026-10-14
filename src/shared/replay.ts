// The replay demo (docs/demo.md#the-replay-demo): one recorded round of the hosted read-only demo,
// played back on a static page with nothing live behind it. A tape holds what a watching page was sent
// (`stream`) and what a second socket that looked at everything was sent (`answers`: every terminal,
// diff, brief and log), so the page's own requests can be answered from it. This file is the pure part:
// the tape's shape, where a pass through it is, what a request is answered with, and moving the
// recording's times to now. The page's side is src/client/replay/, the recorder deploy/replay/record.mjs.
// The Deck plays the same tape: its city's rundown and Signal's gist of it are on the tape too, worked
// out by the recorder from the demo's throwaway project (the hosted demo itself never sends either).
import type { ClientMsg, ServerMsg } from './protocol.js';

/** One message on the tape, `at` ms after the recording started. */
export interface TapeEvent {
  at: number;
  msg: ServerMsg;
}

export interface Tape {
  version: 1;
  /** When the recording started (ms since epoch): every time on the tape is moved by now minus this. */
  recordedAt: number;
  /** Where the loop starts: the first round's start. Before it is the arrival from the welcome. */
  loopFrom: number;
  /** Where it ends: the second round's start, the same state as loopFrom. */
  loopTo: number;
  /** What a page is sent first. */
  welcome: ServerMsg;
  /** GET /api/whoami's answer. */
  whoami: unknown;
  /** What a watching page was sent unasked, in order. */
  stream: TapeEvent[];
  /** What the looking socket was sent, in order: the answers to a page's requests. */
  answers: TapeEvent[];
}

/** Times on the tape are ms since epoch from this window around the recording; nothing else is that big. */
const TIME_SLACK_MS = 3 * 24 * 3600 * 1000;
const DAY_MS = 86_400_000;
// An ISO time in UTC or with an offset (git's dates in a rundown carry the recorder's), and a bare day,
// alone or inside a sentence ("the last 2026-10-14").
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const DAY = /\b(\d{4}-\d\d-\d\d)\b(?!T\d)/g;

/**
 * `value` with every time from the recording moved by `delta` ms: numbers in ms since epoch within a few
 * days of it, ISO strings in that window (written back in UTC), and days in that window, alone or in a
 * sentence, moved to the day they land on. Everything else stays as it is.
 */
export function shiftTimes<T>(value: T, delta: number, tape: Pick<Tape, 'recordedAt' | 'loopTo'>): T {
  if (!delta) return value;
  const lo = tape.recordedAt - TIME_SLACK_MS;
  const hi = tape.recordedAt + tape.loopTo + TIME_SLACK_MS;
  // Whole days, so the recording's day reads as the day it is played on (UTC), whatever its hour.
  const days = Math.floor((tape.recordedAt + delta) / DAY_MS) - Math.floor(tape.recordedAt / DAY_MS);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'number') return Number.isInteger(v) && v >= lo && v <= hi ? v + delta : v;
    if (typeof v === 'string') {
      if (ISO.test(v)) {
        const ms = Date.parse(v);
        return ms >= lo && ms <= hi ? new Date(ms + delta).toISOString() : v;
      }
      return v.replace(DAY, (day) => {
        const ms = Date.parse(`${day}T12:00:00Z`);
        return ms >= lo && ms <= hi ? new Date(ms + days * DAY_MS).toISOString().slice(0, 10) : day;
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/**
 * Where a page is on the tape `elapsed` ms after it connected: the first pass plays from the start, every
 * pass after it from loopFrom. `start` is where that pass began on the tape, `began` how long after
 * connecting it began.
 */
export function tapePosition(tape: Pick<Tape, 'loopFrom' | 'loopTo'>, elapsed: number): { pass: number; at: number; began: number; start: number } {
  if (elapsed < tape.loopTo) return { pass: 0, at: elapsed, began: 0, start: 0 };
  const len = Math.max(1, tape.loopTo - tape.loopFrom);
  const pass = 1 + Math.floor((elapsed - tape.loopTo) / len);
  const began = tape.loopTo + (pass - 1) * len;
  return { pass, at: tape.loopFrom + (elapsed - began), began, start: tape.loopFrom };
}

type Of<K extends ServerMsg['t']> = Extract<ServerMsg, { t: K }>;

/** The last answer on the tape at or before `at` that `match` takes, if any. */
function last<K extends ServerMsg['t']>(tape: Tape, at: number, t: K, match: (m: Of<K>) => boolean = () => true): Of<K> | undefined {
  let found: Of<K> | undefined;
  for (const e of tape.answers) {
    if (e.at > at) break;
    if (e.msg.t === t && match(e.msg as Of<K>)) found = e.msg as Of<K>;
  }
  return found;
}

/** A terminal as it was at `at`: its last snapshot with everything written after it. */
export function terminalAt(tape: Tape, workerId: string, at: number): Of<'term.snapshot'> | undefined {
  let snap: Of<'term.snapshot'> | undefined;
  let data = '';
  for (const e of tape.answers) {
    if (e.at > at) break;
    const m = e.msg;
    if (m.t === 'term.snapshot' && m.workerId === workerId) {
      snap = m;
      data = '';
    } else if (m.t === 'term.data' && m.workerId === workerId && snap) data += m.data;
  }
  return snap && { ...snap, data: snap.data + data };
}

/** What a page's request at `at` on the tape is answered with: nothing for one that only looks on. */
export function answer(tape: Tape, req: ClientMsg, at: number): ServerMsg[] {
  const one = (m: ServerMsg | undefined) => (m ? [m] : []);
  switch (req.t) {
    case 'worker.attach':
      return one(terminalAt(tape, req.workerId, at));
    case 'worker.worktree':
      return one(last(tape, at, 'worker.worktree', (m) => m.workerId === req.workerId));
    case 'changes.watch':
      return one(last(tape, at, 'changes', (m) => m.state.workerId === req.workerId));
    case 'changes.diff':
      return one(last(tape, at, 'changes.diff', (m) => m.workerId === req.workerId && m.path === req.path) ?? { t: 'changes.diff', workerId: req.workerId, path: req.path, diff: '', truncated: false, error: 'Not in this recording' });
    case 'brief.get':
      return one(last(tape, at, 'brief', (m) => m.brief.workerId === req.workerId));
    case 'inbox.log':
      return one(last(tape, at, 'inbox.log'));
    case 'pace.get':
      return one(last(tape, at, 'pace', (m) => m.floor === req.floor));
    case 'timeline.get':
      return one(last(tape, at, 'timeline'));
    case 'team.get':
      return one(last(tape, at, 'team'));
    case 'approvals.get':
      return one(last(tape, at, 'approvals'));
    case 'spend.get':
      return one(last(tape, at, 'spend'));
    case 'rundown.watch':
      return one(last(tape, at, 'rundown.state', (m) => m.floor === req.floor));
    case 'signal.peek':
      return one(last(tape, at, 'signal.gist', (m) => m.gist.floor === req.floor));
    default:
      return [];
  }
}

/**
 * What a page has asked to keep following: a terminal it attached to, a worker's changes it watches, and
 * the states it asked for once. An answer that comes up on the tape later is passed on when it's one of
 * these.
 */
export class Follows {
  private terms = new Set<string>();
  private changes = new Set<string>();
  private kinds = new Set<string>();
  private rundown: string | null = null;

  /** Notes what a request starts or stops following. */
  note(req: ClientMsg) {
    if (req.t === 'worker.attach') this.terms.add(req.workerId);
    else if (req.t === 'worker.detach') this.terms.delete(req.workerId);
    else if (req.t === 'changes.watch') this.changes.add(req.workerId);
    else if (req.t === 'changes.unwatch') this.changes.delete(req.workerId);
    else if (req.t === 'rundown.watch') this.rundown = req.floor;
    else if (req.t === 'rundown.unwatch') this.rundown = null;
    else if (req.t in FOLLOWED_STATES) this.kinds.add(FOLLOWED_STATES[req.t]);
  }

  /** Whether an answer on the tape goes on to the page. */
  wants(m: ServerMsg, streamed: ReadonlySet<string>): boolean {
    if (m.t === 'term.snapshot' || m.t === 'term.data') return this.terms.has(m.workerId);
    if (m.t === 'changes') return this.changes.has(m.state.workerId);
    // One floor's rundown at a time, as the office sends it: the city redraws when the project moves on.
    if (m.t === 'rundown.state') return this.rundown === m.floor;
    // A state the watching page was sent anyway already arrives through the stream.
    return this.kinds.has(m.t) && !streamed.has(m.t);
  }
}

/**
 * What the replay answers beyond what the read-only demo takes (READ_ONLY_ALLOWS): the Deck's city and
 * the inbox's Signal chip. The hosted demo drops these without a word, since a real project's map is not
 * for anonymous visitors; the tape's is the throwaway demo project's, worked out by the recorder.
 */
export const REPLAY_ALSO_ANSWERS: ReadonlySet<string> = new Set(['rundown.watch', 'rundown.unwatch', 'signal.peek']);

/** The widest a phone's shorter side is (CSS px): the Deck's 3D asks too much of one, so the replay sends it to the inbox. */
export const PHONE_MAX_SIDE = 640;

/** Whether a screen is a phone's: a touch screen whose shorter side is a phone's, held either way. */
export function isPhone(screen: { coarse: boolean; width: number; height: number }): boolean {
  return screen.coarse && Math.min(screen.width, screen.height) <= PHONE_MAX_SIDE;
}

/** The states a page asks for once and then keeps being sent: request type to the answer's type. */
const FOLLOWED_STATES: Record<string, string> = { 'spend.get': 'spend', 'approvals.get': 'approvals', 'team.get': 'team', 'pace.get': 'pace' };
