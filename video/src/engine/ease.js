// Easing library: CSS-style cubic-beziers, the classic curves and an analytic
// spring. Every function maps progress p in [0,1] to an eased value; springs
// map elapsed seconds to displacement so they can overshoot and settle.

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, p) => a + (b - a) * p;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp(invLerp(a, b, v)));

// Cubic bezier through (0,0),(x1,y1),(x2,y2),(1,1), solved for x like CSS.
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (s) => ((ax * s + bx) * s + cx) * s;
  const sy = (s) => ((ay * s + by) * s + cy) * s;
  const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
  function solve(x) {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(s) - x;
      if (Math.abs(err) < 1e-6) return s;
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0, hi = 1;
    s = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(s);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  }
  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : sy(solve(p)));
}

const pow = Math.pow;
export const linear = (p) => clamp(p);
export const quadOut = (p) => 1 - (1 - clamp(p)) ** 2;
export const cubicIn = (p) => clamp(p) ** 3;
export const cubicOut = (p) => 1 - (1 - clamp(p)) ** 3;
export const cubicInOut = (p) => { p = clamp(p); return p < 0.5 ? 4 * p * p * p : 1 - pow(-2 * p + 2, 3) / 2; };
export const expoOut = (p) => { p = clamp(p); return p >= 1 ? 1 : 1 - pow(2, -10 * p); };
export const expoIn = (p) => { p = clamp(p); return p <= 0 ? 0 : pow(2, 10 * p - 10); };
export const expoInOut = (p) => {
  p = clamp(p);
  if (p <= 0 || p >= 1) return p;
  return p < 0.5 ? pow(2, 20 * p - 10) / 2 : (2 - pow(2, -20 * p + 10)) / 2;
};
export const backOut = (p, s = 1.70158) => { p = clamp(p) - 1; return 1 + (s + 1) * p * p * p + s * p * p; };

// House curves. 'snap' is the 0-overshoot snap of the storyboard: fast attack,
// hard settle. 'glide' is the cursor approach. 'slam' is for display type.
export const curves = {
  snap: cubicBezier(0.16, 1, 0.3, 1),
  glide: cubicBezier(0.45, 0, 0.15, 1),
  slam: cubicBezier(0.2, 0.9, 0.1, 1),
  flip: cubicBezier(0.65, 0, 0.35, 1),
  swiss: cubicBezier(0.7, 0, 0.2, 1),
};

// Damped harmonic oscillator from 0 to 1 (closed form, so it is exact for any
// t and needs no integration state). stiffness k, damping c, mass m, initial
// velocity v0 in units/s. Returns position at time t seconds after release.
export function spring({ stiffness = 170, damping = 26, mass = 1, velocity = 0 } = {}) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const x0 = -1; // displacement from target at t=0
  return (t) => {
    if (t <= 0) return 0;
    let x;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const A = x0, B = (velocity + zeta * w0 * x0) / wd;
      x = Math.exp(-zeta * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    } else if (zeta === 1) {
      x = Math.exp(-w0 * t) * (x0 + (velocity + w0 * x0) * t);
    } else {
      const s = w0 * Math.sqrt(zeta * zeta - 1);
      const r1 = -zeta * w0 + s, r2 = -zeta * w0 - s;
      const c2 = (velocity - r1 * x0) / (r2 - r1);
      const c1 = x0 - c2;
      x = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
    }
    return 1 + x;
  };
}

// Ball under gravity bouncing on a floor with restitution e: returns height
// above floor (>=0) for elapsed time t, starting at height h0 with upward v0.
export function bounce(t, { h0 = 0, v0 = 0, g = 9.8, e = 0.45, bounces = 3 } = {}) {
  let h = h0, v = v0, time = t;
  for (let i = 0; i <= bounces; i++) {
    const disc = v * v + 2 * g * h;
    const tHit = (v + Math.sqrt(disc)) / g;
    if (time <= tHit) return h + v * time - 0.5 * g * time * time;
    time -= tHit;
    v = Math.sqrt(disc) * e;
    h = 0;
  }
  return 0;
}

// Progress of t through [from, from+dur], eased.
export function prog(t, from, dur, ease = linear) {
  return ease(clamp((t - from) / dur));
}
