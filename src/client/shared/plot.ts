// The Plot: the deck drawn as a plan in hairlines, straight from shared/layout.ts, so it never drifts
// from the 3D deck. The grid with its column bubbles, the mission table with a wedge per milestone,
// the four pods of consoles, the ready line with its numbered ticks, the situation wall's panels, the
// Proof corner, the Review bay, the Standby bench, the Deck lift and the title block. Units are their state glyphs
// with their call signs, and a unit that needs you stands on its pod's ready line in ranking order,
// as it does on the deck. No three.js: the 2D view draws it live and the sign-in pages draw it once.
import { UPSTREAM_CREDIT_SHORT } from '../../shared/copy';
import './plot.css';
import {
  BEANBAGS,
  BOARDS,
  DESK_BY_ID,
  DESKS,
  ELEVATOR,
  ELEVATOR_BACK,
  ELEVATOR_FRONT,
  FLOOR,
  GRID,
  MACHINE_MONITOR,
  MEETING_ROOM,
  MEETING_TABLE,
  MISSION_TABLE,
  PODS,
  PROOF_CORNER,
  READY_LINE,
  TITLE_BLOCK,
  TV,
  deskSeat,
  podOf,
  readySpot,
  type PodLetter,
} from '../../shared/layout';
import { callSign } from '../../shared/callsign';
import type { AttentionLevel } from '../../shared/attention';

const NS = 'http://www.w3.org/2000/svg';

/** What a unit on the plot shows: its level's glyph, or the violet check for a fresh merge. */
export type PlotLevel = AttentionLevel | 'merged';

export interface PlotUnit {
  id: string;
  deskId: string;
  name: string;
  level: PlotLevel;
  /** Read out by a screen reader and shown on hover: who it is and why it is where it is. */
  label?: string;
}

export interface PlotOptions {
  /** 'live' fits the deck to its box; 'art' runs the grid past it, for a page background. */
  kind?: 'live' | 'art';
  /** The mission's milestones, one wedge each round the table; done ones are filled. */
  milestones?: readonly { done: boolean; active?: boolean }[];
  /** Each pod's goal, stencilled under its letter. */
  podGoals?: Partial<Record<PodLetter, string>>;
  /** The title block's lines: the deck's name and its revision. */
  deck?: string;
  revision?: string;
  /** Picking a unit (a click or Enter on its glyph). */
  onPick?: (id: string) => void;
}

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs = {}, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
}

const text = (x: number, y: number, cls: string, s: string, attrs: Attrs = {}) => el('text', { x: r(x), y: r(y), class: cls, ...attrs }, s);
/** To the centimetre: shorter markup, and the same number every time. */
const r = (v: number) => Math.round(v * 100) / 100;
const deg = (rad: number) => r((rad * 180) / Math.PI);

/** The box the live plot fits: the slab, its bubbles and a little air. */
const LIVE_BOX = { x: FLOOR.minX - 2.4, y: FLOOR.minZ - 2.4, w: FLOOR.maxX - FLOOR.minX + 3.2, h: FLOOR.maxZ - FLOOR.minZ + 3.4 };

/** Where each unit stands: its seat, or for one that needs you, its tick on its pod's ready line (in the order given, most in need first). */
export function plotSpots(units: readonly PlotUnit[]): Map<string, { x: number; z: number; tick?: number }> {
  const out = new Map<string, { x: number; z: number; tick?: number }>();
  const ticks = new Map<PodLetter, number>();
  for (const u of units) {
    const desk = DESK_BY_ID.get(u.deskId);
    if (!desk) continue;
    const pod = podOf(u.deskId);
    if (u.level === 'needs-you' && pod) {
      const tick = (ticks.get(pod) ?? 0) + 1;
      ticks.set(pod, tick);
      const s = readySpot(pod, tick);
      out.set(u.id, { x: s.x, z: s.z, tick });
    } else {
      const s = desk.beanbag || desk.station || desk.room ? { x: desk.x, z: desk.z } : deskSeat(desk, 0.95);
      out.set(u.id, s);
    }
  }
  return out;
}

/** The plot: an SVG of the deck, and a way to move its units without drawing the rest again. */
export class Plot {
  readonly el: SVGSVGElement;
  private units: SVGGElement;
  private table: SVGGElement;
  private pods: SVGGElement;
  private block: SVGGElement;

  constructor(private opts: PlotOptions = {}) {
    const art = opts.kind === 'art';
    const b = LIVE_BOX;
    this.el = el('svg', { class: `plot${art ? ' plot-art' : ''}`, viewBox: `${b.x} ${b.y} ${b.w} ${b.h}`, preserveAspectRatio: 'xMidYMid meet' });
    if (art) this.el.setAttribute('aria-hidden', 'true');
    else {
      this.el.setAttribute('role', 'img');
      this.el.setAttribute('aria-label', 'The deck plan: the mission table, four pods of consoles and where each unit is');
    }
    this.el.append(defs(), grid(art), structure(), zones());
    this.table = el('g', { class: 'p-table' });
    this.pods = el('g', { class: 'p-pods' });
    this.block = el('g', { class: 'p-block' });
    this.units = el('g', { class: 'p-units' });
    this.el.append(this.table, consoles(), this.pods, readyLine(), this.block, this.units);
    this.setMission(opts.milestones);
    this.setPodGoals(opts.podGoals);
    this.setDeck(opts.deck, opts.revision);
  }

  /** The table's wedges, one per milestone (four blank ones without a mission). */
  setMission(milestones?: readonly { done: boolean; active?: boolean }[]) {
    const { r: R } = MISSION_TABLE;
    const list = milestones?.length ? milestones : [{ done: false }, { done: false }, { done: false }, { done: false }];
    const n = list.length;
    const kids: SVGElement[] = [el('circle', { cx: 0, cy: 0, r: R, class: 'p-table-edge' })];
    list.forEach((m, i) => {
      const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n + 0.04;
      const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n - 0.04;
      const ri = 1.1;
      const ro = R - 0.35;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad: number, a: number) => `${r(Math.cos(a) * rad)} ${r(Math.sin(a) * rad)}`;
      kids.push(el('path', { d: `M${p(ri, a0)}L${p(ro, a0)}A${ro} ${ro} 0 ${large} 1 ${p(ro, a1)}L${p(ri, a1)}A${ri} ${ri} 0 ${large} 0 ${p(ri, a0)}Z`, class: `p-wedge${m.done ? ' done' : ''}${m.active ? ' active' : ''}` }));
    });
    // The Formation mark in the middle of the table.
    kids.push(
      el(
        'g',
        { class: 'p-mark', transform: 'translate(-.9 -.95) scale(.075)' },
        el('path', { d: 'M4 10 11 3l1 1 1-1 7 7v4l-8-8-8 8Z', class: 'p-mark-lead' }),
        el('path', { d: 'm4 17 8-8 8 8M4 22l8-8 8 8', class: 'p-mark-trail' }),
      ),
    );
    this.table.replaceChildren(...kids);
  }

  /** Each pod's letter, and its goal under it when it has one. */
  setPodGoals(goals?: Partial<Record<PodLetter, string>>) {
    this.pods.replaceChildren(
      ...PODS.flatMap((p) => {
        const x = Math.cos(p.angle) * 10.4;
        const y = Math.sin(p.angle) * 10.4;
        const goal = goals?.[p.letter];
        return [text(x, y + 0.45, 'p-pod', p.letter), ...(goal ? [text(x, y + 1.35, 'p-pod-goal', clip(goal, 22))] : [])];
      }),
    );
  }

  /** The title block in the south-east corner of the slab, with the credit to agent-office. */
  setDeck(deck = 'Deck', revision?: string) {
    const { minX, maxX, minZ, maxZ } = TITLE_BLOCK;
    const mid = minZ + 0.95;
    this.block.replaceChildren(
      el('rect', { x: minX, y: minZ, width: maxX - minX, height: maxZ - minZ, class: 'p-block-box' }),
      el('line', { x1: minX, y1: mid, x2: maxX, y2: mid, class: 'p-block-rule' }),
      el('line', { x1: minX + 2.9, y1: minZ, x2: minX + 2.9, y2: mid, class: 'p-block-rule' }),
      text(minX + 0.25, minZ + 0.62, 'p-block-brand', 'UGC ARMY'),
      text(minX + 3.15, minZ + 0.62, 'p-block-deck', clip(deck, 14).toUpperCase()),
      text(minX + 0.25, mid + 0.55, 'p-block-small', revision ? `REV ${revision}` : 'MISSION CONTROL FOR AI AGENTS'),
      text(minX + 0.25, maxZ - 0.3, 'p-block-small', UPSTREAM_CREDIT_SHORT),
    );
  }

  /** Draws the units again: their glyphs, call signs, and needs-you units on the ready line. */
  setUnits(units: readonly PlotUnit[]) {
    const spots = plotSpots(units);
    const kids: SVGElement[] = [];
    // Drawn least urgent first, so the ones that need you sit on top.
    const order = [...units].reverse();
    for (const u of order) {
      const s = spots.get(u.id);
      if (!s) continue;
      const g = el('g', { class: `p-unit l-${u.level}`, transform: `translate(${r(s.x)} ${r(s.z)})` });
      g.append(el('title', {}, u.label ?? `${callSign(u.deskId)} ${u.name}`));
      g.append(...glyph(u.level));
      const sign = callSign(u.deskId);
      if (sign) {
        // On the ready line the neighbours are a meter apart: the call sign goes out, away from the table.
        if (s.tick) {
          const a = Math.atan2(s.z, s.x);
          const lx = Math.cos(a) * 1.0;
          const ly = Math.sin(a) * 1.0 + 0.22;
          g.append(text(lx, ly, 'p-sign', sign, { 'text-anchor': Math.cos(a) >= 0 ? 'start' : 'end' }));
        } else g.append(text(0.75, 0.24, 'p-sign', sign));
      }
      if (this.opts.onPick) {
        const pick = this.opts.onPick;
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', u.label ?? `${sign} ${u.name}`);
        g.addEventListener('click', () => pick(u.id));
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick(u.id);
          }
        });
      }
      kids.push(g);
    }
    this.units.replaceChildren(...kids);
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/** A state's glyph, in plan meters round (0, 0): the same shapes as ui/icons.ts. */
function glyph(level: PlotLevel): SVGElement[] {
  switch (level) {
    case 'needs-you':
      return [el('circle', { r: 0.62, class: 'p-ring' }), el('path', { d: 'M0-.45.45 0 0 .45-.45 0Z', class: 'p-g' })];
    case 'stuck':
      return [el('circle', { r: 0.85, class: 'p-hatch' }), el('path', { d: 'M0-.55.6.48H-.6Z', class: 'p-g' }), el('path', { d: 'M0-.12v.32', class: 'p-g-bar' })];
    case 'review':
      return [el('circle', { r: 0.42, class: 'p-g' }), el('circle', { r: 0.13, class: 'p-g-dot' })];
    case 'working':
      return [el('rect', { x: -0.22, y: -0.22, width: 0.44, height: 0.44, class: 'p-g' })];
    case 'merged':
      return [el('rect', { x: -0.42, y: -0.42, width: 0.84, height: 0.84, class: 'p-g' }), el('path', { d: 'M-.22 0 -.04.18.24-.16', class: 'p-g-check' })];
    default:
      return [el('circle', { r: 0.16, class: 'p-g' })];
  }
}

function defs(): SVGElement {
  // The stuck ring's 45 degree hatch, as on the deck.
  const hatch = el('pattern', { id: 'plot-hatch', width: 0.3, height: 0.3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, el('line', { x1: 0, y1: 0, x2: 0, y2: 0.3, class: 'p-hatch-line' }));
  return el('defs', {}, hatch);
}

/** The 1 m grid, every fifth line stronger; for the art it runs on past the slab. */
function grid(art: boolean): SVGElement {
  const g = el('g', { class: 'p-grid' });
  const x0 = art ? -70 : FLOOR.minX;
  const x1 = art ? 70 : FLOOR.maxX;
  const z0 = art ? -50 : FLOOR.minZ;
  const z1 = art ? 50 : FLOOR.maxZ;
  for (let x = x0; x <= x1; x++) g.append(el('line', { x1: x, y1: z0, x2: x, y2: z1, class: x % 5 ? 'minor' : 'major' }));
  for (let z = z0; z <= z1; z++) g.append(el('line', { x1: x0, y1: z, x2: x1, y2: z, class: z % 5 ? 'minor' : 'major' }));
  return g;
}

/** The slab and its structural grid: a column line per cell, lettered A-H across and numbered 1-6 down. */
function structure(): SVGElement {
  const g = el('g', { class: 'p-structure' });
  g.append(el('rect', { x: FLOOR.minX, y: FLOOR.minZ, width: FLOOR.maxX - FLOOR.minX, height: FLOOR.maxZ - FLOOR.minZ, class: 'p-slab' }));
  // The south side is only a curb: a lighter line, so the Overview sees over it.
  g.append(el('line', { x1: FLOOR.minX, y1: FLOOR.maxZ, x2: FLOOR.maxX, y2: FLOOR.maxZ, class: 'p-curb' }));
  [...GRID.cols].forEach((letter, i) => {
    const x = FLOOR.minX + (i + 0.5) * GRID.step;
    g.append(el('line', { x1: x, y1: FLOOR.minZ, x2: x, y2: FLOOR.maxZ, class: 'p-col' }));
    g.append(el('circle', { cx: x, cy: FLOOR.minZ - 1.2, r: 0.62, class: 'p-bubble' }));
    g.append(text(x, FLOOR.minZ - 0.98, 'p-bubble-t', letter));
  });
  for (let i = 0; i < GRID.rows; i++) {
    const z = Math.min(FLOOR.maxZ - 0.6, FLOOR.minZ + (i + 0.5) * GRID.step);
    g.append(el('line', { x1: FLOOR.minX, y1: z, x2: FLOOR.maxX, y2: z, class: 'p-col' }));
    g.append(el('circle', { cx: FLOOR.minX - 1.2, cy: z, r: 0.62, class: 'p-bubble' }));
    g.append(text(FLOOR.minX - 1.2, z + 0.22, 'p-bubble-t', String(i + 1)));
  }
  return g;
}

/** The 16 consoles, each turned to face the table, as on the deck. */
function consoles(): SVGElement {
  const g = el('g', { class: 'p-consoles' });
  for (const d of DESKS) g.append(el('rect', { x: r(d.x - 0.75), y: r(d.z - 0.4), width: 1.5, height: 0.8, transform: `rotate(${deg(-d.rotY)} ${r(d.x)} ${r(d.z)})` }));
  return g;
}

/** Each pod's ready line: a double stripe on its inner edge with its numbered ticks. */
function readyLine(): SVGElement {
  const g = el('g', { class: 'p-ready' });
  for (const p of PODS) {
    const span = (READY_LINE.ticks * READY_LINE.spacing) / READY_LINE.r / 2 + 0.06;
    for (const rad of [READY_LINE.r - 0.5, READY_LINE.r - 0.38]) {
      const a0 = p.angle - span;
      const a1 = p.angle + span;
      g.append(el('path', { d: `M${r(Math.cos(a0) * rad)} ${r(Math.sin(a0) * rad)}A${rad} ${rad} 0 0 1 ${r(Math.cos(a1) * rad)} ${r(Math.sin(a1) * rad)}`, class: 'p-stripe' }));
    }
    for (let t = 1; t <= READY_LINE.ticks; t++) {
      const s = readySpot(p.letter, t);
      const a = Math.atan2(s.z, s.x);
      const ri = READY_LINE.r - 0.62;
      const ro = READY_LINE.r - 0.26;
      g.append(el('line', { x1: r(Math.cos(a) * ri), y1: r(Math.sin(a) * ri), x2: r(Math.cos(a) * ro), y2: r(Math.sin(a) * ro), class: 'p-tick' }));
      const rt = READY_LINE.r - 1.05;
      g.append(text(Math.cos(a) * rt, Math.sin(a) * rt + 0.14, 'p-tick-t', String(t)));
    }
  }
  return g;
}

/** The situation wall and its boards, the Proof corner, the Review bay, the Standby bench and the Deck lift. */
function zones(): SVGElement {
  const g = el('g', { class: 'p-zones' });
  const label = (x: number, y: number, s: string, cls = '', anchor = 'middle') => text(x, y, `p-zone-t ${cls}`.trim(), s, { 'text-anchor': anchor });
  // The situation wall: each panel a line along its face, its name on the table's side of it.
  const facets: [{ x: number; z: number; rotY: number; width: number }, string, string][] = [
    [BOARDS.issues, 'ISSUES', ''],
    [BOARDS.queue, 'QUEUE', ''],
    [TV, 'ATTENTION', 'attention'],
    [BOARDS.pulls, 'PRS', ''],
    [BOARDS.services, 'SERVICES', ''],
  ];
  for (const [b, name, cls] of facets) {
    const tx = Math.cos(b.rotY);
    const tz = -Math.sin(b.rotY);
    const nx = Math.sin(b.rotY);
    const nz = Math.cos(b.rotY);
    const h = b.width / 2 - 0.1;
    g.append(el('line', { x1: r(b.x - tx * h), y1: r(b.z - tz * h), x2: r(b.x + tx * h), y2: r(b.z + tz * h), class: `p-board ${cls}`.trim() }));
    // Its name behind it, in the aisle between the wall and the deck's edge, running away from the
    // table so it clears the line and the pods' letters.
    const anchor = b.x < -1 ? 'end' : b.x > 1 ? 'start' : 'middle';
    g.append(label(b.x - nx * 0.75, b.z - nz * 0.75 + 0.2, name, cls, anchor));
  }
  // The Proof corner on the west wall: the capacity panel, the violet rail, the vault and the plinth.
  const m = MACHINE_MONITOR;
  g.append(el('line', { x1: FLOOR.minX + 0.2, y1: m.z - m.width / 2, x2: FLOOR.minX + 0.2, y2: m.z + m.width / 2, class: 'p-board' }));
  g.append(label(FLOOR.minX + 0.7, m.z + 0.2, 'CAPACITY', '', 'start'));
  const { rail, vault, plinth } = PROOF_CORNER;
  g.append(el('rect', { x: FLOOR.minX + 0.1, y: rail.z - 0.5, width: 0.3, height: 1, class: 'p-proof' }));
  g.append(label(FLOOR.minX + 0.7, rail.z + 0.2, 'PROOF', 'proof', 'start'));
  g.append(el('rect', { x: vault.x - vault.depth / 2, y: vault.z - vault.width / 2, width: vault.depth, height: vault.width, class: 'p-proof-line' }));
  g.append(label(vault.x + 0.9, vault.z + 0.2, 'ESCROW', 'proof', 'start'));
  for (let i = 0; i < plinth.steps; i++) {
    const w = plinth.width - i * 0.28;
    g.append(el('rect', { x: r(plinth.x - w / 2), y: r(plinth.z - w / 2), width: r(w), height: r(w), class: 'p-proof-line' }));
  }
  g.append(label(plinth.x + 1.05, plinth.z + 0.2, 'ERC-8004', 'proof', 'start'));
  // The Review bay: smoked glass along its front (the door in it) and its side, and its table.
  const mr = MEETING_ROOM;
  const fz = mr.front.z;
  const sx = mr.side.x;
  const far = Math.abs(mr.door.x0 - sx) > Math.abs(mr.door.x1 - sx) ? mr.door.x0 : mr.door.x1;
  const nearDoor = far === mr.door.x0 ? mr.door.x1 : mr.door.x0;
  const wallX = Math.abs(mr.minX - sx) > Math.abs(mr.maxX - sx) ? mr.minX : mr.maxX;
  const backZ = Math.abs(mr.minZ - fz) > Math.abs(mr.maxZ - fz) ? mr.minZ : mr.maxZ;
  g.append(el('path', { d: `M${far} ${fz}H${wallX} M${nearDoor} ${fz}H${sx}V${backZ}`, class: 'p-glass' }));
  const t = MEETING_TABLE;
  g.append(el('rect', { x: t.x - t.width / 2, y: t.z - t.depth / 2, width: t.width, height: t.depth, class: 'p-furniture' }));
  g.append(label((mr.minX + mr.maxX) / 2, fz - mr.front.out * 0.8 + 0.2, 'REVIEW BAY'));
  // The Standby bench along the south curb.
  for (const b of BEANBAGS) g.append(el('rect', { x: r(b.x - 0.5), y: r(b.z - 0.3), width: 1, height: 0.6, class: 'p-furniture' }));
  g.append(label(BEANBAGS[0].x - 0.5, BEANBAGS[0].z - 0.9, 'STANDBY', '', 'start'));
  // The Deck lift: its housing on the south curb, the portal toward the deck.
  const lx = ELEVATOR.x - ELEVATOR.width / 2;
  const lz = Math.min(ELEVATOR_BACK, ELEVATOR_FRONT);
  g.append(el('rect', { x: lx, y: lz, width: ELEVATOR.width, height: ELEVATOR.depth, class: 'p-lift' }));
  g.append(label(ELEVATOR.x, ELEVATOR_FRONT + Math.sign(ELEVATOR_FRONT - ELEVATOR_BACK) * 0.75 + 0.2, 'LIFT'));
  return g;
}
