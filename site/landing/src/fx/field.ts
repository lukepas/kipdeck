// The hero's far field, on one Canvas2D: a dot grid that bends toward the cursor, and a few hundred
// agent units (the app's steel chevrons) drifting right to left in five vendor lanes on three
// depths. When an agent waits on the visitor, one unit in the Codex lane stops dead and lights
// Signal orange, with a hairline to the row that is waiting: the background tells the same story as
// the inbox. Everything lives in typed arrays; a frame allocates nothing.
import { every } from '../engine/loop';
import { env, tier, token } from '../engine/env';

export interface FieldHandle {
  /** Where the lit unit's hairline points (viewport coordinates), or null for no beam. */
  target(rect: DOMRect | null): void;
  /** Whether the lit unit is blocked (waiting on the visitor). */
  blocked(on: boolean): void;
  /** Every unit turns toward a point for a moment (copying the command). */
  attend(x: number, y: number): void;
  /** Starts or stops drawing (the hero in or out of view). */
  active(on: boolean): void;
}

const LANES = 5;
const LIT = 0;

export function mountField(canvas: HTMLCanvasElement): FieldHandle {
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const max = tier === 'full' ? 420 : tier === 'lite' ? 140 : 90;
  let count = max;
  const ux = new Float32Array(max);
  const uy = new Float32Array(max);
  const uz = new Uint8Array(max);
  const ulane = new Uint8Array(max);
  const uph = new Float32Array(max);
  const uspd = new Float32Array(max);

  let w = 0, h = 0, dpr = 1;
  let colors = { dot: '', unit: '', signal: '' };
  let cx = -9999, cy = -9999, ex = -9999, ey = -9999; // cursor and its eased follower
  let beam: DOMRect | null = null;
  let canvasTop = 0, canvasLeft = 0;
  let isBlocked = false;
  let litGlow = 0;
  let attendX = 0, attendY = 0, attendUntil = 0;
  let running = false;
  let fadeGradient: CanvasGradient | null = null;
  let stop: (() => void) | null = null;
  // The quality governor: average frame time over 30 frames; halve the units if it runs slow.
  let slow = 0, frames = 0;

  function readColors() {
    colors = { dot: token('--dot') || 'rgba(138,151,165,.28)', unit: token('--working') || '#c9d2dc', signal: token('--signal') || '#ff6a1a' };
  }

  function seed() {
    let s = 1337;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < max; i++) {
      ux[i] = rnd() * w;
      ulane[i] = i === LIT ? (env.phone ? 0 : 1) : Math.floor(rnd() * LANES);
      uz[i] = i === LIT ? 2 : rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2;
      uph[i] = rnd() * Math.PI * 2;
      uspd[i] = 14 + rnd() * 22;
      uy[i] = (rnd() - 0.5) * 0.11;
    }
    ux[LIT] = w * (env.phone ? 0.9 : 0.86);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, env.phone ? 1.25 : 1.5);
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === w && nh === h && canvas.width === Math.round(nw * dpr)) return;
    const first = w === 0;
    w = nw; h = nh;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (first) seed();
    fadeGradient = ctx.createLinearGradient(0, 0, w, 0);
    fadeGradient.addColorStop(0, `rgba(0,0,0,${env.phone ? 0.55 : 0.8})`);
    fadeGradient.addColorStop(env.phone ? 1 : 0.5, `rgba(0,0,0,${env.phone ? 0.4 : 0.55})`);
    fadeGradient.addColorStop(1, 'rgba(0,0,0,0)');
    draw(0);
  }

  function laneY(lane: number) {
    return h * (0.16 + (lane / (LANES - 1)) * 0.7);
  }

  function draw(dt: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // The units: one stroked path per depth, so a frame is three strokes, not hundreds.
    const now = performance.now();
    const attending = now < attendUntil;
    for (let z = 0; z < 3; z++) {
      const size = 2.6 + z * 1.6;
      ctx.lineWidth = 1 + z * 0.35;
      ctx.strokeStyle = colors.unit;
      ctx.globalAlpha = 0.14 + z * 0.12;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        if (uz[i] !== z || i === LIT) continue;
        const speed = uspd[i] * (0.45 + z * 0.4);
        ux[i] -= speed * dt;
        if (ux[i] < -12) ux[i] += w + 24;
        const y = laneY(ulane[i]) + uy[i] * h + Math.sin(now / 1400 + uph[i]) * 3;
        const x = ux[i];
        let ax = -1, ay = 0; // heading: right to left
        if (attending) {
          const dx = attendX - x, dy = attendY - y;
          const d = Math.hypot(dx, dy) || 1;
          ax = dx / d; ay = dy / d;
        }
        // A chevron pointing along its heading.
        const bx = -ax * size, by = -ay * size, nx = -ay * size * 0.9, ny = ax * size * 0.9;
        ctx.moveTo(x + bx + nx, y + by + ny);
        ctx.lineTo(x, y);
        ctx.lineTo(x + bx - nx, y + by - ny);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Units fade out behind the headline and the copy, so the words stay crisp.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fadeGradient!;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // The dot grid, pulled toward the (eased) cursor.
    const gap = env.phone ? 26 : 28;
    const R = 170, pull = 16;
    ctx.fillStyle = colors.dot;
    const hasCursor = ex > -999;
    for (let y = gap / 2; y < h; y += gap) {
      for (let x = gap / 2; x < w; x += gap) {
        let px = x, py = y;
        if (hasCursor) {
          const dx = ex - x, dy = ey - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / R) * (1 - d / R) * pull;
            px += (dx / d) * f;
            py += (dy / d) * f;
          }
        }
        ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
      }
    }


    // The lit unit: blocked, it holds still in Signal with a hairline to the waiting row.
    litGlow += ((isBlocked ? 1 : 0) - litGlow) * Math.min(1, dt * 6);
    if (!isBlocked) {
      ux[LIT] -= 30 * dt;
      if (ux[LIT] < -12) ux[LIT] += w + 24;
    }
    const lx = ux[LIT], ly = laneY(ulane[LIT]) + uy[LIT] * h;
    if (litGlow > 0.01) {
      if (beam && !env.phone) {
        const tx = beam.left - canvasLeft, ty = beam.top - canvasTop + beam.height / 2;
        ctx.strokeStyle = colors.signal;
        ctx.globalAlpha = 0.45 * litGlow;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.lineDashOffset = -now / 60;
        ctx.beginPath();
        ctx.moveTo(lx + 8, ly);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 0.18 * litGlow;
      ctx.fillStyle = colors.signal;
      ctx.beginPath();
      ctx.arc(lx, ly, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = litGlow > 0.5 ? colors.signal : colors.unit;
    ctx.globalAlpha = 0.45 + 0.55 * litGlow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // The diamond while blocked (the needs-you glyph), the chevron while it works.
    if (litGlow > 0.5) {
      ctx.fillStyle = colors.signal;
      ctx.moveTo(lx, ly - 6); ctx.lineTo(lx + 6, ly); ctx.lineTo(lx, ly + 6); ctx.lineTo(lx - 6, ly); ctx.closePath();
      ctx.fill();
    } else {
      ctx.moveTo(lx + 6, ly - 5.5); ctx.lineTo(lx, ly); ctx.lineTo(lx + 6, ly + 5.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const task = {
    read() {
      const r = canvas.getBoundingClientRect();
      canvasTop = r.top;
      canvasLeft = r.left;
    },
    write(dt: number) {
      const k = Math.min(1, dt * 7);
      if (cx > -999) {
        if (ex < -999) { ex = cx; ey = cy; }
        ex += (cx - ex) * k;
        ey += (cy - ey) * k;
      }
      draw(dt);
      frames++;
      slow += dt;
      if (frames === 30) {
        if (slow / 30 > 0.018 && count > 60) count = Math.floor(count / 2);
        frames = 0;
        slow = 0;
      }
    },
  };

  readColors();
  resize();
  new ResizeObserver(resize).observe(canvas);
  const themeChanged = () => {
    readColors();
    if (!running) draw(0);
  };
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);

  if (env.finePointer && tier === 'full') {
    const host = canvas.parentElement!;
    host.addEventListener('pointermove', (e) => {
      cx = e.clientX - canvasLeft;
      cy = e.clientY - canvasTop;
    }, { passive: true });
    host.addEventListener('pointerleave', () => {
      cx = cy = ex = ey = -9999;
    });
  }

  return {
    target(rect) {
      beam = rect;
    },
    blocked(on) {
      isBlocked = on;
      if (!running) {
        litGlow = on ? 1 : 0;
        draw(0);
      }
    },
    attend(x, y) {
      attendX = x - canvasLeft;
      attendY = y - canvasTop;
      attendUntil = performance.now() + 600;
    },
    active(on) {
      if (tier === 'min') return;
      if (on && !running) {
        running = true;
        stop = every(task);
      } else if (!on && running) {
        running = false;
        stop?.();
      }
    },
  };
}
