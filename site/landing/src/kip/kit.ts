// One Kip: his element, his parts and the deck's instant setters (kip.js createKit), with positions in
// host pixels (feet as the anchor) instead of the deck's 1920 stage. The gestures are in moves.ts.
import { bodySVG, pictSVG, GLOWS } from './draw';
import { NEUTRAL, POSES, ORIGINS, mix, sprigFor, glowOn, type Pose, type PoseName, type Sprig } from './poses';
import { set, to, timeline, getProperty, killTweensOf, quickTo, type Timeline, type Vars } from './tween';
import { motes, ringAt, zap } from './fx';
import { addMoves, type Moves } from './moves';

export const W = 74, H = 96;
export type Face = 'l' | 'r' | 'front';
export interface Pt { x: number; y: number }
/** Where a kit draws: its layer, and how viewport points map into it. */
export interface Place {
  layer: HTMLElement;
  toLocal(cx: number, cy: number): Pt;
  width(): number;
  /** No motes (the light tier). */
  lite?: boolean;
}
export interface KitOptions { scarf?: string; vars?: Record<string, string>; scale?: number }

const PARTS = ['root', 'head', 'look', 'face', 'pupils', 'pupilL', 'pupilR', 'lidL', 'lidR', 'lowL', 'lowR', 'earL', 'earR', 'tipL', 'tipR', 'tuft', 'armL', 'armR', 'legL', 'legR',
  'torso', 'scarf', 'scarfTails', 'tail', 'sprig', 'glow', 'leaf', 'trail', 'mouth', 'mouthO', 'heart', 'bang', 'z1', 'z2', 'z3', 'talk', 'speed', 'dust',
  'pennant', 'pen', 'inL'] as const;
export type Part = (typeof PARTS)[number];
const SEL: Record<string, string> = { scarfTails: 'scarf-tails' };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
let uid = 0;

export type Core = ReturnType<typeof createCore>;
export type Kit = Core & Moves;

export function createKit(opts: KitOptions = {}): Kit {
  return addMoves(createCore(opts));
}

function createCore(opts: KitOptions) {
  const id = ++uid, S = opts.scale ?? 1, w = W * S, h = H * S, k = h / 130;
  const el = document.createElement('div');
  el.className = 'kip';
  el.setAttribute('aria-hidden', 'true');
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  if (opts.vars) for (const v in opts.vars) el.style.setProperty(v, opts.vars[v]);
  el.innerHTML = `<div class="k-flip"><div class="k-bob">${bodySVG(id, opts.scarf)}</div></div>${pictSVG()}`;
  const flip = el.querySelector<HTMLElement>('.k-flip')!;
  const P = {} as Record<Part, SVGGElement>;
  for (const n of PARTS) P[n] = el.querySelector<SVGGElement>(`.k-${SEL[n] ?? n}`)!;
  const G: Record<string, SVGElement[]> = {};
  for (const g of GLOWS) G[g] = [...el.querySelectorAll<SVGElement>(`.k-g-${g}`)];
  const lids = [P.lidL, P.lidR], lows = [P.lowL, P.lowR];
  let place: Place | null = null;
  let zs = 1;
  let away = true;
  el.classList.add('away');
  const timers = new Set<number>();
  let lifeOn = false;
  let halo: Timeline | null = null;
  let zloop: Timeline | null = null;
  let qLook: ((v: number) => void) | null = null, qPx: ((v: number) => void) | null = null, qPy: ((v: number) => void) | null = null;

  const kit = {
    el, flip, P, G, lids, lows, w, h, k, scale: S,
    st: { x: -200, y: 0, face: 'front' as Face, sprig: 'green' as Sprig, size: 1 },
    /** Out of sight. The flag also pauses his idle bob (.kip.away), so a hidden Kip costs no style work. */
    get away() { return away; },
    set away(v: boolean) {
      if (v === away) return;
      away = v;
      el.classList.toggle('away', v);
    },
    static: false, lookHold: false, asleep: false,
    /** +1 or -1 while a zip runs him out that way and in from the other side. */
    travel: 0,
    /** Room above his head for hops, in host px (the clearance check sets it). */
    headroom: 40,
    get place() { return place; },
    fin(tl: Timeline) {
      if (kit.static) {
        tl.progress(1);
        tl.kill();
      }
      return tl;
    },
    flipSign: () => (kit.st.face === 'l' ? -1 : 1),
    curS: () => Math.abs(getProperty(flip, 'scaleY')) || 1,
    get zs() { return zs; },
    /** Room above his head, so hops never lift him into the text above. */
    lift: (hgt: number) => Math.max(0, Math.min(hgt, kit.headroom)),

    // --- instant setters ---
    at(x: number, y: number, face?: Face) {
      kit.st.x = x;
      kit.st.y = y;
      set(el, { x: x - w / 2, y: y - h, scale: 1, autoAlpha: 1 });
      kit.away = x < -w || x > (place?.width() ?? innerWidth) + w;
      if (face) kit.face(face);
      return kit;
    },
    /** Draws him at (x, y) without touching his bookkeeping (for a timeline's deferred steps). */
    put(x: number, y: number, face?: Face) {
      set(el, { x: x - w / 2, y: y - h, scale: 1, autoAlpha: 1 });
      if (face) kit.face(face);
    },
    /** Moves him along without touching anything else (the scroll-coupled run). */
    moveX(x: number) {
      kit.st.x = x;
      set(el, { x: x - w / 2 });
    },
    face(f: Face) {
      kit.st.face = f;
      const sz = kit.curS();
      set(flip, { scaleX: (f === 'l' ? -1 : 1) * sz, scaleY: sz });
      set(P.face, { x: f === 'front' ? 0 : 6 });
      return kit;
    },
    faceIn(tl: Timeline, f: Face, at: number) {
      tl.call(() => kit.face(f), null, at);
      kit.st.face = f;
    },
    /** A pose's wand angle is pushed off his face for the pose's arm angle. */
    posed(name: PoseName): Pose {
      const p = mix(NEUTRAL, POSES[name] ?? {});
      p.sprig.rotation = sprigFor(p.armR.rotation, p.sprig.rotation);
      return p;
    },
    /** Every move of the wand arm goes through here, so the rod turns with it and never crosses his face. */
    armTween(tl: Timeline, rot: number, v: Vars, at: number, base = 0) {
      tl.to(P.armR, { ...v, rotation: rot }, at);
      tl.to(P.sprig, { ...v, rotation: sprigFor(rot, base) }, at);
      return tl;
    },
    armTo(rot: number, v?: Vars) {
      return kit.fin(kit.armTween(timeline(), rot, v ?? { duration: 0.15 }, 0));
    },
    pose(name: PoseName) {
      const p = kit.posed(name);
      for (const n in p) if (P[n as Part]) set(P[n as Part], p[n]);
      el.classList.toggle('asleep', name === 'sleep');
      return kit;
    },
    poseIn(tl: Timeline, name: PoseName, at: number, dur = 0.2) {
      const p = kit.posed(name);
      for (const n in p) if (P[n as Part]) tl.to(P[n as Part], { duration: dur, ease: 'power2.out', ...p[n] }, at);
      return tl;
    },
    poseTo(name: PoseName, dur?: number) {
      return kit.fin(kit.poseIn(timeline(), name, 0, dur));
    },
    sprig(c: Sprig) {
      kit.st.sprig = c;
      for (const g of GLOWS) set(G[g], { opacity: glowOn(c, g) });
      set(P.sprig, { autoAlpha: c === 'off' ? 0 : 1 });
      return kit;
    },
    sprigIn(tl: Timeline, c: Sprig, at: number, dur = 0.25) {
      for (const g of GLOWS) tl.to(G[g], { opacity: glowOn(c, g), duration: dur }, at);
      tl.to(P.sprig, { autoAlpha: c === 'off' ? 0 : 1, duration: dur }, at);
      kit.st.sprig = c;
    },
    sprigTo(c: Sprig, dur?: number) {
      const tl = timeline();
      kit.sprigIn(tl, c, 0, dur);
      return kit.fin(tl);
    },

    // --- where things are, in host px ---
    now() {
      return { x: getProperty(el, 'x') + w / 2, y: getProperty(el, 'y') + h, face: kit.st.face };
    },
    sync() {
      const n = kit.now();
      kit.st.x = n.x;
      kit.st.y = n.y;
      return kit;
    },
    local(lx: number, ly: number, st?: { x: number; y: number; face: Face }) {
      st = st ?? kit.now();
      if (st.face === 'l') lx = 100 - lx;
      const sz = kit.curS();
      return { x: st.x + (lx * k - w / 2) * sz, y: st.y + (ly * k - h) * sz + (getProperty(flip, 'y') || 0) };
    },
    setSize(sz: number) {
      zs = sz;
      kit.st.size = sz;
      set(flip, { scaleX: kit.flipSign() * sz, scaleY: sz });
      return kit;
    },
    sizeTo(sz: number, dur = 0.3, ease = 'power2.out') {
      zs = sz;
      kit.st.size = sz;
      const tl = timeline().to(flip, { scaleY: sz, scaleX: () => (getProperty(flip, 'scaleX') < 0 ? -1 : 1) * sz, duration: dur, ease }, 0);
      return kit.fin(tl);
    },
    tip: () => kit.local(79, 76.5),
    /** A point in the viewport, in this host's px. */
    toLocal(cx: number, cy: number): Pt {
      return place ? place.toLocal(cx, cy) : { x: cx, y: cy };
    },
    centerOf(target: Element | Pt): Pt {
      if (!(target instanceof Element)) return target;
      const b = target.getBoundingClientRect();
      return kit.toLocal(b.left + b.width / 2, b.top + b.height / 2);
    },
    /** His body and the wand's leaf on screen (viewport px), or null when he is not visible. */
    box(): { l: number; t: number; r: number; b: number } | null {
      if (!el.isConnected || getProperty(el, 'opacity') < 0.05) return null;
      let r: { l: number; t: number; r: number; b: number } | null = null;
      for (const p of [P.head, P.torso, P.legL, P.legR, P.armL, P.armR, P.tail, P.leaf, P.scarf]) {
        const b = p.getBoundingClientRect();
        if (!b.width) continue;
        if (!r) r = { l: b.left, t: b.top, r: b.right, b: b.bottom };
        else r = { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) };
      }
      if (!r) return null;
      if (el.style.clipPath && el.style.clipPath !== 'none') r.b = Math.min(r.b, el.getBoundingClientRect().bottom);
      return r.b > r.t ? r : null;
    },
    motes(x: number, y: number, color?: string, n?: number, spread?: number) {
      if (place && !place.lite && !kit.static) motes(place.layer, x, y, color, n, spread);
    },
    /** Motes from the wand's tip to a point (host px), landing `land` s from now. */
    zap(x: number, y: number, color = 'green', land = 0.45) {
      if (!place || place.lite || kit.static) return;
      const n = 7, gap = 0.03, dur = Math.max(0.15, land - gap * (n - 1));
      zap(place.layer, kit.tip(), { x, y }, color, n, dur, gap);
    },
    ringAt(x: number, y: number, color?: string) {
      if (place && !kit.static) ringAt(place.layer, x, y, color);
    },
    burst(color?: string, n?: number) {
      const p = kit.tip();
      kit.motes(p.x, p.y, color ?? 'multi', n ?? 10, 50);
      return kit;
    },
    ring(color?: string) {
      const p = kit.tip();
      kit.ringAt(p.x, p.y, color ?? 'green');
      return kit;
    },

    // --- sleep ---
    setZloop(z: Timeline | null) {
      zloop?.kill();
      zloop = z;
    },

    // --- life: blink, ear twitch, cursor follow ---
    later(s: number, fn: () => void) {
      const t = window.setTimeout(() => {
        timers.delete(t);
        fn();
      }, s * 1000);
      timers.add(t);
    },
    /** The wand's halo breathes twice, slowly, then rests (opacity only). */
    pulse() {
      halo?.kill();
      el.classList.toggle('bob2');
      if (!lifeOn) return kit;
      halo = timeline().fromTo(el.querySelectorAll('.k-halo'), { opacity: 1 }, { opacity: 0.8, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 0);
      return kit;
    },
    life(on: boolean) {
      if (on === lifeOn) return kit;
      lifeOn = on;
      if (on) {
        const blink = () => {
          if (!lifeOn) return;
          kit.later(2.5 + Math.random() * 3.5, blink);
          if (kit.away || document.hidden || getProperty(P.lidL, 'scaleY') > 0.5 || kit.asleep || getProperty(P.lowL, 'scaleY') > 0.3) return;
          to(lids, { scaleY: 1, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.inOut' });
        };
        const twitch = () => {
          if (!lifeOn) return;
          kit.later(6 + Math.random() * 2.5, twitch);
          if (kit.away || document.hidden || kit.asleep) return;
          to(Math.random() < 0.5 ? P.tipL : P.tipR, { rotation: `+=${Math.random() < 0.5 ? -16 : 16}`, duration: 0.08, yoyo: true, repeat: 1 });
        };
        kit.later(1 + Math.random() * 2, blink);
        kit.later(4 + Math.random() * 3, twitch);
        kit.pulse();
        qLook = quickTo(P.look, 'rotation', { duration: 0.4 });
        qPx = quickTo(P.pupils, 'x', { duration: 0.25 });
        qPy = quickTo(P.pupils, 'y', { duration: 0.25 });
      } else {
        for (const t of timers) clearTimeout(t);
        timers.clear();
        halo?.kill();
        halo = null;
      }
      return kit;
    },
    /** Eyes on a point (host px), smoothed. */
    follow(x: number, y: number) {
      if (!lifeOn || kit.lookHold || kit.asleep || kit.static || kit.away || !qLook) return;
      const dx = (x - kit.st.x) * kit.flipSign(), dy = y - (kit.st.y - h * zs * 0.6);
      qLook(clamp(dx / 400, -1, 1) * 6);
      qPx!(clamp(dx / 220, -1, 1) * 2.5);
      qPy!(clamp(dy / 220, -1, 1) * 2.5);
    },

    /** Drop everything scripted and stand still where he is. */
    stop() {
      killTweensOf([el, flip]);
      for (const n of PARTS) killTweensOf(P[n]);
      for (const g of GLOWS) killTweensOf(G[g]);
      kit.setZloop(null);
      set([P.z1, P.z2, P.z3, P.heart, P.bang, P.talk, P.speed, P.dust], { opacity: 0 });
      set(flip, { y: 0 });
      set(el, { scale: 1 });
      el.style.clipPath = '';
      set(P.head, { x: 0 });
      set(P.trail, { opacity: 0 });
      if (!kit.away) set(el, { autoAlpha: 1 });
      kit.asleep = false;
      el.classList.remove('asleep');
      kit.lookHold = false;
      kit.sync();
      kit.pose('stand');
      kit.face(kit.st.face);
      set(P.pupils, { x: 0, y: 0 });
      set(P.look, { rotation: 0, x: 0 });
      set(P.glow, { scale: 1 });
      set(P.root, { rotation: 0 });
      return kit;
    },
    /** Hide him at once, where he is. */
    hide() {
      set(el, { autoAlpha: 0 });
      kit.away = true;
      return kit;
    },
    /** Into a host's layer (he keeps his pose; his position is set by the caller). */
    mount(p: Place) {
      place = p;
      if (el.parentNode !== p.layer) p.layer.appendChild(el);
      for (const n in ORIGINS) if (P[n as Part]) set(P[n as Part], { svgOrigin: ORIGINS[n] });
      return kit;
    },
    remove() {
      kit.life(false);
      kit.stop();
      el.remove();
    },
  };
  // His first pose, before anything draws him.
  for (const n in ORIGINS) if (P[n as Part]) set(P[n as Part], { svgOrigin: ORIGINS[n] });
  kit.pose('stand');
  kit.sprig('green');
  set(el, { autoAlpha: 0 });
  return kit;
}
