// The hero's far field, on one Canvas2D: a dot grid that bends toward the cursor, and a few hundred
// agent units (the app's steel chevrons) drifting right to left in five vendor lanes on three
// depths. When an agent waits on the visitor, one unit in the Codex lane stops dead and lights
// Signal orange, with a hairline to the row that is waiting: the background tells the same story as
// the inbox. On load every unit is launched from the Formation mark in the top bar and flies out
// to its lane: the agents leave the mark and go to work. Everything (position, lane, depth, state,
// launch time) lives in typed arrays; a frame allocates nothing.
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
  /** Launches every unit from a point (viewport coordinates), staggered over `spread` ms. */
  launch(x: number, y: number, spread?: number): void;
  /** Lands every unit still in flight (the visitor skipped the intro). */
  land(): void;
}

const LANES = 5;
const LIT = 0;
/** A unit's flight from the mark to its lane (ms). */
const FLIGHT = 1100;
/** Unit states. */
const WORKING = 0, BLOCKED = 1;
/** Vertical bands of the fade behind the copy (one stroke per band and depth). */
const BANDS = 6;

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
  const ustate = new Uint8Array(max);
  const ulaunch = new Float32Array(max); // when the unit leaves the mark (performance.now ms); 0 = landed
  let originX = 0, originY = 0;
  // Where each unit is drawn this frame (filled by the move pass, read by the draw pass).
  const px = new Float32Array(max), py = new Float32Array(max), pax = new Float32Array(max), pay = new Float32Array(max);
  const pband = new Uint8Array(max), pvis = new Uint8Array(max);

  let w = 0, h = 0, dpr = 1;
  let colors = { dot: '', unit: '', signal: '' };
  let cx = -9999, cy = -9999, ex = -9999, ey = -9999; // cursor and its eased follower
  let beam: DOMRect | null = null;
  let canvasTop = 0, canvasLeft = 0;
  let litGlow = 0;
  let attendX = 0, attendY = 0, attendUntil = 0;
  let running = false;
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
      ustate[i] = WORKING;
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
    paintGrid();
    draw(0);
  }

  function laneY(lane: number) {
    return h * (0.16 + (lane / (LANES - 1)) * 0.7);
  }

  /** How much of a unit shows at x: units fade behind the headline and the copy, so the words stay crisp. */
  function fadeAt(x: number) {
    const t = x / w;
    if (env.phone) return 0.45 + 0.15 * t;
    return t < 0.5 ? 0.2 + 0.5 * t : 0.45 + 1.1 * (t - 0.5);
  }

  // The dot grid is drawn once into its own canvas and copied each frame; only the dots near the
  // cursor are drawn live, pulled toward it.
  const grid = document.createElement('canvas');
  const gctx = grid.getContext('2d')!;
  const GAP = env.phone ? 26 : 28;
  const R = 170, PULL = 16;
  function paintGrid() {
    grid.width = canvas.width;
    grid.height = canvas.height;
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gctx.fillStyle = colors.dot;
    for (let y = GAP / 2; y < h; y += GAP) for (let x = GAP / 2; x < w; x += GAP) gctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
  }

  function drawGrid() {
    if (ex < -999) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(grid, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return;
    }
    // Snap the live square to the grid so the copied dots and the live ones never double up.
    const x0 = Math.max(0, Math.floor((ex - R) / GAP) * GAP), y0 = Math.max(0, Math.floor((ey - R) / GAP) * GAP);
    const x1 = Math.min(w, Math.ceil((ex + R) / GAP) * GAP), y1 = Math.min(h, Math.ceil((ey + R) / GAP) * GAP);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip('evenodd');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(grid, 0, 0);
    ctx.restore();
    ctx.fillStyle = colors.dot;
    for (let y = y0 + GAP / 2; y < y1; y += GAP) {
      for (let x = x0 + GAP / 2; x < x1; x += GAP) {
        let px = x, py = y;
        const dx = ex - x, dy = ey - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * (1 - d / R) * PULL;
          px += (dx / d) * f;
          py += (dy / d) * f;
        }
        ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
      }
    }
  }

  function draw(dt: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawGrid();

    // Move every unit and work out where it is drawn and which way it points.
    const now = performance.now();
    const attending = now < attendUntil;
    for (let i = 0; i < count; i++) {
      if (i === LIT) continue;
      const z = uz[i];
      ux[i] -= uspd[i] * (0.45 + z * 0.4) * dt;
      if (ux[i] < -12) ux[i] += w + 24;
      let y = laneY(ulane[i]) + uy[i] * h + Math.sin(now / 1400 + uph[i]) * 3;
      let x = ux[i];
      let ax = -1, ay = 0; // heading: right to left
      const l = ulaunch[i];
      pvis[i] = 1;
      if (l) {
        // In flight: a curve out of the mark that bends into the lane, nose along the curve.
        const p = (now - l) / FLIGHT;
        if (p <= 0) pvis[i] = 0;
        else if (p >= 1) ulaunch[i] = 0;
        else {
          const e = 1 - (1 - p) * (1 - p) * (1 - p);
          const qx = x, qy = originY; // the control point: level with the mark, above the lane
          const mt = 1 - e;
          const nx2 = mt * mt * originX + 2 * mt * e * qx + e * e * x;
          const ny2 = mt * mt * originY + 2 * mt * e * qy + e * e * y;
          const dx = 2 * mt * (qx - originX) + 2 * e * (x - qx);
          const dy = 2 * mt * (qy - originY) + 2 * e * (y - qy);
          const d = Math.hypot(dx, dy) || 1;
          ax = dx / d; ay = dy / d;
          x = nx2; y = ny2;
        }
      }
      if (attending) {
        const dx = attendX - x, dy = attendY - y;
        const d = Math.hypot(dx, dy) || 1;
        ax = dx / d; ay = dy / d;
      }
      px[i] = x; py[i] = y; pax[i] = ax; pay[i] = ay;
      pband[i] = Math.max(0, Math.min(BANDS - 1, Math.floor((x / w) * BANDS)));
    }

    // Draw them: one stroked path per depth and band of the fade, so a frame is a few strokes, not hundreds.
    ctx.strokeStyle = colors.unit;
    for (let z = 0; z < 3; z++) {
      const size = 2.6 + z * 1.6;
      ctx.lineWidth = 1 + z * 0.35;
      for (let b = 0; b < BANDS; b++) {
        ctx.globalAlpha = (0.14 + z * 0.12) * fadeAt(((b + 0.5) / BANDS) * w);
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (uz[i] !== z || pband[i] !== b || !pvis[i] || i === LIT) continue;
          const x = px[i], y = py[i], ax = pax[i], ay = pay[i];
          // A chevron pointing along its heading.
          const bx = -ax * size, by = -ay * size, nx = -ay * size * 0.9, ny = ax * size * 0.9;
          ctx.moveTo(x + bx + nx, y + by + ny);
          ctx.lineTo(x, y);
          ctx.lineTo(x + bx - nx, y + by - ny);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // The lit unit: blocked, it holds still in Signal with a hairline to the waiting row.
    litGlow += ((ustate[LIT] === BLOCKED ? 1 : 0) - litGlow) * Math.min(1, dt * 6);
    if (ustate[LIT] !== BLOCKED) {
      ux[LIT] -= 30 * dt;
      if (ux[LIT] < -12) ux[LIT] += w + 24;
    }
    const lx = ux[LIT], ly = laneY(ulane[LIT]) + uy[LIT] * h;
    // The lit unit fades in where it works instead of flying, so the one that will block is never lost in the swarm.
    let litIn = 1;
    if (ulaunch[LIT]) {
      litIn = Math.max(0, Math.min(1, (now - ulaunch[LIT]) / FLIGHT));
      if (litIn >= 1) ulaunch[LIT] = 0;
    }
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
    ctx.globalAlpha = (0.45 + 0.55 * litGlow) * litIn;
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
    paintGrid();
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
      ustate[LIT] = on ? BLOCKED : WORKING;
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
    launch(x, y, spread = 1200) {
      if (tier === 'min') return;
      const r = canvas.getBoundingClientRect();
      originX = x - r.left;
      originY = y - r.top;
      const t0 = performance.now();
      for (let i = 0; i < max; i++) ulaunch[i] = t0 + 80 + (i === LIT ? 0 : ((i * 7919) % max) / max) * spread;
    },
    land() {
      ulaunch.fill(0);
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
