/**
 * The Attention board in the middle of the situation wall (the TV's slot, while nobody shares a screen),
 * the hero of the arc: the biggest, brightest thing in the room. Its header says ATTENTION and counts
 * needs you, stuck, to review and working (the only place in the room the counts are, besides the top
 * bar), with a JUMP READY chip while a jump waits for the captain. Under it the units as cards, in the
 * order a captain acts on them (plan.ts): each its state's glyph and stripe, its name big enough to
 * read from the chair, why it is there and for how long. The ones that are only counted (working and
 * done that don't all fit) are chips along the foot. Its edges glow in the colour of its most urgent
 * state, so the board says "someone needs you" before a word of it is read.
 */
import * as THREE from 'three';
import type { Ranked } from '../../../shared/attention';
import { ago, headline, statusPhrase } from '../../../shared/rowtext';
import { DESK_BY_ID, TV, cellOf } from '../../../shared/layout';
import { callSign } from '../../../shared/callsign';
import { PANEL } from '../boards/world';
import { INK, MONO, UI, UNITS_PER_M, clip, screen } from '../boards/screen';
import { drawDone, drawGlyph } from '../../world/glyphs';
import { cardCell, planHero, type HeroKind, type HeroPlan } from './plan';

/** Each kind's hue: its stripe, its glyph, the board's edges when it's the most urgent. */
export const HERO_HUE: Record<HeroKind, string> = { 'needs-you': PANEL.signal, stuck: PANEL.stuck, review: PANEL.review, working: '#6FC3DF', done: PANEL.settled };

/** The header's count chips, in the top bar's order, and what each says under its number. */
export const HEADER_COUNTS: readonly (readonly [HeroKind, string])[] = [
  ['needs-you', 'NEED YOU'],
  ['stuck', 'STUCK'],
  ['review', 'REVIEW'],
  ['working', 'WORKING'],
];

/** The board's layout in canvas units (200 a metre): margins, the header and the chip row at the foot. */
export const HERO = { pad: 28, head: 92, rule: 6, foot: 54, gap: 10 } as const;

/** Smoked backing: the board's ground lets a little of space through (the face is drawn as glass). */
const GROUND = 'rgba(8,12,18,0.94)';
const CARD = '#162029';
const CARD_QUIET = 'rgba(22,32,41,0.75)';

/** A state's glyph on the canvas; done is its own check. */
function mark(g: CanvasRenderingContext2D, kind: HeroKind, x: number, y: number, r: number) {
  if (kind === 'done') drawDone(g, x, y, r, true);
  else drawGlyph(g, kind, x, y, r, true);
}

/** Options the board is drawn with besides the ranking. */
export interface HeroExtras {
  /** A jump waits for the captain: a JUMP READY chip on the header. */
  jumpReady?: boolean;
}

/** Where a unit's card is on the board (canvas units): its left edge's middle, and its box. */
export interface CardAnchor {
  id: string;
  kind: HeroKind;
  /** Its row down its column (0 the top). */
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A soft band of `hue` inside every edge of a W by H board, `depth` deep: the board's glow edge. */
function glowEdge(g: CanvasRenderingContext2D, W: number, H: number, hue: string, depth: number, strength: number) {
  const c = new THREE.Color(hue);
  const rgba = (a: number) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
  const band = (x0: number, y0: number, x1: number, y1: number, x: number, y: number, w: number, h: number) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, rgba(strength));
    grad.addColorStop(1, rgba(0));
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  };
  band(0, 0, 0, depth, 0, 0, W, depth);
  band(0, H, 0, H - depth, 0, H - depth, W, depth);
  band(0, 0, depth, 0, 0, 0, depth, H);
  band(W, 0, W - depth, 0, W - depth, 0, depth, H);
}

/** The header: ATTENTION, the JUMP READY chip after it, and the counts from the right. */
function paintHeader(g: CanvasRenderingContext2D, W: number, plan: HeroPlan, extras: HeroExtras) {
  const { pad, head, rule } = HERO;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillStyle = INK.text;
  g.font = UI(800, 60);
  g.letterSpacing = '6px';
  g.fillText('ATTENTION', pad + 4, 68);
  let x = pad + 4 + g.measureText('ATTENTION').width + 28;
  g.letterSpacing = '0px';
  if (extras.jumpReady) {
    g.font = MONO(30, 700);
    g.letterSpacing = '3px';
    const w = g.measureText('JUMP READY').width + 36;
    g.strokeStyle = '#6FC3DF';
    g.lineWidth = 4;
    g.strokeRect(x, 22, w, 54);
    g.fillStyle = 'rgba(111,195,223,0.16)';
    g.fillRect(x, 22, w, 54);
    g.fillStyle = '#BFE6F2';
    g.fillText('JUMP READY', x + 18, 60);
    g.letterSpacing = '0px';
    x += w + 20;
  }
  // The counts, right to left: the number big, its word small under the glyph.
  let right = W - pad - 4;
  for (const [kind, word] of [...HEADER_COUNTS].reverse()) {
    const n = plan.counts[kind];
    g.font = MONO(66, 700);
    const nw = g.measureText(String(n)).width;
    g.font = UI(700, 24);
    g.letterSpacing = '2px';
    const ww = g.measureText(word).width;
    g.letterSpacing = '0px';
    const w = Math.max(nw + 58, ww + 8);
    const x0 = right - w;
    if (x0 < x) break;
    mark(g, kind, x0 + 20, 36, 17);
    g.fillStyle = n ? INK.text : INK.muted;
    g.font = MONO(66, 700);
    g.textAlign = 'right';
    g.fillText(String(n), right, 62);
    g.textAlign = 'left';
    g.fillStyle = n ? (kind === 'working' ? INK.dim : HERO_HUE[kind]) : INK.muted;
    g.font = UI(700, 24);
    g.letterSpacing = '2px';
    g.fillText(word, x0 + 2, 86);
    g.letterSpacing = '0px';
    right = x0 - 34;
  }
  // The rule under it, in the most urgent state's hue.
  g.fillStyle = plan.top ? HERO_HUE[plan.top] : INK.lineStrong;
  g.fillRect(pad, head, W - pad * 2, rule);
}

/** Why a card's unit is there, in a few words: the status phrase, or a working unit's task. */
function why(r: Ranked, kind: HeroKind): string {
  const title = headline(r.entry.task, r.entry.activity).title;
  if (kind === 'working') return title || r.att.label;
  if (kind === 'done') return title ? `Done: ${title}` : 'Done';
  return statusPhrase(r.att, title);
}

/** One card at (x, y), w by h, for the grid it's on. */
function paintCard(g: CanvasRenderingContext2D, card: { r: Ranked; kind: HeroKind }, x: number, y: number, w: number, h: number, size: 'full' | 'dense' | 'denser', now: number) {
  const { r, kind } = card;
  const quiet = kind === 'working' || kind === 'done';
  const hue = HERO_HUE[kind];
  g.fillStyle = quiet ? CARD_QUIET : CARD;
  g.fillRect(x, y, w, h);
  if (kind === 'needs-you' || kind === 'stuck') {
    // A wash of its hue across the card, under the words: the ones to act on read as lit.
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, kind === 'stuck' ? 'rgba(255,77,94,0.26)' : 'rgba(255,106,26,0.24)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  }
  if (kind === 'stuck') {
    // Its red rim, the same as round its station.
    g.strokeStyle = hue;
    g.lineWidth = 5;
    g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  }
  g.fillStyle = hue;
  g.fillRect(x, y, size === 'full' ? 12 : 9, h);
  const desk = DESK_BY_ID.get(r.entry.deskId);
  const sign = callSign(r.entry.deskId) || (desk ? cellOf(desk.x, desk.z) : '');
  const age = ago(now - r.att.since);
  const reason = why(r, kind);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  if (size === 'full') {
    mark(g, kind, x + 60, y + 54, 30);
    // The clock at the right of the first line, the name as big as the line takes (0.5 m type).
    g.font = MONO(40, 600);
    g.textAlign = 'right';
    g.fillStyle = INK.dim;
    g.fillText(age, x + w - 22, y + 82);
    const clockW = g.measureText(age).width;
    g.textAlign = 'left';
    g.font = UI(700, 100);
    g.fillStyle = quiet ? INK.dim : INK.text;
    g.fillText(clip(g, r.entry.name, w - 108 - clockW - 40), x + 106, y + 88);
    // Under it, why, then its call sign.
    g.font = MONO(32, 600);
    const sw = sign ? g.measureText(sign).width : 0;
    g.font = UI(600, 40);
    g.fillStyle = quiet ? INK.dim : kind === 'needs-you' || kind === 'stuck' ? '#F3D9C9' : INK.text;
    const said = clip(g, reason, w - 108 - sw - 50);
    g.fillText(said, x + 106, y + h - 14);
    if (sign) {
      g.font = MONO(32, 600);
      g.fillStyle = INK.muted;
      g.textAlign = 'right';
      g.fillText(sign, x + w - 22, y + h - 16);
      g.textAlign = 'left';
    }
    return;
  }
  const dense = size === 'dense';
  mark(g, kind, x + (dense ? 44 : 38), y + h / 2, dense ? 19 : 16);
  const base = y + h / 2 + (dense ? 19 : 17);
  g.font = MONO(dense ? 34 : 30, 600);
  g.textAlign = 'right';
  g.fillStyle = INK.dim;
  g.fillText(age, x + w - 18, base - 2);
  const clockW = g.measureText(age).width;
  g.textAlign = 'left';
  g.font = UI(700, dense ? 54 : 48);
  g.fillStyle = quiet ? INK.dim : INK.text;
  const tx = x + (dense ? 80 : 70);
  const room = w - (tx - x) - clockW - 36;
  const name = clip(g, r.entry.name, dense ? room * 0.55 : room);
  g.fillText(name, tx, base);
  if (dense) {
    const nx = tx + g.measureText(name).width + 22;
    g.font = UI(600, 36);
    g.fillStyle = quiet ? INK.dim : '#D9DFE5';
    g.fillText(clip(g, reason, x + w - clockW - 36 - nx), nx, base - 2);
  }
}

/** The chips along the foot: what is counted rather than carded. */
function paintChips(g: CanvasRenderingContext2D, W: number, H: number, plan: HeroPlan) {
  const { pad, foot } = HERO;
  let x = pad;
  const y = H - foot + 6;
  const h = foot - 16;
  for (const c of plan.chips) {
    const word = { working: 'WORKING', done: 'DONE', stuck: 'MORE STUCK', 'needs-you': 'MORE NEED YOU', review: 'MORE TO REVIEW' }[c.kind];
    g.font = UI(700, 34);
    g.letterSpacing = '3px';
    const text = `${word} ${c.n}`;
    const w = g.measureText(text).width + 74;
    if (x + w > W - pad) break;
    g.fillStyle = 'rgba(22,32,41,0.9)';
    g.fillRect(x, y, w, h);
    g.fillStyle = HERO_HUE[c.kind];
    g.fillRect(x, y, 6, h);
    if (c.kind === 'working') {
      // The working pip: a cyan dot, as over a working unit.
      g.beginPath();
      g.arc(x + 32, y + h / 2, 9, 0, Math.PI * 2);
      g.fill();
    } else mark(g, c.kind, x + 32, y + h / 2, 13);
    g.fillStyle = INK.text;
    g.textBaseline = 'middle';
    g.fillText(text, x + 56, y + h / 2 + 2);
    g.textBaseline = 'alphabetic';
    g.letterSpacing = '0px';
    x += w + 16;
  }
}

/**
 * Draws the board for `ranked` (the floor's ranking) at `now` on a board `W` by `H` canvas units, and
 * says where each card went (for the beam from a unit up to its card, features/signals).
 */
export function paintAttention(g: CanvasRenderingContext2D, W: number, H: number, ranked: Ranked[], now: number, extras: HeroExtras = {}): { plan: HeroPlan; anchors: CardAnchor[] } {
  const plan = planHero(ranked);
  g.clearRect(0, 0, W, H);
  g.fillStyle = GROUND;
  g.fillRect(0, 0, W, H);
  if (plan.top && plan.top !== 'working') glowEdge(g, W, H, HERO_HUE[plan.top], 30, 0.42);
  paintHeader(g, W, plan, extras);
  const { pad, head, rule, foot, gap } = HERO;
  const top = head + rule + gap;
  const bottom = H - foot - 4;
  const anchors: CardAnchor[] = [];
  if (!plan.cards.length) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = INK.text;
    g.font = UI(700, 64);
    const working = plan.counts.working;
    g.fillText(working ? 'All units on task. Nothing needs you.' : 'No units on this deck', W / 2, (top + bottom) / 2 - 30);
    g.fillStyle = INK.dim;
    g.font = UI(600, 38);
    g.fillText(working ? 'The captain has the conn' : 'Deploy one at a free console', W / 2, (top + bottom) / 2 + 44);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }
  const { grid } = plan;
  const cw = (W - pad * 2 - gap * (grid.cols - 1)) / grid.cols;
  const ch = (bottom - top - gap * (grid.rows - 1)) / grid.rows;
  plan.cards.forEach((card, i) => {
    const { col, row } = cardCell(grid, i);
    const x = pad + col * (cw + gap);
    const y = top + row * (ch + gap);
    paintCard(g, card, x, y, cw, ch, grid.name, now);
    anchors.push({ id: card.r.entry.id, kind: card.kind, row, x, y: y + ch / 2, w: cw, h: ch });
  });
  paintChips(g, W, H, plan);
  return { plan, anchors };
}

/** The board's texture, how to bring it up to date, and where each unit's card is on it (uv, 0-1 from the top left). */
export function attentionBoard(): { texture: THREE.CanvasTexture; render(ranked: Ranked[], now: number, extras?: HeroExtras): void; anchors(): readonly CardAnchor[]; top(): HeroKind | null; size: { W: number; H: number } } {
  const { g, W, H, texture } = screen(TV.width, TV.height, UNITS_PER_M);
  let drawn = '';
  let anchors: CardAnchor[] = [];
  let top: HeroKind | null = null;
  return {
    texture,
    size: { W, H },
    render(ranked, now, extras = {}) {
      // Ages tick by the minute: redraw only when what's shown changes.
      const key = JSON.stringify([extras, ranked.map((r) => [r.entry.id, r.entry.name, r.entry.deskId, r.entry.status, r.entry.tasked, r.att.level, r.att.label, r.att.snoozed, Math.floor((now - r.att.since) / 60_000)])]);
      if (key === drawn) return;
      drawn = key;
      const out = paintAttention(g, W, H, ranked, now, extras);
      anchors = out.anchors;
      top = out.plan.top;
      texture.needsUpdate = true;
    },
    anchors: () => anchors,
    top: () => top,
  };
}
