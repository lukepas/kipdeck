// The March to the Mark: agent units stream in from the edges of the viewport and fall into rank as
// the Formation mark (three chevrons, the lead one in Signal), hold for a moment, then break and
// leave. It plays when someone joins the waitlist: one more seat at the table. One temporary
// canvas, gone when they are.
import { token, tier } from '../engine/env';

/** Points along the mark's three chevrons (24 by 24 box), the lead one doubled up. */
function markPoints(n: number): { x: number; y: number; lead: boolean }[] {
  const chev = (y: number, k: number, lead: boolean) => {
    const out: { x: number; y: number; lead: boolean }[] = [];
    for (let i = 0; i < k; i++) {
      const t = i / (k - 1);
      const x = 4 + t * 16;
      const yy = y + Math.abs(x - 12) - 0;
      out.push({ x, y: yy, lead });
      if (lead) out.push({ x, y: yy + 2.4, lead });
    }
    return out;
  };
  const lead = Math.round(n * 0.25);
  const rest = Math.round((n - lead * 2) / 2);
  return [...chev(4, lead, true), ...chev(9, rest, false), ...chev(14, rest, false)];
}

export function march(cx: number, cy: number, size = 220): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.className = 'march';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const W = innerWidth, H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const steel = token('--working') || '#c9d2dc', signal = token('--signal') || '#ff6a1a';
  const pts = markPoints(tier === 'full' ? 150 : 80);
  const s = size / 24;
  const units = pts.map((p, i) => {
    const side = i % 4;
    const r = Math.random();
    const sx = side === 0 ? -20 : side === 1 ? W + 20 : r * W;
    const sy = side === 2 ? -20 : side === 3 ? H + 20 : r * H;
    return {
      sx, sy,
      tx: cx + (p.x - 12) * s + (Math.random() - 0.5) * 3,
      ty: cy + (p.y - 13) * s + (Math.random() - 0.5) * 3,
      lead: p.lead,
      delay: Math.random() * 380,
      ex: cx + (Math.random() - 0.5) * W * 1.6,
      ey: -60 - Math.random() * 200,
      hx: 0, hy: -1, lx: sx, ly: sy,
    };
  });
  const IN = 1100, HOLD = 1000, OUT = 900;
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? signal : steel;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (const u of units) {
          if (u.lead !== !!pass) continue;
          let x: number, y: number;
          const a = Math.min(1, Math.max(0, (t - u.delay) / IN));
          const e = 1 - Math.pow(1 - a, 3);
          x = u.sx + (u.tx - u.sx) * e;
          y = u.sy + (u.ty - u.sy) * e;
          const o = Math.max(0, (t - IN - HOLD - u.delay * 0.5) / OUT);
          if (o > 0) {
            const k = o * o;
            x = u.tx + (u.ex - u.tx) * k;
            y = u.ty + (u.ey - u.ty) * k;
          }
          const dx = x - u.lx, dy = y - u.ly, d = Math.hypot(dx, dy);
          if (d > 0.3) {
            u.hx += (dx / d - u.hx) * 0.3;
            u.hy += (dy / d - u.hy) * 0.3;
          } else {
            u.hx += (0 - u.hx) * 0.15;
            u.hy += (-1 - u.hy) * 0.15;
          }
          u.lx = x;
          u.ly = y;
          const n = Math.hypot(u.hx, u.hy) || 1, ax = u.hx / n, ay = u.hy / n, z = 4.2;
          ctx.moveTo(x - ax * z - ay * z * 0.9, y - ay * z + ax * z * 0.9);
          ctx.lineTo(x, y);
          ctx.lineTo(x - ax * z + ay * z * 0.9, y - ay * z - ax * z * 0.9);
        }
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - IN - HOLD - 300) / OUT);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (t < IN + HOLD + OUT + 400) requestAnimationFrame(tick);
      else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}
