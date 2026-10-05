import type { AttentionCounts, AttentionLevel } from '../../../shared/attention';
import { drawGlyph } from '../../world/glyphs';
import { DECK } from '../../world/office/materials';
import { stretch } from '../../world/toon';

// What the bridge's own instruments say, painted on canvases: the counts (the top bar's, glyph and
// number, in its order) and the course (the floor's mission as a heading and waypoints). The conn's
// armrest panels and the overhead strip paint from here. Hue only where a state has one.

/** The floor's mission as the bridge reads it: the statement and the milestones, the active one marked. */
export interface Course {
  statement: string;
  milestones: { title: string; done: boolean; active: boolean }[];
}

/** The levels the top bar counts, in its order, and what each is called on an instrument. */
const COUNTED: readonly [AttentionLevel, string][] = [
  ['needs-you', 'NEED YOU'],
  ['stuck', 'STUCK'],
  ['review', 'TO REVIEW'],
  ['working', 'WORKING'],
];

const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;
const MONO = (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;

/** Cuts `text` with a dot until it fits `max` pixels. */
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  let t = text;
  while (t.length > 3 && g.measureText(t).width > max) t = `${t.slice(0, -2).trimEnd()}.`;
  return t;
}

/** An instrument's face: instrument black, a ship-cyan hairline round it and its title top left. */
function face(g: CanvasRenderingContext2D, W: number, H: number, title: string) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = DECK.instrument;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = DECK.shipDim;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  g.fillStyle = DECK.ship;
  g.font = MONO(Math.round(H * 0.075));
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.letterSpacing = '3px';
  g.fillText(title, H * 0.07, H * 0.06);
  g.letterSpacing = '0px';
}

/** The counts as rows, glyph, number and name: the conn's left armrest. */
export function paintCountRows(g: CanvasRenderingContext2D, W: number, H: number, c: AttentionCounts) {
  face(g, W, H, 'STATUS');
  const top = H * 0.22;
  const row = (H - top - H * 0.04) / COUNTED.length;
  COUNTED.forEach(([level, label], i) => {
    const y = top + row * (i + 0.5);
    const n = c[level];
    drawGlyph(g, level, H * 0.13, y, row * 0.26, true);
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    g.fillStyle = n ? DECK.text : DECK.muted;
    g.font = UI(700, Math.round(row * 0.62));
    g.fillText(String(n), W * 0.42, y);
    g.textAlign = 'left';
    g.fillStyle = n && level !== 'working' ? DECK.text : DECK.muted;
    g.font = MONO(Math.round(row * 0.34));
    g.fillText(label, W * 0.47, y);
  });
}

/** The counts in one line, as big as the strip allows: the overhead strip over the forward displays. */
export function paintCountStrip(g: CanvasRenderingContext2D, W: number, H: number, c: AttentionCounts) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = DECK.instrument;
  g.fillRect(0, 0, W, H);
  g.fillStyle = DECK.shipDim;
  g.fillRect(0, 0, W, 4);
  g.fillRect(0, H - 4, W, 4);
  const cell = W / COUNTED.length;
  COUNTED.forEach(([level, label], i) => {
    const x = cell * i;
    const y = H / 2;
    const n = c[level];
    if (i) {
      g.fillStyle = DECK.hullSeam;
      g.fillRect(x, H * 0.2, 3, H * 0.6);
    }
    drawGlyph(g, level, x + H * 0.55, y, H * 0.2, true);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = n ? DECK.text : DECK.muted;
    g.font = UI(700, Math.round(H * 0.6));
    g.fillText(String(n), x + H * 0.95, y + H * 0.03);
    const w = g.measureText(String(n)).width;
    g.fillStyle = n && level !== 'working' ? DECK.text : DECK.muted;
    g.font = UI(600, Math.round(H * 0.22));
    stretch(g, true);
    g.letterSpacing = '4px';
    g.fillText(label, x + H * 1.1 + w, y + H * 0.03);
    g.letterSpacing = '0px';
    stretch(g, false);
  });
}

/** Which waypoint the ship is making for, of how many (1-based), and its title: none with no course. */
export function waypoint(course: Course): { n: number; of: number; title: string } | null {
  const ms = course.milestones;
  if (!ms.length) return null;
  const at = ms.findIndex((m) => m.active);
  const i = at >= 0 ? at : Math.min(ms.length - 1, ms.filter((m) => m.done).length);
  return { n: i + 1, of: ms.length, title: ms[i].title };
}

/** The course: its heading (the statement), and the waypoint the ship is making for. The conn's right armrest. */
export function paintCourse(g: CanvasRenderingContext2D, W: number, H: number, course: Course) {
  face(g, W, H, 'COURSE');
  const pad = H * 0.07;
  const wp = waypoint(course);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  if (!course.statement && !wp) {
    g.fillStyle = DECK.muted;
    g.font = UI(600, Math.round(H * 0.11));
    g.fillText('Set the course', pad, H * 0.3);
    g.font = MONO(Math.round(H * 0.065));
    g.fillText('in Mission control', pad, H * 0.47);
    return;
  }
  g.fillStyle = DECK.text;
  g.font = UI(600, Math.round(H * 0.1));
  g.fillText(fit(g, course.statement || 'No heading set', W - 2 * pad), pad, H * 0.22);
  if (!wp) return;
  g.fillStyle = DECK.ship;
  g.font = MONO(Math.round(H * 0.075));
  g.letterSpacing = '2px';
  g.fillText(`WP ${wp.n} OF ${wp.of}`, pad, H * 0.44);
  g.letterSpacing = '0px';
  g.fillStyle = DECK.text;
  g.font = UI(500, Math.round(H * 0.085));
  g.fillText(fit(g, wp.title, W - 2 * pad), pad, H * 0.57);
  // The waypoints as a row of ticks: solid once passed, ringed for the one we're making for.
  const n = course.milestones.length;
  const x0 = pad + 8;
  const x1 = W - pad - 8;
  const y = H * 0.84;
  g.strokeStyle = DECK.shipDim;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo(x1, y);
  g.stroke();
  course.milestones.forEach((m, i) => {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    g.beginPath();
    g.arc(x, y, H * 0.03, 0, Math.PI * 2);
    g.fillStyle = m.done ? DECK.ship : DECK.instrument;
    g.fill();
    g.strokeStyle = m.done || m.active ? DECK.ship : DECK.shipDim;
    g.stroke();
    if (m.active) {
      g.beginPath();
      g.arc(x, y, H * 0.055, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

/**
 * The course on a slim strip (the captain's right armrest): the waypoint the ship is making for, its
 * title, and a tick per waypoint along the bottom, solid once passed and ringed for the one it's making for.
 */
export function paintCourseStrip(g: CanvasRenderingContext2D, W: number, H: number, course: Course) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = DECK.instrument;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = DECK.shipDim;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  const pad = H * 0.14;
  const wp = waypoint(course);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = DECK.ship;
  g.font = MONO(Math.round(H * 0.24));
  g.letterSpacing = '2px';
  const tag = wp ? `WP ${wp.n}/${wp.of}` : 'COURSE';
  g.fillText(tag, pad, H * 0.36);
  const tw = g.measureText(tag).width;
  g.letterSpacing = '0px';
  g.fillStyle = wp || course.statement ? DECK.text : DECK.muted;
  g.font = UI(600, Math.round(H * 0.3));
  g.fillText(fit(g, wp ? wp.title : course.statement || 'Set in Mission control', W - tw - pad * 3), pad * 2 + tw, H * 0.37);
  const n = course.milestones.length;
  if (!n) return;
  const x0 = pad + 6;
  const x1 = W - pad - 6;
  const y = H * 0.76;
  g.strokeStyle = DECK.shipDim;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo(x1, y);
  g.stroke();
  course.milestones.forEach((m, i) => {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    g.beginPath();
    g.arc(x, y, H * 0.06, 0, Math.PI * 2);
    g.fillStyle = m.done ? DECK.ship : DECK.instrument;
    g.fill();
    g.strokeStyle = m.done || m.active ? DECK.ship : DECK.shipDim;
    g.stroke();
  });
}
