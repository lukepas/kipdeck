/**
 * Callouts never cover each other (a pod seen end on, the Overview from far off): every frame each
 * unit's callout is measured on screen and placed in the order of who needs someone most (needs you
 * and stuck, then to review, then the nearest). One that would overlap a callout already placed is
 * lifted a little; if that isn't enough it shrinks to its glyph and call sign ("C-02"); a unit at work
 * whose call sign still has no room shows no callout at all. One that needs someone (needs you, stuck,
 * to review) or is selected always shows, at full strength: lifted as far as MAX_LIFT allows, and past
 * that slid sideways clear of the others, a hairline tying it back to its unit. A shrunk callout grows
 * back to its full card only once there is GROW_ROOM to spare, so it doesn't flick between the two as
 * the view drifts. A callout that would run off the side of the view, or under the Units rail, slides
 * back in. Then none covers a wall board: one that would docks under that board's lower bezel, or fades
 * (dock.ts); one that needs someone and finds no slot stays over the board rather than going. The
 * placing itself is declutter(), nudge() and dock(), with nothing to draw, so the tests run them.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { FADED, dock, standsDown } from './dock';
import { labelSource, pileWord, piles } from './labels';
import { debugHandle } from '../giveway';
import { Worker } from '../../world/character';
import './chips.css';

/** A callout on screen, in pixels from the top left: its left edge, its bottom edge, its size. */
export interface LabelBox {
  x: number;
  bottom: number;
  w: number;
  h: number;
}

/** Pixels kept between two stacked callouts. */
const GAP = 3;
/** The most a callout is lifted, in its own heights: past that it may cover, rather than float off its unit. */
const MAX_LIFT = 4;

/**
 * How far (pixels, up) to lift each of `boxes`, in the order given (most important first), so none
 * covers one before it. Each is lifted only as far as it must be, and never past MAX_LIFT of its height.
 */
export function stack(boxes: readonly LabelBox[]): number[] {
  const placed: { x: number; top: number; bottom: number; w: number }[] = [];
  return boxes.map((b) => {
    let lift = 0;
    for (let tries = 0; tries < boxes.length; tries++) {
      const bottom = b.bottom - lift;
      const top = bottom - b.h;
      const hit = placed.find((p) => b.x < p.x + p.w && b.x + b.w > p.x && bottom > p.top && top < p.bottom);
      if (!hit) break;
      lift = b.bottom - hit.top + GAP;
    }
    lift = Math.min(lift, MAX_LIFT * b.h);
    placed.push({ x: b.x, top: b.bottom - lift - b.h, bottom: b.bottom - lift, w: b.w });
    return lift;
  });
}

/** A callout to place: its full box, its call-sign box, and whether it may be left out. */
export interface Label {
  full: LabelBox;
  compact: LabelBox;
  /** Needs someone (or is selected): it always shows. */
  keep: boolean;
  /** It showed its full card last frame: it keeps it with less room than it takes to grow back to it. */
  wasFull?: boolean;
}

export interface Placed {
  mode: 'full' | 'compact' | 'hidden';
  lift: number;
  /** Pixels slid sideways (positive to the right) to clear the callouts placed before it. */
  dx: number;
}

/** Pixels to spare all round before a shrunk callout grows back to its full card. */
export const GROW_ROOM = 8;

/** How far (in its own heights) a callout is lifted before it shrinks instead. */
const SOFT_LIFT = 1.5;

/** `b` grown by `by` pixels on every side. */
const grown = (b: LabelBox, by: number): LabelBox => ({ x: b.x - by, bottom: b.bottom + by, w: b.w + 2 * by, h: b.h + 2 * by });

type Box = { x: number; top: number; bottom: number; w: number };

/**
 * Where a callout that must show goes once lifting it MAX_LIFT hasn't cleared it: slid sideways just
 * clear of a callout in its way (either side, the nearest first, at most three of its widths), at the
 * least lift that then clears. Null when nothing does.
 */
function sideStep(b: LabelBox, placed: Box[]): { dx: number; lift: number } | null {
  const shifts = placed.flatMap((p) => [p.x + p.w + GAP - b.x, p.x - GAP - (b.x + b.w)]).filter((dx) => Math.abs(dx) <= 3 * b.w);
  let best: { dx: number; lift: number } | null = null;
  for (const dx of shifts) {
    const lift = clearLift({ ...b, x: b.x + dx }, placed, MAX_LIFT * b.h);
    if (lift === null) continue;
    if (!best || Math.abs(dx) + lift < Math.abs(best.dx) + best.lift) best = { dx, lift };
  }
  return best;
}

/** The lift that clears `b` of every box placed, or null past `limit` pixels. */
function clearLift(b: LabelBox, placed: Box[], limit: number): number | null {
  let lift = 0;
  for (let tries = 0; tries <= placed.length; tries++) {
    const bottom = b.bottom - lift;
    const top = bottom - b.h;
    const hit = placed.find((p) => b.x < p.x + p.w && b.x + b.w > p.x && bottom > p.top && top < p.bottom);
    if (!hit) return lift <= limit ? lift : null;
    lift = b.bottom - hit.top + GAP;
    if (lift > limit) return null;
  }
  return null;
}

/**
 * Where each of `labels` goes, in the order given (most important first): its full callout if it fits
 * with a small lift (a shrunk one needs GROW_ROOM to spare as well), else its call sign, else (one that
 * needs nobody) nothing. One that must show and fits nowhere takes its call sign lifted up to
 * MAX_LIFT, else slid sideways clear (sideStep); only when even that finds no room does it cover another.
 */
export function declutter(labels: readonly Label[]): Placed[] {
  const placed: Box[] = [];
  const put = (b: LabelBox, lift: number, dx = 0) => placed.push({ x: b.x + dx, top: b.bottom - lift - b.h, bottom: b.bottom - lift, w: b.w });
  return labels.map((l) => {
    // Growing back needs room to spare; staying full needs only the room it takes.
    const room = l.wasFull === false ? clearLift(grown(l.full, GROW_ROOM), placed, SOFT_LIFT * l.full.h) : 0;
    const full = room === null ? null : clearLift(l.full, placed, SOFT_LIFT * l.full.h);
    if (full !== null) {
      put(l.full, full);
      return { mode: 'full', lift: full, dx: 0 };
    }
    const compact = clearLift(l.compact, placed, SOFT_LIFT * l.compact.h);
    if (compact !== null) {
      put(l.compact, compact);
      return { mode: 'compact', lift: compact, dx: 0 };
    }
    if (!l.keep) return { mode: 'hidden', lift: 0, dx: 0 };
    const up = clearLift(l.compact, placed, MAX_LIFT * l.compact.h);
    if (up !== null) {
      put(l.compact, up);
      return { mode: 'compact', lift: up, dx: 0 };
    }
    const side = sideStep(l.compact, placed);
    if (side) {
      put(l.compact, side.lift, side.dx);
      return { mode: 'compact', lift: side.lift, dx: side.dx };
    }
    const lift = Math.min(clearLift(l.compact, placed, Infinity) ?? 0, MAX_LIFT * l.compact.h);
    put(l.compact, lift);
    return { mode: 'compact', lift, dx: 0 };
  });
}

/** Pixels kept between a callout and the side of the view (or the rail). */
const EDGE = 8;

/**
 * How far (pixels, positive to the right) `b` slides so it sits between `left` and `right`: none when
 * it fits already; held to the left edge when it's wider than the room.
 */
export function nudge(b: LabelBox, left: number, right: number): number {
  if (b.x < left + EDGE) return left + EDGE - b.x;
  if (b.x + b.w > right - EDGE) return Math.max(left + EDGE - b.x, right - EDGE - (b.x + b.w));
  return 0;
}

/** How close (m) you are to a unit for its own callout to keep its place over its card on the board. */
const AT_UNIT = 4;

/** How wide the compass's marks down the left edge of the view are, with a gap (px, ui/compass.ts). */
const COMPASS_W = 96;

/** How often the piles of callouts are found again (ms): ten times a second. */
const PILE_EVERY = 100;

export function installDeclutter(ctx: Ctx, parts: Pick<Parts, 'views' | 'worlds' | 'overview' | 'stage' | 'boardFaces' | 'waiting' | 'tv' | 'selection'>) {
  // The chips piles of callouts fold into ("3 working"), over the view.
  const layer = document.createElement('div');
  layer.className = 'label-chips';
  document.body.append(layer);
  const chips: HTMLElement[] = [];
  /** The callouts in each pile, as last found. */
  let pileSets: Set<unknown>[] = [];
  let pilesAt = -Infinity;
  let wasOverBoard = false;
  const bottom = new THREE.Vector3();
  const top = new THREE.Vector3();
  const at = new THREE.Vector3();
  const up = new THREE.Vector3();
  const rise = new THREE.Vector3();
  /** Where the view starts, past the Units rail when it's open (measured now and then: it folds). */
  let left = 0;
  let measured = -Infinity;
  // After the units have moved and sized their callouts ('others'), before the frame is drawn.
  const slot = new THREE.Vector3();
  /** The last frame's placing, for the shots and the console (window.__world.declutter). */
  let last: { sign: string; label: Label; placed: Placed }[] = [];
  debugHandle('declutter', { last: () => last });
  ctx.ticks.add('hud', ({ now, dt }) => {
    const camera = parts.stage.view ?? ctx.camera;
    if (now - measured > 1000) {
      measured = now;
      const rail = document.querySelector('.rail')?.getBoundingClientRect();
      left = rail && rail.width > 0 && rail.top < window.innerHeight / 2 ? rail.right : 0;
    }
    // Where it is this frame, whatever moved it since the last frame was drawn.
    camera.updateMatrixWorld();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const shown: { model: Worker; label: Label; rank: number; d: number; pxPerM: number; anchorX: number; depth: number }[] = [];
    // Callouts face the camera: their height runs along its up, which the frame drawn last left in its matrix.
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    /** A callout's box on screen from its edges in the world, or null when it's off the screen. */
    const box = (aspect: number): LabelBox | null => {
      bottom.project(camera);
      top.project(camera);
      if (bottom.z > 1 || bottom.z < -1 || Math.abs(bottom.x) > 1.2 || Math.abs(bottom.y) > 1.2) return null;
      const h = Math.max(1, Math.hypot(((top.x - bottom.x) / 2) * W, ((top.y - bottom.y) / 2) * H));
      const w = h * aspect;
      const cx = ((bottom.x + 1) / 2) * W;
      return { x: cx - w / 2, bottom: ((1 - bottom.y) / 2) * H, w, h };
    };
    // The floor's units, and the board agents waiting at their kiosks (core/stations.ts).
    const entries: { id: string | null; model: Worker; near: boolean }[] = [];
    // Near: you're right at it (within AT_UNIT), where its own callout says more than its card.
    for (const [id, v] of parts.views.workerViews) entries.push({ id, model: v.model, near: camera.position.distanceTo(v.model.where(at)) < AT_UNIT });
    for (const a of parts.worlds.idleAgents()) if (a.view.vacancy.visible) entries.push({ id: null, model: a.model, near: false });
    // One label a unit (labels.ts): its mark at the edge, else its card on the Attention board, else its callout.
    const overview = parts.overview.active();
    Worker.marks = !overview;
    // The crosshair steps back to a small dot over a board's face, so it never sits on a word.
    const overBoard = !!parts.boardFaces?.aimed();
    if (overBoard !== wasOverBoard) {
      wasOverBoard = overBoard;
      document.getElementById('crosshair')?.classList.toggle('over-board', overBoard);
    }
    const hero = parts.boardFaces?.faces().find((f) => f.id === 'tv')?.px;
    const heroPx = hero && !overview ? hero.bottom - hero.top : 0;
    const pointed = parts.waiting.pointed();
    // The selected unit's callout always shows, placed first, so it's never folded, shrunk or covered.
    const selected = parts.selection?.id();
    const selectedModel = selected ? parts.views.workerViews.get(selected)?.model : undefined;
    for (const { id, model: m, near } of entries) {
      // The compass is put away in the Overview (core/camera-overview.css): its marks never stand in for a callout there.
      if (id && labelSource({ pointed: !overview && pointed.has(id), hasRow: parts.tv.hasCard(id), heroPx, near }) !== 'world') {
        m.setLift(0);
        m.setMode('hidden');
        m.setNudge(0);
        m.dock(null, 1, dt);
        continue;
      }
      if (!m.calloutEdges(bottom, top, up)) {
        m.setLift(0);
        m.setMode('full');
        m.setNudge(0);
        m.dock(null, 1, dt);
        continue;
      }
      const d = camera.position.distanceTo(m.where(at));
      // A callout is lifted straight up in the world, which the camera may see shortened: how many
      // pixels a meter of that is here, to turn a lift on screen back into meters.
      rise.copy(bottom).y += 1;
      rise.project(camera);
      const anchor = bottom.clone().project(camera);
      const pxPerM = Math.max(1, Math.hypot(((rise.x - anchor.x) / 2) * W, ((rise.y - anchor.y) / 2) * H));
      const full = box(m.calloutAspect());
      m.calloutEdges(bottom, top, up, true);
      const compact = box(m.calloutAspect(true));
      // Behind the camera, or off the screen: out of the placing, shown as it is.
      if (!full || !compact) {
        m.setLift(0);
        m.setMode('full');
        m.setNudge(0);
        m.dock(null, 1, dt);
        continue;
      }
      const mine = m === selectedModel;
      shown.push({ model: m, label: { full, compact, keep: m.rank < 2 || mine, wasFull: m.calloutMode === 'full' }, rank: mine ? -1 : m.rank, d, pxPerM, anchorX: ((anchor.x + 1) / 2) * W, depth: anchor.z });
    }
    // Three or more callouts piled on one another fold into one chip that counts them (found ten times a second).
    if (now - pilesAt > PILE_EVERY) {
      pilesAt = now;
      // As each will stand once slid in clear of the view's sides and the rail.
      // Only units at work or parked fold: one that needs you, is stuck or waits for review, and the
      // selected one, always keep their own callout (declutter() lifts or shrinks it instead).
      const foldable = shown.filter((s) => s.rank >= 2);
      const at = foldable.map((s) => ({ ...s.label.full, x: s.label.full.x + nudge(s.label.full, left, W) }));
      pileSets = piles(at).map((g) => new Set<unknown>(g.map((i) => foldable[i].model)));
    }
    const live = pileSets.map((set) => shown.filter((s) => set.has(s.model))).filter((g) => g.length >= 2);
    live.forEach((group, i) => {
      const el = (chips[i] ??= layer.appendChild(document.createElement('div')));
      const x0 = Math.min(...group.map((g) => g.label.full.x));
      const x1 = Math.max(...group.map((g) => g.label.full.x + g.label.full.w));
      const b = Math.min(...group.map((g) => g.label.full.bottom));
      const word = pileWord(group.map((g) => g.model.showing), group.map((g) => g.model.callSign));
      el.hidden = false;
      if (el.textContent !== word) {
        el.textContent = word;
        el.dataset.w = String(el.offsetWidth);
      }
      // Clear of the view's sides and the rail, as a callout slides in.
      const half = Number(el.dataset.w ?? 0) / 2;
      // Clear of the compass's marks down the left edge (their dial and name): a pile that would sit on
      // them shows no chip (its units are off to that side, where the compass already points).
      const cx = Math.min(W - half - 8, (x0 + x1) / 2);
      el.hidden = cx < left + COMPASS_W + half;
      el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(b)}px) translate(-50%, -100%)`;
      for (const g of group) {
        g.model.setMode('hidden');
        g.model.setLift(0);
        g.model.setNudge(0);
        g.model.dock(null, 1, dt);
      }
    });
    for (let i = live.length; i < chips.length; i++) chips[i].hidden = true;
    const inPile = new Set(live.flat());
    const free = shown.filter((s) => !inPile.has(s));
    shown.length = 0;
    shown.push(...free);
    shown.sort((a, b) => a.rank - b.rank || a.d - b.d);
    const placed = declutter(shown.map((s) => s.label));
    last = shown.map((s, i) => ({ sign: s.model.callSign, label: s.label, placed: placed[i] }));
    const slid = shown.map((s, i) => {
      const { mode, lift, dx } = placed[i];
      s.model.setMode(mode);
      s.model.setLift(lift / s.pxPerM);
      const at = mode === 'compact' ? s.label.compact : s.label.full;
      const b = { ...at, x: at.x + dx };
      // Only a callout whose unit is in view slides in: one whose unit is off the side, or under the
      // rail, stays over it (the compass points the way).
      const anchor = at.x + at.w / 2;
      const by = dx + (mode === 'hidden' || anchor < left || anchor > W ? 0 : nudge(b, left, W));
      return { x: at.x + by, bottom: b.bottom - lift, w: b.w, h: b.h, anchor: s.anchorX, keep: s.label.keep, hidden: mode === 'hidden', by };
    });
    // Off the wall boards: docked under a bezel at the unit's own depth, so it's the size it was, or faded.
    const boards = parts.boardFaces?.faces().flatMap((f) => (f.px ? [f.px] : [])) ?? [];
    dock(slid, boards, H).forEach((k, i) => {
      const s = shown[i];
      const c = slid[i];
      if (k.kind === 'dock') {
        s.model.setNudge(0);
        s.model.dock(slot.set(((k.x + c.w / 2) / W) * 2 - 1, 1 - (k.bottom / H) * 2, s.depth).unproject(camera), 1, dt);
        return;
      }
      s.model.setNudge(c.by / c.w);
      // Never left on a board's face: one that found no slot under it stands down (its mark and its card
      // say it), unless it needs someone, which always shows: over the board, at full strength.
      if (standsDown(c, boards)) s.model.setMode('hidden');
      s.model.dock(null, k.kind === 'fade' ? FADED : 1, dt);
    });
  });
}
