// The pure parts of Kip's timeline engine (tween.ts): eases, where a repeating tween is at a given
// time, relative values and the transform strings. No DOM here, so tests/kip-tween.test.ts runs it
// in Node.

export type Ease = (t: number) => number;
export type Num = number | string | ((i: number) => number);

const powIn = (n: number): Ease => (t) => Math.pow(t, n);
const powOut = (n: number): Ease => (t) => 1 - Math.pow(1 - t, n);
const powInOut = (n: number): Ease => (t) => (t < 0.5 ? Math.pow(2 * t, n) / 2 : 1 - Math.pow(2 - 2 * t, n) / 2);
export const backOut = (s = 1.70158): Ease => (t) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const sine = {
  in: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  out: (t: number) => Math.sin((t * Math.PI) / 2),
  inOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** GSAP's ease names: none, power1-4 (.in/.out/.inOut, bare is .out), sine.*, back.out(n). */
export function parseEase(e?: string | Ease): Ease {
  if (typeof e === 'function') return e;
  if (!e) return powOut(2);
  if (e === 'none' || e === 'linear') return (t) => t;
  const m = /^(\w+?)(\d)?(?:\.(in|out|inOut))?(?:\(([\d.]+)\))?$/.exec(e);
  if (!m) return powOut(2);
  const [, name, num, dir = 'out', arg] = m;
  if (name === 'power') {
    const n = Number(num ?? 1) + 1;
    return dir === 'in' ? powIn(n) : dir === 'inOut' ? powInOut(n) : powOut(n);
  }
  if (name === 'sine') return sine[dir as keyof typeof sine];
  if (name === 'back') return backOut(arg ? Number(arg) : undefined);
  return powOut(2);
}

/** A tween's whole length with its repeats. */
export const totalOf = (dur: number, repeat: number, repeatDelay: number) => dur * (repeat + 1) + repeatDelay * repeat;

/** Where a tween is (0 to 1, before its ease) `local` seconds in, with repeats and yoyo. */
export function cycleT(local: number, dur: number, repeat = 0, repeatDelay = 0, yoyo = false): number {
  if (dur <= 0) return 1;
  const cycle = dur + repeatDelay;
  let n = Math.floor(local / cycle);
  let t = Math.min(1, (local - n * cycle) / dur);
  if (n > repeat || local >= totalOf(dur, repeat, repeatDelay)) {
    n = repeat;
    t = 1;
  }
  return yoyo && n % 2 === 1 ? 1 - t : t;
}

/** A value spec: a number, '+=n' / '-=n' from the current value, or a function of the target's index. */
export function resolve(spec: Num, cur: number, i: number): number {
  if (typeof spec === 'function') return Number(spec(i));
  if (typeof spec === 'string') {
    const m = /^([+-])=(-?[\d.e-]+)$/.exec(spec);
    if (m) return cur + (m[1] === '-' ? -1 : 1) * Number(m[2]);
    return Number(spec);
  }
  return Number(spec);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface Tf { x: number; y: number; rotation: number; scaleX: number; scaleY: number; skewY: number }

/** An SVG part's transform attribute: GSAP's order (move, turn, skew, scale) around its pivot, after
 *  whatever transform the drawing gave it. */
export function svgTransform(base: string, [ox, oy]: [number, number], v: Tf): string {
  let s = `translate(${r3(v.x + ox)} ${r3(v.y + oy)})`;
  if (v.rotation) s += ` rotate(${r3(v.rotation)})`;
  if (v.skewY) s += ` skewY(${r3(v.skewY)})`;
  if (v.scaleX !== 1 || v.scaleY !== 1) s += ` scale(${r3(v.scaleX)} ${r3(v.scaleY)})`;
  s += ` translate(${r3(-ox)} ${r3(-oy)})`;
  return base ? `${base} ${s}` : s;
}

/** An element's CSS transform (its transform-origin is in the stylesheet). */
export function cssTransform(v: Tf): string {
  return `translate3d(${r3(v.x)}px, ${r3(v.y)}px, 0)${v.rotation ? ` rotate(${r3(v.rotation)}deg)` : ''}${v.scaleX !== 1 || v.scaleY !== 1 ? ` scale(${r3(v.scaleX)}, ${r3(v.scaleY)})` : ''}`;
}

export { r3 };
