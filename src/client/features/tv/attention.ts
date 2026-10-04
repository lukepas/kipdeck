/**
 * The Attention board on the east wall (the TV's slot, while nobody shares a screen): the floor's
 * units ranked by who needs someone most, in the same order as the top bar's strip (shared/attention.ts),
 * each with its state glyph, its name, where it is ("C4"), why, and for how long.
 */
import * as THREE from 'three';
import { duration, type AttentionLevel, type Ranked } from '../../../shared/attention';
import { DESK_BY_ID, cellOf } from '../../../shared/layout';
import { MONO_FONT, PANEL, UI_FONT, clip, panelGround } from '../boards/world';

const W = 1280;
const H = 720;

/** The state glyphs, as the DOM's are: shape first, hue second. */
function glyph(g: CanvasRenderingContext2D, level: AttentionLevel, x: number, y: number, r: number) {
  g.lineJoin = 'miter';
  g.lineWidth = Math.max(3, r * 0.26);
  g.beginPath();
  switch (level) {
    case 'needs-you':
      g.moveTo(x, y - r);
      g.lineTo(x + r, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r, y);
      g.closePath();
      g.fillStyle = PANEL.signal;
      g.fill();
      return;
    case 'stuck':
      g.moveTo(x, y - r);
      g.lineTo(x + r * 1.05, y + r * 0.85);
      g.lineTo(x - r * 1.05, y + r * 0.85);
      g.closePath();
      g.strokeStyle = PANEL.stuck;
      g.stroke();
      g.fillStyle = PANEL.stuck;
      g.fillRect(x - g.lineWidth / 2, y - r * 0.3, g.lineWidth, r * 0.65);
      return;
    case 'review':
      g.arc(x, y, r * 0.85, 0, Math.PI * 2);
      g.strokeStyle = PANEL.review;
      g.stroke();
      g.beginPath();
      g.arc(x, y, r * 0.22, 0, Math.PI * 2);
      g.fillStyle = PANEL.review;
      g.fill();
      return;
    case 'working':
      g.fillStyle = PANEL.working;
      g.globalAlpha = 0.7;
      g.fillRect(x - r * 0.9, y - r * 0.22, r * 1.8, r * 0.44);
      g.globalAlpha = 1;
      return;
    default:
      g.arc(x, y, r * 0.3, 0, Math.PI * 2);
      g.fillStyle = PANEL.lineStrong;
      g.fill();
  }
}

const HUE: Record<AttentionLevel, string> = { 'needs-you': PANEL.signal, stuck: PANEL.stuck, review: PANEL.review, working: PANEL.working, parked: PANEL.lineStrong };

/** Draws the board for `ranked` (most in need first) at `now`. */
export function paintAttention(g: CanvasRenderingContext2D, ranked: Ranked[], now: number) {
  panelGround(g, W, H);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const live = ranked.filter((r) => r.att.level !== 'parked');
  const counts = (['needs-you', 'stuck', 'review', 'working'] as const).map((l) => [l, live.filter((r) => r.att.level === l).length] as const);
  // Across the top: the counts, as the top bar has them.
  let x = 40;
  for (const [level, n] of counts) {
    glyph(g, level, x + 14, 52, 13);
    g.fillStyle = n ? PANEL.text : PANEL.muted;
    g.font = MONO_FONT(34);
    g.fillText(String(n), x + 40, 64);
    const w = g.measureText(String(n)).width;
    g.fillStyle = PANEL.muted;
    g.font = UI_FONT(500, 26);
    const word = { 'needs-you': 'need you', stuck: 'stuck', review: 'to review', working: 'working' }[level];
    g.fillText(word, x + 48 + w, 63);
    x += 64 + w + g.measureText(word).width + 36;
  }
  g.fillStyle = PANEL.line;
  g.fillRect(40, 92, W - 80, 2);
  if (!live.length || live.every((r) => r.att.level === 'working')) {
    g.textAlign = 'center';
    g.fillStyle = PANEL.text;
    g.font = UI_FONT(600, 46);
    g.fillText(live.length ? 'All units on task. Nothing needs you.' : 'No units on this deck', W / 2, H / 2 + 20);
    g.fillStyle = PANEL.muted;
    g.font = UI_FONT(500, 28);
    g.fillText(live.length ? `${live.length} working` : 'Deploy one at a free console', W / 2, H / 2 + 70);
    g.textAlign = 'left';
    if (!live.length) return;
  }
  const rows = live.filter((r) => r.att.level !== 'working' || live.length <= 7).slice(0, 7);
  if (!rows.length) return;
  const rowH = 84;
  rows.forEach((r, i) => {
    const y = 112 + i * rowH;
    const level = r.att.level;
    g.fillStyle = i === 0 && level !== 'working' ? PANEL.cardHi : PANEL.card;
    g.fillRect(40, y, W - 80, rowH - 10);
    g.fillStyle = HUE[level];
    g.fillRect(40, y, 5, rowH - 10);
    glyph(g, level, 84, y + (rowH - 10) / 2, 15);
    const desk = DESK_BY_ID.get(r.entry.deskId);
    const cell = desk ? cellOf(desk.x, desk.z) : '';
    g.fillStyle = PANEL.text;
    g.font = MONO_FONT(30);
    g.fillText(clip(g, r.entry.name, 220), 120, y + 34);
    g.fillStyle = PANEL.muted;
    g.font = MONO_FONT(22);
    g.fillText(cell ? `at ${cell}` : '', 120, y + 62);
    const age = duration(now - r.att.since).replace('under a minute', '<1 min');
    g.textAlign = 'right';
    g.fillStyle = PANEL.muted;
    g.font = MONO_FONT(26);
    g.fillText(age, W - 64, y + 46);
    const ageW = g.measureText(age).width;
    g.textAlign = 'left';
    g.fillStyle = level === 'working' ? PANEL.muted : PANEL.text;
    g.font = UI_FONT(500, 28);
    const why = r.att.reason ?? r.entry.task?.name ?? r.entry.activity ?? 'at work';
    g.fillText(clip(g, why, W - 64 - ageW - 40 - 380), 380, y + 46);
  });
  const more = live.length - rows.length;
  if (more > 0) {
    g.fillStyle = PANEL.muted;
    g.font = MONO_FONT(24);
    g.textAlign = 'right';
    g.fillText(`+${more}`, W - 44, H - 20);
    g.textAlign = 'left';
  }
}

/** The board's texture, and how to bring it up to date. */
export function attentionBoard(): { texture: THREE.CanvasTexture; render(ranked: Ranked[], now: number): void } {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  let drawn = '';
  return {
    texture,
    render(ranked, now) {
      // Ages tick by the minute: redraw only when what's shown changes.
      const key = JSON.stringify(ranked.map((r) => [r.entry.id, r.entry.name, r.entry.deskId, r.att.level, r.att.reason, Math.floor((now - r.att.since) / 60_000)]));
      if (key === drawn) return;
      drawn = key;
      paintAttention(g, ranked, now);
      texture.needsUpdate = true;
    },
  };
}
