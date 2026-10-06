import type * as THREE from 'three';
import { MEETING_PATTERNS } from '../../../shared/meetings';
import { fmtCost, fmtTokens } from '../../../shared/protocol/usage';
import type { Meeting, MeetingState } from '../../../shared/protocol';
import type { ReviewItem } from '../../../shared/review';
import { ago } from '../../../shared/rowtext';
import { PANEL } from './world';
import { INK, MONO, UI, clip, ground, screen, titleBar, type Screen } from './screen';
import { chip, emptyBox, facts, label, table, type Cell, type TableRow } from './table';
import { paintFar, type FarCount, type FarSpec } from './far';
import { bayState, inboxRows, outline, seatRows } from './review-rows';

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

/**
 * The panel on the glass beside the Review bay's door, like a room-booking screen: the bay's state in a
 * band across the top, then its facts as a key and value list (the pattern, the round, who has the
 * floor, what it has used), or, while it's free, how much waits for review and for how long.
 */
export class MeetingSignTexture {
  readonly texture: THREE.CanvasTexture;
  private s: Screen = screen(0.6, 0.96, 800);
  private drawn = '';

  constructor() {
    this.texture = this.s.texture;
  }

  render(d: BayData) {
    const m = d.state.current;
    const now = Date.now();
    const waiting = d.inbox.filter((i) => i.floor === d.floor && !i.snoozed);
    const st = bayState(m);
    const rows: [string, Cell][] = m
      ? m.status === 'running'
        ? [
            ['Pattern', MEETING_PATTERNS[m.pattern].label],
            ['Round', { text: `${m.round} of ${m.rounds}`, mono: true }],
            ['On it', speaking(m).join(', ') || '--'],
            ['Tokens', { text: spent(m).tokens, mono: true }],
            ['Cost', { text: spent(m).cost, mono: true }],
          ]
        : [
            ['Pattern', MEETING_PATTERNS[m.pattern].label],
            ['Rounds', { text: String(m.round), mono: true }],
            ['Tokens', { text: spent(m).tokens, mono: true }],
            ['Cost', { text: spent(m).cost, mono: true }],
            [m.status === 'stopped' ? 'Why' : 'Wrote', m.status === 'stopped' ? (m.reason ?? 'by hand') : { text: m.output.split('/').pop() ?? m.output, mono: true }],
          ]
      : [
          ['Waiting', { text: String(waiting.length), mono: true, color: waiting.length ? PANEL.review : INK.text }],
          ['Oldest', { text: waiting.length ? ago(now - Math.min(...waiting.map((i) => i.since))) : '--', mono: true }],
          ['Failing', { text: String(waiting.filter((i) => i.checks === 'fail').length), mono: true }],
          ['Call one', 'E at the table'],
        ];
    const key = JSON.stringify([st, m?.title, rows]);
    if (key === this.drawn) return;
    this.drawn = key;
    const { g, W, H } = this.s;
    ground(g, W, H);
    const pad = 30;
    // The band: the state, in its hue, as on a booking screen.
    g.fillStyle = st.hue;
    g.fillRect(0, 0, W, 8);
    g.fillStyle = PANEL.card;
    g.fillRect(0, 8, W, 92);
    chip(g, { text: st.word, hue: st.hue, glyph: !m ? undefined : m.status === 'running' ? 'review' : m.status === 'done' ? 'done' : 'stuck', strong: true }, pad, 54, 40, W - pad * 2);
    // What's on: the title, two lines at most.
    g.textBaseline = 'alphabetic';
    g.fillStyle = INK.text;
    g.font = UI(700, 46);
    const title = m ? m.title : 'Review bay';
    const words = title.split(/\s+/);
    let line = '';
    const lines: string[] = [];
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width > W - pad * 2 && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((l, i) => g.fillText(clip(g, i === 1 && lines.length > 2 ? `${l}...` : l, W - pad * 2), pad, 168 + i * 54));
    const top = lines.length > 1 ? 250 : 200;
    g.fillStyle = INK.lineStrong;
    g.fillRect(pad, top - 14, W - pad * 2, 3);
    facts(g, pad, top, W - pad * 2, rows, 38, Math.min(84, Math.floor((H - top - 20) / rows.length)));
    this.texture.needsUpdate = true;
  }
}
