// Kip's own small timeline engine: the part of GSAP the deck's Kip uses, and nothing more. Timelines
// hold tweens, callbacks and other timelines at positions in seconds; tweens move numbers on a target
// (an SVG part, an HTML element or a plain object) and the engine writes each changed target once per
// frame, in the page's shared loop (engine/loop.ts). SVG parts get a `transform` attribute composed
// around their pivot (GSAP's svgOrigin), HTML elements a CSS transform; only transform and opacity
// (and visibility for autoAlpha) ever change. The engine's task sleeps when nothing moves.
import { every } from '../engine/loop';
import { parseEase, resolve, cycleT, totalOf, svgTransform, cssTransform, r3, type Ease, type Num, type Tf } from './math';

export type Vars = Record<string, unknown>;
export type Targets = Element | object | null | undefined | ArrayLike<Element | object | null | undefined>;
export { parseEase };

// ---------- targets ----------

type Kind = 'svg' | 'html' | 'obj';
interface Box {
  el: object;
  kind: Kind;
  v: Record<string, number>;
  origin: [number, number];
  base: string;
  aa: boolean;
  tf: boolean;
}

const DEF: Record<string, number> = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewY: 0, opacity: 1 };
const TF = new Set(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewY']);
const boxes = new WeakMap<object, Box>();
const dirty = new Set<Box>();

function boxOf(el: object): Box {
  let b = boxes.get(el);
  if (b) return b;
  const svg = typeof SVGElement !== 'undefined' && el instanceof SVGElement;
  const html = !svg && typeof HTMLElement !== 'undefined' && el instanceof HTMLElement;
  const kind: Kind = svg ? 'svg' : html ? 'html' : 'obj';
  const v: Record<string, number> = {};
  if (svg) {
    const o = (el as SVGElement).getAttribute('opacity');
    if (o !== null) v.opacity = Number(o);
  }
  b = { el, kind, v, origin: [0, 0], base: svg ? (el as SVGElement).getAttribute('transform') ?? '' : '', aa: false, tf: false };
  boxes.set(el, b);
  return b;
}

function list(t: Targets): object[] {
  if (!t) return [];
  if (typeof (t as ArrayLike<unknown>).length === 'number' && !(t instanceof Element)) return Array.from(t as ArrayLike<object>).filter(Boolean) as object[];
  return [t as object];
}

/** Writes one target's values to the page. */
function render(b: Box) {
  const v = b.v;
  if (b.kind === 'obj') {
    Object.assign(b.el, v);
    return;
  }
  const el = b.el as HTMLElement | SVGElement;
  const tf = () => ({ ...DEF, ...v }) as unknown as Tf;
  if (b.kind === 'svg') {
    if (b.tf) el.setAttribute('transform', svgTransform(b.base, b.origin, tf()));
    if ('opacity' in v) el.setAttribute('opacity', String(r3(v.opacity)));
    if (b.aa) el.setAttribute('visibility', v.opacity <= 0.001 ? 'hidden' : 'visible');
    return;
  }
  const st = (el as HTMLElement).style;
  if (b.tf) st.transform = cssTransform(tf());
  if ('opacity' in v) st.opacity = String(r3(v.opacity));
  if (b.aa) st.visibility = v.opacity <= 0.001 ? 'hidden' : 'inherit';
}

/** Draw changes at once instead of on the next frame (used where nothing may tick, with less motion). */
export const engine = { sync: false, ticks: 0 };

function touch(b: Box) {
  if (engine.sync) render(b);
  else {
    dirty.add(b);
    wake();
  }
}

function put(b: Box, key: string, val: number) {
  if (key === 'scale') {
    put(b, 'scaleX', val);
    put(b, 'scaleY', val);
    return;
  }
  if (key === 'autoAlpha') {
    b.aa = true;
    key = 'opacity';
  }
  if (TF.has(key)) b.tf = true;
  b.v[key] = val;
}

function read(b: Box, key: string): number {
  if (key === 'scale') key = 'scaleX';
  if (key === 'autoAlpha') key = 'opacity';
  return key in b.v ? b.v[key] : DEF[key] ?? 0;
}

function origin(b: Box, s: unknown) {
  if (typeof s !== 'string') return;
  const [x, y] = s.split(/\s+/).map(Number);
  b.origin = [x || 0, y || 0];
  b.tf = true;
}

const SPECIAL = new Set(['duration', 'ease', 'yoyo', 'repeat', 'repeatDelay', 'onComplete', 'onUpdate', 'immediateRender', 'svgOrigin', 'transformOrigin', 'delay']);

/** Sets values now. */
export function set(targets: Targets, vars: Vars) {
  list(targets).forEach((el, i) => {
    const b = boxOf(el);
    origin(b, vars.svgOrigin);
    for (const k in vars) {
      if (SPECIAL.has(k)) continue;
      put(b, k, resolve(vars[k] as Num, read(b, k), i));
    }
    touch(b);
  });
}

/** A value now (what the next frame will draw). */
export function getProperty(el: object | null | undefined, key: string): number {
  return el ? read(boxOf(el), key) : 0;
}

// ---------- tweens and timelines ----------

interface Child {
  start: number;
  total(): number;
  render(local: number, prev: number): void;
  dead: boolean;
}

const byTarget = new Map<object, Set<Tween>>();

class Tween implements Child {
  dead = false;
  private props: { key: string; from: number; to: number }[] | null = null;
  private dur: number;
  private ease: Ease;
  private rep: number;
  private repDelay: number;
  private yoyo: boolean;
  constructor(
    public start: number,
    private el: object,
    private index: number,
    private vars: Vars,
    private fromVars: Vars | null,
  ) {
    this.dur = Math.max(0, Number(vars.duration ?? 0.5));
    this.ease = parseEase(vars.ease as string | Ease | undefined);
    this.rep = Number(vars.repeat ?? 0);
    this.repDelay = Number(vars.repeatDelay ?? 0);
    this.yoyo = !!vars.yoyo;
    let s = byTarget.get(el);
    if (!s) byTarget.set(el, (s = new Set()));
    s.add(this);
  }
  total() {
    return totalOf(this.dur, this.rep, this.repDelay);
  }
  private init() {
    const b = boxOf(this.el);
    origin(b, this.vars.svgOrigin ?? this.fromVars?.svgOrigin);
    this.props = [];
    for (const k in this.vars) {
      if (SPECIAL.has(k)) continue;
      const from = this.fromVars && k in this.fromVars ? resolve(this.fromVars[k] as Num, read(b, k), this.index) : read(b, k);
      this.props.push({ key: k, from, to: resolve(this.vars[k] as Num, from, this.index) });
    }
  }
  render(local: number) {
    if (this.dead) return;
    if (!this.props) this.init();
    const t = cycleT(local, this.dur, this.rep, this.repDelay, this.yoyo);
    const e = t === 0 || t === 1 ? t : this.ease(t);
    const b = boxOf(this.el);
    for (const p of this.props!) put(b, p.key, p.from + (p.to - p.from) * e);
    touch(b);
    (this.vars.onUpdate as (() => void) | undefined)?.();
    if (local >= this.total()) {
      byTarget.get(this.el)?.delete(this);
      (this.vars.onComplete as (() => void) | undefined)?.();
    }
  }
  kill() {
    this.dead = true;
    byTarget.get(this.el)?.delete(this);
  }
}

class Call implements Child {
  dead = false;
  constructor(public start: number, private fn: () => void) {}
  total() {
    return 0;
  }
  render() {
    if (!this.dead) this.fn();
  }
}

type Pos = number | string | undefined;
const roots = new Set<Timeline>();

export class Timeline implements Child {
  start = 0;
  dead = false;
  private kids: { c: Child; last: number }[] = [];
  private dur = 0;
  private lastStart = 0;
  private lastEnd = 0;
  private time = 0;
  private ts = 1;
  private done = false;
  private rep: number;
  private repDelay: number;
  constructor(opts: { repeat?: number; repeatDelay?: number } = {}) {
    this.rep = opts.repeat ?? 0;
    this.repDelay = opts.repeatDelay ?? 0;
    roots.add(this);
    wake();
  }
  private at(pos: Pos): number {
    if (pos === undefined) return this.dur;
    if (typeof pos === 'number') return pos;
    const m = /^([<>]|[+-]=)?(-?[\d.]+)?$/.exec(pos.replace(/\s/g, ''));
    if (!m) return this.dur;
    const n = Number(m[2] ?? 0);
    if (m[1] === '>') return this.lastEnd + n;
    if (m[1] === '<') return this.lastStart + n;
    if (m[1] === '+=') return this.dur + n;
    if (m[1] === '-=') return this.dur - n;
    return n;
  }
  private push(c: Child) {
    this.kids.push({ c, last: -1 });
    this.lastStart = c.start;
    this.lastEnd = c.start + c.total();
    this.dur = Math.max(this.dur, this.lastEnd);
    return this;
  }
  to(targets: Targets, vars: Vars, pos?: Pos) {
    const at = this.at(pos);
    list(targets).forEach((el, i) => this.push(new Tween(at, el, i, vars, null)));
    if (!list(targets).length) this.dur = Math.max(this.dur, at);
    return this;
  }
  fromTo(targets: Targets, from: Vars, vars: Vars, pos?: Pos) {
    const at = this.at(pos);
    list(targets).forEach((el, i) => this.push(new Tween(at, el, i, vars, from)));
    if (vars.immediateRender === true) set(targets, from);
    return this;
  }
  set(targets: Targets, vars: Vars, pos?: Pos) {
    return this.to(targets, { ...vars, duration: 0 }, pos);
  }
  call(fn: () => void, _params?: unknown, pos?: Pos) {
    return this.push(new Call(this.at(pos), fn));
  }
  add(child: Timeline, pos?: Pos) {
    roots.delete(child);
    child.start = this.at(pos);
    return this.push(child);
  }
  duration() {
    return this.dur;
  }
  total() {
    return this.dur * (this.rep + 1) + this.repDelay * this.rep;
  }
  timeScale(n: number) {
    this.ts = n;
    return this;
  }
  /** Renders the timeline at `local` seconds (forward only, except a repeat wrapping round). */
  render(local: number, prev = -1) {
    if (this.dead) return;
    const cycle = this.dur + this.repDelay;
    let t = local;
    if (this.rep) {
      const n = Math.min(this.rep, Math.floor(local / Math.max(1e-6, cycle)));
      const pn = prev < 0 ? 0 : Math.min(this.rep, Math.floor(prev / Math.max(1e-6, cycle)));
      t = local >= this.total() ? this.dur : Math.min(this.dur, local - n * cycle);
      if (n !== pn) for (const k of this.kids) k.last = -1;
    }
    for (const k of this.kids) {
      if (this.dead) return;
      if (k.c.dead || t < k.c.start) continue;
      const kl = Math.min(t - k.c.start, k.c.total());
      if (kl === k.last) continue;
      const was = k.last;
      k.last = kl;
      k.c.render(kl, was);
    }
  }
  /** Jumps to the end (every callback on the way fires). */
  progress(p: number) {
    if (p >= 1) {
      this.render(this.total());
      this.time = this.total();
      this.done = true;
      roots.delete(this);
    }
    return this;
  }
  tick(dt: number) {
    if (this.dead || this.done) return;
    const prev = this.time;
    this.time = Math.min(this.total(), this.time + dt * this.ts);
    this.render(this.time, prev);
    if (this.time >= this.total()) {
      this.done = true;
      roots.delete(this);
    }
  }
  isActive() {
    return !this.dead && !this.done && roots.has(this);
  }
  kill() {
    this.dead = true;
    roots.delete(this);
    for (const k of this.kids) if (k.c instanceof Tween || k.c instanceof Timeline) k.c.kill();
  }
}

export function timeline(opts?: { repeat?: number; repeatDelay?: number }) {
  return new Timeline(opts);
}
export function to(targets: Targets, vars: Vars) {
  return timeline().to(targets, vars, 0);
}
export function fromTo(targets: Targets, from: Vars, vars: Vars) {
  return timeline().fromTo(targets, from, vars, 0);
}
export function delayedCall(s: number, fn: () => void) {
  return timeline().call(fn, null, s);
}
/** Stops every running tween on these targets. */
export function killTweensOf(targets: Targets) {
  for (const el of list(targets)) {
    const s = byTarget.get(el);
    if (!s) continue;
    for (const tw of s) tw.kill();
    byTarget.delete(el);
  }
}
/** A follower: each call eases `key` from where it is to the new value. */
export function quickTo(target: object, key: string, opts: { duration: number; ease?: string }) {
  let last: Timeline | null = null;
  return (v: number) => {
    last?.kill();
    last = to(target, { [key]: v, duration: opts.duration, ease: opts.ease ?? 'power3' });
  };
}

// ---------- the frame task ----------

let stop: (() => void) | null = null;
function wake() {
  if (stop || engine.sync) return;
  stop = every({
    write(dt) {
      engine.ticks++;
      for (const tl of [...roots]) tl.tick(dt);
      for (const b of dirty) render(b);
      dirty.clear();
      if (!roots.size) {
        stop?.();
        stop = null;
      }
    },
  });
}

/** Whether anything is moving (for tests and the director's sleep). */
export function active(): number {
  return roots.size;
}
