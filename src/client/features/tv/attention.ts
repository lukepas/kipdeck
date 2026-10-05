/**
 * The Attention board on the east wall (the TV's slot, while nobody shares a screen): the floor's
 * units ranked by who needs someone most, in the same order as the top bar's strip (shared/attention.ts),
 * each with its state glyph, its name, where it is ("C4"), why, and for how long.
 */
import * as THREE from 'three';
import type { AttentionLevel, Ranked } from '../../../shared/attention';
import { ago, headline, statusPhrase } from '../../../shared/rowtext';
import { DESK_BY_ID, TV, cellOf } from '../../../shared/layout';
import { callSign } from '../../../shared/callsign';
import { PANEL } from '../boards/world';
import { INK, LAYOUT, MONO, emptyBody, ground, more, row, screen, titleBar } from '../boards/screen';
import { drawGlyph } from '../../world/glyphs';

/** The state glyphs, as the units and the DOM draw them (world/glyphs.ts). */
const glyph = (level: AttentionLevel) => (g: CanvasRenderingContext2D, x: number, y: number, r: number) => drawGlyph(g, level, x, y, r);

const HUE: Record<AttentionLevel, string> = { 'needs-you': PANEL.signal, stuck: PANEL.stuck, review: PANEL.review, working: PANEL.working, parked: PANEL.lineStrong };

/** Where a unit's reason starts: past its name and call sign. */
const WHY_X = 420;

/** Draws the board for `ranked` (most in need first) at `now`, on a board `W` by `H` canvas units. */
export function paintAttention(g: CanvasRenderingContext2D, W: number, H: number, ranked: Ranked[], now: number) {
  ground(g, W, H);
  const live = ranked.filter((r) => r.att.level !== 'parked');
  const counts = (['needs-you', 'stuck', 'review', 'working'] as const).map((l) => [l, live.filter((r) => r.att.level === l).length] as const);
  titleBar(g, W, 'Attention');
  // In the title bar, right-aligned: each count as its glyph and number, as the top bar has them.
  g.font = MONO(40, 600);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let x = W - LAYOUT.pad;
  for (const [level, n] of [...counts].reverse()) {
    const w = g.measureText(String(n)).width;
    x -= w;
    g.fillStyle = n ? INK.text : INK.muted;
    g.fillText(String(n), x, LAYOUT.titleBase - 2);
    x -= 34;
    drawGlyph(g, level, x + 10, LAYOUT.titleBase - 16, 16);
    x -= 36;
  }
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
    row(g, W, i, { hue: HUE[level], mark: glyph(level), text: r.entry.name, detail: why, detailX: WHY_X, side: ago(now - r.att.since), sideMono: true, sub: sign ? `${sign} at ${cell}` : cell ? `at ${cell}` : undefined, quiet: level === 'working' });
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
