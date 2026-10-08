// Drives a scene with one number, its progress from 0 to 1. Every scene is a pure function of that
// number (plus a few one-shot moments when it crosses a mark), so scrolling back plays it backwards.
//
// - pin: the track is tall and its stage is sticky (CSS decides, by PIN_MEDIA). Progress is how far
//   the track has scrolled past the stage, smoothed a little so a mouse wheel's steps glide.
// - view: progress is how far an element has risen into the viewport (no pin).
// - play: where the stage is not pinned (phones, short windows) the scene plays once, in time,
//   when it comes into view.
// - With less motion nothing runs: the HTML already holds every scene's final, readable state.
import { every, clamp, type Task } from './loop';
import { env } from './env';

/** Where tracks pin. The same query is in styles/pins.css. */
export const PIN_MEDIA = '(min-width: 900px) and (min-height: 600px)';

export type Update = (p: number, dt: number) => void;

export interface DriveOptions {
  /** How the scene runs where it cannot pin: 'play' (in time, once) or 'view' (scroll-linked). */
  fallback?: 'play' | 'view';
  /** Length of a play, ms. */
  playMs?: number;
  /** For view mode: progress reaches 1 when the element's top is this far down the viewport (0 to 1). */
  viewEnd?: number;
  /** Keep calling update every frame while visible, even when progress holds still (canvases). */
  always?: boolean;
  /** Smoothing rate for scroll progress (per second; 0 for none). */
  smooth?: number;
  /** Layout reads for the frame, run in the loop's read pass before any write. */
  read?: () => void;
}

export interface Driver {
  /** Current mode. */
  readonly mode: 'pin' | 'view' | 'play' | 'still';
  /** The scroll position (px) where the track's progress is `p` (pin mode), for jump links. */
  scrollFor(p: number): number;
  stop(): void;
}

const pinQuery = typeof matchMedia === 'function' ? matchMedia(PIN_MEDIA) : null;

export function drive(track: HTMLElement, update: Update, opts: DriveOptions = {}): Driver {
  const fallback = opts.fallback ?? 'play';
  const smoothRate = opts.smooth ?? 9;
  let mode: Driver['mode'] = 'still';
  let raw = 0;
  let shown = -1;
  let stopFrame: (() => void) | null = null;
  let io: IntersectionObserver | null = null;
  let played = false;
  let rectTop = 0, rectH = 0;

  if (env.reduced) {
    return { mode, scrollFor: () => track.offsetTop, stop() {} };
  }
  track.classList.add('staged');

  function pick(): Driver['mode'] {
    if (track.classList.contains('track') && pinQuery?.matches) return 'pin';
    return fallback;
  }

  const task: Task = {
    read() {
      const r = track.getBoundingClientRect();
      rectTop = r.top;
      rectH = r.height;
      opts.read?.();
    },
    write(dt) {
      const vh = innerHeight;
      if (mode === 'pin') raw = clamp(-rectTop / Math.max(1, rectH - vh));
      else if (mode === 'view') raw = clamp((vh - rectTop) / (vh * (1 - (opts.viewEnd ?? 0.3))));
      else return;
      let p = raw;
      if (smoothRate > 0 && shown >= 0) {
        p = shown + (raw - shown) * (1 - Math.exp(-dt * smoothRate));
        if (Math.abs(raw - p) < 0.0004) p = raw;
      }
      if (p !== shown || opts.always) update((shown = p), dt);
    },
  };

  function startFrames() {
    if (stopFrame) return;
    // Wake only while the track is near the viewport.
    io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !stopFrame) stopFrame = every(task);
      else if (!e.isIntersecting && stopFrame) {
        stopFrame();
        stopFrame = null;
      }
    }, { rootMargin: '10% 0px' });
    io.observe(track);
  }

  function play() {
    if (played) return;
    played = true;
    const ms = opts.playMs ?? 4000;
    const start = performance.now();
    const off = every({
      read: opts.read,
      write(dt, now) {
        const p = Math.min(1, (now - start) / ms);
        update((shown = p), dt);
        if (p >= 1) off();
      },
    });
  }

  function setMode() {
    const next = pick();
    if (next === mode) return;
    stopFrame?.();
    stopFrame = null;
    io?.disconnect();
    io = null;
    mode = next;
    track.dataset.mode = mode;
    if (mode === 'play') {
      if (!played) update((shown = 0), 0);
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          io?.disconnect();
          play();
        }
      }, { threshold: 0.3 });
      io.observe(track);
    } else {
      // First frame at once, so the scene never shows its final state before it starts.
      const r = track.getBoundingClientRect();
      rectTop = r.top;
      rectH = r.height;
      shown = -1;
      task.write(0, performance.now());
      startFrames();
    }
  }

  setMode();
  pinQuery?.addEventListener('change', setMode);

  return {
    get mode() {
      return mode;
    },
    scrollFor(p) {
      const top = track.getBoundingClientRect().top + scrollY;
      return top + p * Math.max(0, track.offsetHeight - innerHeight);
    },
    stop() {
      stopFrame?.();
      io?.disconnect();
      pinQuery?.removeEventListener('change', setMode);
    },
  };
}

/** Progress of `p` through the window [a, b], 0 to 1. */
export const span = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** Smoothstep through [a, b]. */
export const ease = (p: number, a: number, b: number) => {
  const t = span(p, a, b);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Out-quart through [a, b]. */
export const out = (p: number, a: number, b: number) => 1 - Math.pow(1 - span(p, a, b), 4);

/** Fires `on` when progress crosses `mark` going forward, `off` when it goes back under it. */
export function mark(at: number, on: () => void, off?: () => void) {
  let past = false;
  return (p: number) => {
    if (!past && p >= at) {
      past = true;
      on();
    } else if (past && p < at - 0.01) {
      past = false;
      off?.();
    }
  };
}

/** Sets a style property only when its value changed (style writes are not free). */
export function setter() {
  const last = new WeakMap<Element, Map<string, string>>();
  return (el: HTMLElement | SVGElement, prop: string, value: string) => {
    let m = last.get(el);
    if (!m) last.set(el, (m = new Map()));
    if (m.get(prop) === value) return;
    m.set(prop, value);
    if (prop.startsWith('--')) el.style.setProperty(prop, value);
    else (el.style as unknown as Record<string, string>)[prop] = value;
  };
}
