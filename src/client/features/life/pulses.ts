import * as THREE from 'three';
import { DESKS, MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import { PULSE } from './logic';

// Data pulses: a busy station now and then sends a small point of ship-cyan light in a low arc from
// its console's hood to the holo table, a trail of two fainter points behind it, as if its work were
// being filed into the course plot. Additive, writing no depth, under the glow's threshold; one
// draw call for the whole pool. Only working stations send them (features/life decides when).

export interface DataPulses {
  /** Sends a pulse from `deskId`'s console to the table (dropped when the pool is full). */
  emit(deskId: string): void;
  /** Moves the pulses on `dt` seconds. */
  step(dt: number): void;
  /** Takes every pulse off (a floor changing, motion turned off). */
  clear(): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The data pulses from the stations to the holo table (features/life). */
    pulses: DataPulses;
  }
}

/** Points per pulse (its head and its trail), how far each trails behind the one before (s), and their sizes. */
const TRAIL = { points: 3, lag: 0.07, size: [0.16, 0.11, 0.08], glow: [1, 0.55, 0.3] } as const;

/** A soft round dot, white at its middle, for the points' sprite. */
function dot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export const pulses: Fixture<'pulses'> = (site) => {
  const n = PULSE.pool * TRAIL.points;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pSize', new THREE.BufferAttribute(size, 1));
  for (let i = 0; i < n; i++) size[i] = TRAIL.size[i % TRAIL.points];
  const mat = new THREE.PointsMaterial({ map: dot(), size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  // Each point's own size, in place of the material's one.
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('uniform float size;', 'uniform float size;\nattribute float pSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * pSize;');
  };
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.name = 'life-pulses';
  site.group.add(points);

  // Where each console's pulse starts (over its hood) and lands (over the table's rim toward it).
  const from = new Map<string, THREE.Vector3>();
  const to = new Map<string, THREE.Vector3>();
  for (const d of DESKS) {
    const out = new THREE.Vector3(d.x - MISSION_TABLE.x, 0, d.z - MISSION_TABLE.z).normalize();
    // The hood is on the console's table side, 0.4 m in from its middle.
    from.set(d.id, new THREE.Vector3(d.x - out.x * 0.42, 1.0, d.z - out.z * 0.42));
    to.set(d.id, new THREE.Vector3(MISSION_TABLE.x + out.x * MISSION_TABLE.r * 0.55, MISSION_TABLE.h + 0.18, MISSION_TABLE.z + out.z * MISSION_TABLE.r * 0.55));
  }
  const ship = new THREE.Color(DECK.ship);
  const live: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; t: number }[] = [];
  const at = new THREE.Vector3();
  const curveAt = (p: (typeof live)[number], k: number) => {
    const u = ease(Math.min(1, Math.max(0, k)));
    const v = 1 - u;
    return at.set(0, 0, 0).addScaledVector(p.a, v * v).addScaledVector(p.c, 2 * u * v).addScaledVector(p.b, u * u);
  };

  const write = () => {
    col.fill(0);
    live.forEach((p, i) => {
      for (let j = 0; j < TRAIL.points; j++) {
        const k = (p.t - j * TRAIL.lag) / PULSE.flightS;
        const o = (i * TRAIL.points + j) * 3;
        if (k <= 0 || k >= 1) continue;
        curveAt(p, k);
        pos[o] = at.x;
        pos[o + 1] = at.y;
        pos[o + 2] = at.z;
        // Fades in off the hood and out into the table.
        const fade = Math.min(1, k * 6, (1 - k) * 4) * TRAIL.glow[j] * 0.8;
        col[o] = ship.r * fade;
        col[o + 1] = ship.g * fade;
        col[o + 2] = ship.b * fade;
      }
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  const emit = (deskId: string) => {
    const a = from.get(deskId);
    const b = to.get(deskId);
    if (!a || !b || live.length >= PULSE.pool) return;
    const c = a.clone().lerp(b, 0.5);
    c.y += 0.9;
    live.push({ a, b, c, t: 0 });
  };
  const step = (dt: number) => {
    if (!live.length) return;
    for (const p of live) p.t += dt;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].t > PULSE.flightS + TRAIL.lag * TRAIL.points) live.splice(i, 1);
    write();
  };
  const clear = () => {
    if (!live.length) return;
    live.length = 0;
    write();
  };
  write();
  return { handle: { pulses: { emit, step, clear } } };
};
