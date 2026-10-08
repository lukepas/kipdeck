// What a moment is, and the helpers moments share. The registry is in index.ts.
import type { Kit, Face, Pt } from '../kit';
import type { Host } from '../hosts';
import type { Spot } from '../perch';
import type { Timeline } from '../tween';
import type { PoseName } from '../poses';

export interface Run {
  kit: Kit;
  host: Host;
  sec: HTMLElement;
  /** Where he stands, in host px. */
  spot: Spot;
  lite: boolean;
  /** Which way the visitor was scrolling when he came (1 down, -1 up). */
  dir: number;
  /** Plays a gesture as his current action (what clicks and the nap wait on). An ambient one (a
   *  glance, a look round) gives way when the visitor clicks him; a scripted beat does not. */
  play(tl: Timeline, o?: { ambient?: boolean }): Timeline;
  busy(): boolean;
  later(ms: number, fn: () => void): void;
  /** Calls `fn(on)` when `cls` is added to or removed from `el` (and once now, if `now`). */
  watch(el: Element | null, cls: string, fn: (on: boolean) => void, now?: boolean): void;
  /** Calls `fn` on every attribute change of `el` (a class removed and added again counts). */
  mutations(el: Element | null, fn: () => void): void;
  listen(target: EventTarget | null, ev: string, fn: (e: Event) => void): void;
  /** Runs `fn` when the moment hands Kip over. */
  cleanup(fn: () => void): void;
  /** The page's wait: `fn(since)` when an agent asks (a number) or the visitor answers (null). */
  onWait(fn: (since: number | null) => void): void;
  /** A point of an element in host px (fx, fy are fractions of its box). */
  pt(el: Element | null, fx?: number, fy?: number): Pt | null;
  /** Measures his spot again (when what he stands on may have moved since he came); false if none is clear now. */
  respot(): boolean;
  /** Sets a state at once (no motion): stops what he does, puts him back on his spot, runs `fn`. */
  home(fn?: () => void): void;
  /** Progress beats for pinned moments: forward plays `on`, going back sets the earlier beat's home. */
  beats(list: Beat[], base: () => void): (p: number) => void;
  /** Whether the moment is still on (false once it was handed over). */
  live(): boolean;
}

export interface Beat {
  at: number;
  on: () => Timeline | void;
  /** The state once this beat has played (set at once when scrolling back to it, or arriving past it). */
  home: () => void;
}

export interface Moment {
  /** Pinned sections: drawn in the sticky stage, driven by scroll progress, only while it pins. */
  pinned?: boolean;
  /** Candidate spots in viewport px, preferred first. */
  spots(sec: HTMLElement): Spot[];
  /** What the clearance check leaves out (a selector), e.g. a layer that is hidden while he is there. */
  ignore?: string;
  /** How he arrives: rise from behind the edge, zip in, or not at all (the moment brings him in). */
  arrive?: 'rise' | 'zip' | 'none';
  start(run: Run): void;
  /** Called with the scroll progress whenever it changes (smoothed, as the scenes smooth it). */
  progress?(run: Run, p: number): void;
  /** That progress (default: a pinned track's, as engine/drive.ts computes it). */
  p?(sec: HTMLElement): number;
  /** With less motion, a still pose on the first clear spot (only a few moments have one). */
  still?: { pose: PoseName; face?: Face; flag?: boolean };
  /** Whether he may stay (or come) now, beyond his spot being on screen (default yes). */
  keep?(sec: HTMLElement): boolean;
  /** Whether a click may play a trick now (default yes). */
  idle?: boolean;
  /** For a pinned moment: what he does where the section does not pin (a phone, a short window),
   *  as a moment of its own in the page's layer. */
  phone?: Moment;
}

/** The progress of a pinned section's track, as engine/drive.ts computes it. */
export function trackProgress(sec: HTMLElement): number {
  const track = sec.querySelector<HTMLElement>('.track');
  if (!track) return 0;
  const r = track.getBoundingClientRect();
  return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
}

/** Feet on the top edge of an element, `dx` from its right (negative) or left (positive) end. */
export function onTop(el: Element | null, dx: number, s = 1, face: Face = 'front', dy = 0): Spot | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: dx < 0 ? r.right + dx : r.left + dx, y: r.top + dy, s, face, floor: [r.left, r.right] };
}

const memo = new WeakMap<Run, Map<string, unknown>>();
/** A measure made once per run (`fn` reads layout): in a pinned stage what he looks at stays put
 *  while the stage pins, and a new run (a pin change, a resize) measures again. Progress calls then
 *  only write, never read layout after a write in the same frame. */
export function once<T>(run: Run, key: string, fn: () => T): T {
  let m = memo.get(run);
  if (!m) memo.set(run, (m = new Map()));
  if (!m.has(key)) m.set(key, fn());
  return m.get(key) as T;
}

export const spots = (...s: (Spot | null)[]) => s.filter((x): x is Spot => !!x);