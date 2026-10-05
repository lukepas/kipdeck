/**
 * The Attention board in the middle of the situation wall (the TV's slot, while nobody shares a screen):
 * a count band over it (needs you, stuck, running, done), then the floor's units ranked by who needs
 * someone most, in the same order as the top bar's strip (shared/attention.ts), each with its state
 * glyph, its name, where it is ("C4"), why, and for how long. The band counts the same list the rows show.
 */
import * as THREE from 'three';
import type { AttentionLevel, Ranked } from '../../../shared/attention';
import { ago, headline, statusPhrase } from '../../../shared/rowtext';
import { DESK_BY_ID, SITUATION, TV, cellOf } from '../../../shared/layout';
import { callSign } from '../../../shared/callsign';
import { PANEL } from '../boards/world';
import { INK, LAYOUT, MONO, UI, UNITS_PER_M, emptyBody, ground, more, row, screen, titleBar } from '../boards/screen';
import { drawGlyph } from '../../world/glyphs';

/** The state glyphs, as the units and the DOM draw them (world/glyphs.ts). */
const glyph = (level: AttentionLevel) => (g: CanvasRenderingContext2D, x: number, y: number, r: number) => drawGlyph(g, level, x, y, r);

const HUE: Record<AttentionLevel, string> = { 'needs-you': PANEL.signal, stuck: PANEL.stuck, review: PANEL.review, working: PANEL.working, parked: PANEL.lineStrong };

/** How much bigger the rows' first line is than the other boards' (0.28 m type): names and reasons are short. */
const ROW_K = 1.18;

/** Where a unit's reason starts: past its name and call sign. */
const WHY_X = 420;

/** The count band's tiles, in this order: what each counts and what it says under its number. */
export const BAND_TILES: readonly (readonly [AttentionLevel, string])[] = [
  ['needs-you', 'NEEDS YOU'],
  ['stuck', 'STUCK'],
  ['working', 'RUNNING'],
  ['review', 'DONE'],
];

/** How tall the count band is (canvas units), over the board's own title bar. */
export const BAND_H = Math.round(SITUATION.band * UNITS_PER_M);

/** How many of `ranked` are at each level, as the rows under the band list them. */
export function bandCounts(ranked: Ranked[]): Record<AttentionLevel, number> {
  const n: Record<AttentionLevel, number> = { 'needs-you': 0, stuck: 0, review: 0, working: 0, parked: 0 };
  for (const r of ranked) n[r.att.level]++;
  return n;
}

/**
 * The count band over the board: a tile for each of needs you, stuck, running and done, its glyph and
 * its number big enough to read from the conn, its word under it. A count of none steps back to muted.
 */
function paintBand(g: CanvasRenderingContext2D, W: number, counts: Record<AttentionLevel, number>) {
  const { pad } = LAYOUT;
  const gap = 16;
  const tileW = (W - pad * 2 - gap * (BAND_TILES.length - 1)) / BAND_TILES.length;
  const y = 10;
  const h = BAND_H - 20;
  BAND_TILES.forEach(([level, word], i) => {
    const x = pad + i * (tileW + gap);
    const n = counts[level];
    g.fillStyle = n ? INK.card : 'rgba(27,35,45,0.6)';
    g.fillRect(x, y, tileW, h);
    g.fillStyle = n ? HUE[level] : INK.lineStrong;
    g.fillRect(x, y, tileW, 8);
    drawGlyph(g, level, x + 58, y + 70, 30);
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.fillStyle = n ? INK.text : INK.muted;
    g.font = MONO(104, 700);
    g.fillText(String(n), x + tileW - 24, y + 108);
    g.textAlign = 'left';
    g.fillStyle = n ? INK.dim : INK.muted;
    g.font = UI(700, 30);
    g.letterSpacing = '3px';
    g.fillText(word, x + 24, y + h - 20);
    g.letterSpacing = '0px';
  });
}

/**
 * Draws the board for `ranked` (most in need first) at `now`, on a board `W` by `H` canvas units: the
 * count band over the top, then the title bar and the rows, as every board of the wall has them.
 */
export function paintAttention(g: CanvasRenderingContext2D, W: number, H: number, ranked: Ranked[], now: number) {
  ground(g, W, H);
  const live = ranked.filter((r) => r.att.level !== 'parked');
  paintBand(g, W, bandCounts(live));
  g.save();
  g.translate(0, BAND_H);
  paintBoard(g, W, H - BAND_H, live, now);
  g.restore();
}

/** The board under the band: its title, and the most in need as rows, the rest counted under them. */
function paintBoard(g: CanvasRenderingContext2D, W: number, H: number, live: Ranked[], now: number) {
  titleBar(g, W, 'Attention');
  if (!live.length || live.every((r) => r.att.level === 'working')) {
    emptyBody(g, W, H, live.length ? 'All units on task. Nothing needs you.' : 'No units on this deck', live.length ? `${live.length} working` : 'Deploy one at a free console');
    return;
  }
  // Most in need first, as the ranking has them; the rest are counted under the rows.
  const rows = live.slice(0, LAYOUT.rows);
  rows.forEach((r, i) => {
    const level = r.att.level;
    const desk = DESK_BY_ID.get(r.entry.deskId);
    const cell = desk ? cellOf(desk.x, desk.z) : '';
    const sign = callSign(r.entry.deskId);
    const title = headline(r.entry.task, r.entry.activity).title;
    const why = level === 'working' ? title || r.att.label : statusPhrase(r.att, title);
    row(g, W, i, { hue: HUE[level], mark: glyph(level), text: r.entry.name, detail: why, detailX: WHY_X, side: ago(now - r.att.since), sideMono: true, sub: sign ? `${sign} at ${cell}` : cell ? `at ${cell}` : undefined, quiet: level === 'working', k: ROW_K });
  });
  more(g, W, H, live.length - rows.length);
}

/** The board's texture, and how to bring it up to date. */
export function attentionBoard(): { texture: THREE.CanvasTexture; render(ranked: Ranked[], now: number): void } {
  const { g, W, H, texture } = screen(TV.width, TV.height);
  let drawn = '';
  return {
    texture,
    render(ranked, now) {
      // Ages tick by the minute: redraw only when what's shown changes.
      const key = JSON.stringify(ranked.map((r) => [r.entry.id, r.entry.name, r.entry.deskId, r.att.level, r.att.reason, Math.floor((now - r.att.since) / 60_000)]));
      if (key === drawn) return;
      drawn = key;
      paintAttention(g, W, H, ranked, now);
      texture.needsUpdate = true;
    },
  };
}
