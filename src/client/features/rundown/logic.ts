// The holo city's layout as plain numbers the tests run (nothing here draws): a district per part, laid
// out by the same squarified treemap as the page and the window, up to six towers in each for its
// biggest folders, a pulse for each recent commit up the towers of the parts it touched, a ring per
// milestone round the table's rim, and where the next step's beam rises. All in the table's own space:
// its middle at its top, x and z across, y up, in metres. The city stands on a plane LIFT over the
// tabletop, so from the conn it clears the table's lip; the star map, the course column and the
// heading's caption stand down while it's up (index.ts), so it has the whole table.

import { partFolders } from '../../../shared/rundown/html-sections';
import type { Rundown, Status } from '../../../shared/rundown/schema';
import { inset, squarify, withFloor } from '../../../shared/rundown/treemap';

/** The city: a square this wide over the table (inside the milestone rings), raised `lift` over its top, towers no taller than `maxH`. */
export const CITY = { size: 3.7, lift: 0.22, maxH: 1.05, minH: 0.1, perDecade: 0.24, towersPer: 6, maxTowers: 256, maxPulses: 64, pulseDays: 7 } as const;
/** The milestone rings at the table's rim, outside the heading's progress ring (features/life/heading.ts). */
export const RINGS = { inner: 2.8, outer: 3.1, width: 0.035 } as const;

export interface District {
  id: string;
  name: string;
  status: Status;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Uncommitted changes in it: it shimmers. */
  dirty: boolean;
  /** What a stuck part waits on, for its callout. */
  waitingOn: string | null;
}

export interface Tower {
  partId: string;
  status: Status;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface Pulse {
  /** The tower it climbs. */
  tower: number;
  /** 0..1: newer commits pulse brighter. */
  bright: number;
  /** 0..1: where in its climb it starts, so pulses don't march in step. */
  phase: number;
}

export interface Ring {
  radius: number;
  state: 'done' | 'active' | 'ahead';
  /** Of an active one: how much of it is done, 0..1. */
  progress: number;
}

export interface CityLayout {
  districts: District[];
  towers: Tower[];
  pulses: Pulse[];
  rings: Ring[];
  /** The district the next step points at. */
  beam: { x: number; z: number; partId: string } | null;
}

/** How tall a tower of `lines` stands: a log scale, capped. */
export function towerHeight(lines: number): number {
  return Math.min(CITY.maxH, CITY.minH + CITY.perDecade * Math.log10(Math.max(1, lines)));
}

export function cityLayout(r: Rundown, now: Date): CityLayout {
  const half = CITY.size / 2;
  const floored = withFloor(r.parts.map((p) => p.metrics.lines), 0.02);
  const tiles = squarify(r.parts.map((p, i) => ({ p, v: floored[i] })), (x) => x.v, { x: -half, y: -half, w: CITY.size, h: CITY.size });
  const districts: District[] = [];
  const towers: Tower[] = [];
  const firstTower = new Map<string, number[]>();
  for (const { item, ...t } of tiles) {
    const p = item.p;
    const box = inset(t, 0.03);
    districts.push({ id: p.id, name: p.name, status: p.status, x: box.x + box.w / 2, z: box.y + box.h / 2, w: box.w, d: box.h, dirty: p.metrics.uncommitted > 0, waitingOn: p.waitingOn ?? null });
    const folders = partFolders(r, p).slice(0, CITY.towersPer);
    const inner = inset(box, Math.min(box.w, box.h) * 0.08);
    const cells = folders.length ? squarify(folders, (f) => f.lines, inner) : [{ item: { path: p.id, lines: p.metrics.lines }, ...inner }];
    const mine: number[] = [];
    for (const c of cells) {
      if (towers.length >= CITY.maxTowers) break;
      const x = c.x + c.w / 2;
      const z = c.y + c.h / 2;
      mine.push(towers.length);
      towers.push({ partId: p.id, status: p.status, x, z, w: Math.max(0.02, c.w * 0.72), d: Math.max(0.02, c.h * 0.72), h: towerHeight(c.item.lines) });
    }
    firstTower.set(p.id, mine);
  }
  const pulses: Pulse[] = [];
  const recent = (r.facts.git?.recentCommits ?? []).filter((c) => now.getTime() - Date.parse(c.date) < CITY.pulseDays * 86_400_000);
  recent.forEach((c, i) => {
    const age = (now.getTime() - Date.parse(c.date)) / (CITY.pulseDays * 86_400_000);
    for (const id of c.parts) {
      for (const tower of (firstTower.get(id) ?? []).slice(0, 2)) {
        if (pulses.length < CITY.maxPulses) pulses.push({ tower, bright: Math.max(0.25, 1 - age), phase: (i * 0.37 + tower * 0.13) % 1 });
      }
    }
  });
  const n = r.milestones.length;
  const rings: Ring[] = r.milestones.slice(0, 6).map((m, i) => {
    const done = m.items.filter((it) => it.done).length;
    return { radius: n <= 1 ? (RINGS.inner + RINGS.outer) / 2 : RINGS.inner + ((RINGS.outer - RINGS.inner) * i) / Math.min(5, n - 1), state: m.state, progress: m.items.length ? done / m.items.length : 0 };
  });
  const target = r.nextStep?.partId ? districts.find((d) => d.id === r.nextStep!.partId) : undefined;
  return { districts, towers, pulses, rings, beam: target ? { x: target.x, z: target.z, partId: target.id } : null };
}

/** What changed between two layouts that a sound marks: parts whose status moved. */
export function statusMoves(before: readonly District[], after: readonly District[]): { id: string; from: Status; to: Status }[] {
  const was = new Map(before.map((d) => [d.id, d.status]));
  return after.flatMap((d) => {
    const from = was.get(d.id);
    return from && from !== d.status ? [{ id: d.id, from, to: d.status }] : [];
  });
}

/** The words under the crosshair at a district: "E  core - in progress". */
export const STATUS_WORDS: Record<Status, string> = { done: 'done', 'in-progress': 'in progress', 'not-started': 'not started', stuck: 'stuck' };

/** A callout to lay out: where its district is on screen (px from the top left), and its size. */
export interface CalloutIn {
  ax: number;
  ay: number;
  w: number;
  h: number;
}

/** Where a callout goes (its top left, px), and which side of the city it hangs on. */
export interface CalloutOut {
  x: number;
  y: number;
  side: 'left' | 'right';
}

/** Pixels between two callouts in a column, and between a column and the city. */
export const CALLOUT_GAP = 6;
/** Pixels kept clear at the view's edges (the top bar's height at the top). */
export const CALLOUT_EDGE = { side: 8, top: 52, bottom: 56 } as const;

/**
 * The callouts as two columns either side of the city's box on screen (`city`: its left, right, top and
 * bottom px), each beside the side its district is on (the two kept within one of each other in size),
 * in the order their districts are from the top, none covering another; a leader runs from each to its
 * district (labels.ts). A column that has no room outside the city's box stays inside the view instead,
 * right of `left` (the Units rail's edge, when it's open).
 */
export function columnLayout(items: readonly CalloutIn[], city: { left: number; right: number; top: number; bottom: number }, W: number, H: number, left = 0): CalloutOut[] {
  const mid = (city.left + city.right) / 2;
  const side: ('left' | 'right')[] = items.map((it) => (it.ax < mid ? 'left' : 'right'));
  // Keep the columns within one of each other: the ones nearest the middle cross over.
  for (;;) {
    const l = side.filter((s) => s === 'left').length;
    const r = side.length - l;
    if (Math.abs(l - r) <= 1) break;
    const from = l > r ? 'left' : 'right';
    let best = -1;
    for (let i = 0; i < items.length; i++) if (side[i] === from && (best < 0 || Math.abs(items[i].ax - mid) < Math.abs(items[best].ax - mid))) best = i;
    side[best] = from === 'left' ? 'right' : 'left';
  }
  const out: CalloutOut[] = items.map((_, i) => ({ x: 0, y: 0, side: side[i] }));
  for (const s of ['left', 'right'] as const) {
    const idx = items.map((_, i) => i).filter((i) => side[i] === s).sort((a, b) => items[a].ay - items[b].ay);
    if (!idx.length) continue;
    const w = Math.max(...idx.map((i) => items[i].w));
    const x = s === 'left' ? Math.max(left + CALLOUT_EDGE.side, city.left - CALLOUT_GAP * 3 - w) : Math.max(left + CALLOUT_EDGE.side, Math.min(W - CALLOUT_EDGE.side - w, city.right + CALLOUT_GAP * 3));
    // Each as near level with its district as the ones above it allow...
    let y = -Infinity;
    const ys = idx.map((i) => {
      y = Math.max(y, items[i].ay - items[i].h / 2);
      const at = y;
      y += items[i].h + CALLOUT_GAP;
      return at;
    });
    // ...then the column as a whole moved to stay inside the view, the top bar and the hint bar clear
    // (the top wins when it's taller than the room).
    const bottom = ys[ys.length - 1] + items[idx[idx.length - 1]].h;
    const lift = Math.max(CALLOUT_EDGE.top - ys[0], Math.min(0, H - CALLOUT_EDGE.bottom - bottom));
    idx.forEach((i, k) => {
      out[i] = { x: s === 'left' ? x + (w - items[i].w) : x, y: ys[k] + lift, side: s };
    });
  }
  return out;
}

/** Which callouts go first when they crowd: stuck, then in progress, not started, done; the bigger first within each. */
export function calloutOrder(districts: readonly District[]): District[] {
  const rank: Record<Status, number> = { stuck: 0, 'in-progress': 1, 'not-started': 2, done: 3 };
  return [...districts].sort((a, b) => rank[a.status] - rank[b.status] || b.w * b.d - a.w * a.d);
}
