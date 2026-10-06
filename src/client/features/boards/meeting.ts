import type * as THREE from 'three';
import { MEETING_PATTERNS } from '../../../shared/meetings';
import { fmtCost, fmtTokens } from '../../../shared/protocol/usage';
import type { Meeting, MeetingState } from '../../../shared/protocol';
import type { ReviewItem } from '../../../shared/review';
import { PANEL } from './world';
import { INK, MONO, UI, clip, emptyBody, ground, more, row, rowsFor, screen, titleBar, type Screen } from './screen';
import { chip, emptyBox, label, table, type TableRow } from './table';
import { paintFar, type FarCount, type FarSpec } from './far';
import { bayState, inboxRows, meetingSignRows, outline, seatRows, signRows, type SignRow } from './review-rows';
import { BAY_SIGN } from '../../../shared/wall-screens';

/** Who has the floor right now: the roles on the parts being worked on. */
export function speaking(m: Meeting): string[] {
  return m.turns.filter((t) => t.state !== 'done').map((t) => m.seats[t.seat]?.role ?? '?');
}

/** What a meeting has used: its tokens, and its cost ("$1.84", "+" when a provider didn't say, "--" for none). */
function spent(m: Meeting): { tokens: string; cost: string } {
  return { tokens: fmtTokens(m.tokens), cost: m.costKnown ? fmtCost(m.cost) : m.cost > 0 ? `${fmtCost(m.cost)}+` : '--' };
}

/** What the Review bay's two panels draw from: the meeting, and this deck's review inbox. */
export interface BayData {
  state: MeetingState;
  inbox: readonly ReviewItem[];
  floor: string | null;
}

/** The board's canvas units a metre: read from inside the bay and through its glass, a few metres off. */
const BOARD_UNITS = 400;

/**
 * The board on the Review bay's west wall, as tables. While the bay is free: what waits for review on
 * this deck, a row each, oldest first. While a meeting sits: its seats (part, unit, what it's doing,
 * its turn, its tokens) and, beside them, the outline of the file it's writing.
 */
/**
 * The Review bay's board from across the deck (far.ts): while it's free, how much waits for review, how
 * many of those have failing checks and how long the oldest has waited; while a meeting sits, its round,
 * its state and what it has used. Pure.
 */
export function bayFar(m: BayData['state']['current'], rows: readonly TableRow[]): FarSpec {
  if (!m) {
    const failing = rows.filter((r) => r.hue === PANEL.stuck).length;
    const first = rows[0]?.cells[4];
    // Oldest first: the top row has waited longest.
    const oldest = first && typeof first === 'object' && 'text' in first ? first.text : '';
    if (!rows.length) return { title: 'Review bay', hue: INK.lineStrong, counts: [], empty: 'Nothing waits for review' };
    const counts: FarCount[] = [{ n: String(rows.length), word: 'to review', hue: PANEL.review, glyph: 'review' }];
    if (failing) counts.push({ n: String(failing), word: 'failing', hue: PANEL.stuck, glyph: 'stuck' });
    counts.push({ n: oldest || '--', word: 'longest wait', hue: INK.text });
    return { title: 'Review bay', hue: PANEL.review, counts };
  }
  const st = bayState(m);
  const spend = spent(m);
  return {
    title: MEETING_PATTERNS[m.pattern].label,
    hue: st.hue,
    counts: [
      { n: `${m.round}/${m.rounds}`, word: 'round', hue: INK.text },
      { n: st.word, word: 'state', hue: st.hue },
      { n: spend.cost, word: `${spend.tokens} tokens`, hue: INK.text },
    ],
  };
}

export class MeetingBoardTexture {
  readonly texture: THREE.CanvasTexture;
  private s: Screen = screen(3.6, 1.6, BOARD_UNITS);
  private drawn = '';
  /** From across the deck: its headline counts instead of its tables (far.ts). */
  far = true;

  constructor() {
    this.texture = this.s.texture;
  }

  render(d: BayData) {
    const m = d.state.current;
    const now = Date.now();
    const rows = m ? [] : inboxRows(d.inbox, d.floor, now);
    const key = JSON.stringify([m && [m.status, m.round, m.step, m.turns, m.seats, m.tokens, m.cost, m.preview, m.output, m.reason], rows, this.far]);
    if (key === this.drawn) return;
    this.drawn = key;
    if (this.far) {
      paintFar(this.s, BOARD_UNITS, bayFar(m, rows));
      return;
    }
    const { g, W, H } = this.s;
    ground(g, W, H);
    const st = bayState(m);
    if (!m) {
      titleBar(g, W, 'Review bay', rows.length ? `${rows.length} waiting` : 'free', rows.length ? PANEL.review : INK.lineStrong);
      if (!rows.length) emptyBox(g, 32, 100, W - 64, H - 120, 'Nothing waits for review', 'Press E at the table to call a review', 46);
      else
        table(g, {
          x: 32,
          y: 108,
          w: W - 64,
          h: H - 120,
          size: 40,
          rowH: 74,
          columns: [
            { label: 'Who', w: 0.8, mono: true },
            { label: 'Work', w: 3.2 },
            { label: 'Next', w: 2 },
            { label: 'Checks', w: 1.35 },
            { label: 'Waiting', w: 0.95, align: 'right', mono: true },
          ],
          rows,
        });
      this.texture.needsUpdate = true;
      return;
    }
    const p = MEETING_PATTERNS[m.pattern];
    titleBar(g, W, p.label, `round ${m.round} of ${m.rounds}`, st.hue);
    // What it's about, under the title bar.
    g.textBaseline = 'middle';
    g.font = UI(600, 34);
    g.fillStyle = INK.text;
    g.fillText(clip(g, m.title, W - 64), 32, 128);
    const split = Math.round(W * 0.64);
    table(g, {
      x: 32,
      y: 158,
      w: split - 56,
      h: H - 220,
      size: 32,
      rowH: 58,
      columns: [
        { label: 'Part', w: 1.55 },
        { label: 'Unit', w: 1 },
        { label: 'Doing', w: 2 },
        { label: 'Turn', w: 1.15 },
        { label: 'Tokens', w: 0.8, align: 'right', mono: true },
      ],
      rows: seatRows(m),
    });
    // Along the foot: the state, and what it has used so far.
    chip(g, { text: st.word, hue: st.hue, strong: m.status !== 'done' }, 32, H - 34, 34);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.font = MONO(30, 600);
    g.fillStyle = INK.text;
    const spend = spent(m);
    g.fillText(`${spend.tokens} tokens   ${spend.cost}`, split - 24, H - 32);
    // The file it's writing: its name, then its headings as an outline.
    const ox = split + 8;
    const ow = W - 32 - ox;
    g.fillStyle = INK.lineStrong;
    g.fillRect(split - 8, 158, 2, H - 180);
    label(g, 'Output', ox + 8, 178, 24, 'left', INK.muted);
    g.textAlign = 'left';
    g.font = MONO(28, 600);
    g.fillStyle = INK.text;
    g.fillText(clip(g, m.output, ow - 16), ox + 8, 216);
    const heads = outline(m.preview, 6);
    if (!heads.length) {
      const why = m.status === 'running' ? `${speaking(m).join(', ') || 'The table'} ${speaking(m).length === 1 ? 'is' : 'are'} on it` : m.reason || 'Nothing was written';
      g.font = UI(500, 30);
      g.fillStyle = INK.dim;
      g.fillText(clip(g, why, ow - 16), ox + 8, 266);
    }
    heads.forEach((h, i) => {
      const y = 266 + i * 50;
      if (y > H - 20) return;
      const indent = Math.min(2, h.depth - 1) * 26;
      g.fillStyle = h.depth === 1 ? INK.text : INK.dim;
      g.fillRect(ox + 8 + indent, y - 4, 10, 4);
      g.font = UI(h.depth === 1 ? 700 : 600, h.depth === 1 ? 32 : 29);
      g.fillText(clip(g, h.text, ow - 40 - indent), ox + 30 + indent, y);
    });
    g.textBaseline = 'alphabetic';
    this.texture.needsUpdate = true;
  }
}

/** The sign's canvas units a metre: four rows on its metre of height, read walking up to the bay. */
export const SIGN_UNITS = 600;

/**
 * The Review bay's far face on the sign (far.ts), two counts across its narrow face: while it's free, how
 * much waits for review, then how many fail their checks or, with none failing, the longest wait; while a
 * meeting sits, its round and its state. Pure.
 */
export function signFar(m: BayData['state']['current'], rows: readonly SignRow[]): FarSpec {
  if (!m) {
    if (!rows.length) return { title: 'Review bay', hue: INK.lineStrong, counts: [], empty: 'Free' };
    const failing = rows.filter((r) => r.state.hue === PANEL.stuck).length;
    // Short words: two columns share the sign's 1.8 m, and a word never runs past its column.
    const counts: FarCount[] = [{ n: String(rows.length), word: 'review', hue: PANEL.review, glyph: 'review' }];
    counts.push(failing ? { n: String(failing), word: 'failing', hue: PANEL.stuck, glyph: 'stuck' } : { n: rows[0].age, word: 'oldest', hue: INK.text });
    return { title: 'Review bay', hue: PANEL.review, counts };
  }
  // A meeting: its state in the name over the counts (and its rule's hue), its round and how many seats are on it.
  const st = bayState(m);
  const on = m.status === 'running' ? speaking(m).length : 0;
  return { title: `Review bay - ${st.word}`, hue: st.hue, counts: [{ n: `${m.round}/${m.rounds}`, word: 'round', hue: INK.text }, { n: String(on), word: 'on it', hue: PANEL.working, glyph: 'working' }] };
}

/**
 * The sign on the glass beside the Review bay's door, laid out like the wall boards (screen.ts): its
 * name and how many wait in the title bar, then a row each, oldest first, with its unit, what to review,
 * its state as a chip (its hue and its shape) and how long it has waited, "+N more" under them; while a
 * meeting sits, its seats the same way. From across the deck, its counts (signFar).
 */
export class MeetingSignTexture {
  readonly texture: THREE.CanvasTexture;
  private s: Screen = screen(BAY_SIGN.width, BAY_SIGN.height, SIGN_UNITS);
  private drawn = '';
  /** From across the deck: its headline counts instead of its rows (far.ts). */
  far = true;

  constructor() {
    this.texture = this.s.texture;
  }

  render(d: BayData) {
    const m = d.state.current;
    const rows = m ? meetingSignRows(m) : signRows(d.inbox, d.floor);
    const key = JSON.stringify([this.far, m && [m.pattern, m.status, m.round, m.rounds], rows]);
    if (key === this.drawn) return;
    this.drawn = key;
    paintSign(this.s, m, rows, this.far);
  }
}

/** Paints the sign on `s`: its far face (signFar), or its title bar and rows, the oldest first. */
export function paintSign(s: Screen, m: BayData['state']['current'], rows: readonly SignRow[], far: boolean) {
  if (far) {
    paintFar(s, SIGN_UNITS, signFar(m, rows));
    return;
  }
  const { g, W, H } = s;
  ground(g, W, H);
  const st = bayState(m);
  const right = m ? `round ${m.round}/${m.rounds}` : rows.length ? `${rows.length} waiting` : 'free';
  titleBar(g, W, m ? MEETING_PATTERNS[m.pattern].label : 'Review bay', right, m ? st.hue : rows.length ? PANEL.review : INK.lineStrong);
  if (!rows.length) emptyBody(g, W, H, 'Nothing waits', 'E at the table calls a review');
  else {
    const shown = rows.slice(0, rowsFor(H));
    shown.forEach((r, i) => row(g, W, i, { hue: r.state.hue, tag: r.unit, text: r.what, sub: r.next, chip: r.state, side: r.age, sideMono: true, sideColor: INK.text }, 48));
    more(g, W, H, rows.length - shown.length);
  }
  s.texture.needsUpdate = true;
}
