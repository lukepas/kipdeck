// The heartbeat's CPU cost a frame with 24 working units, and whether a frame allocates: runs its
// 'world' tick against stand-in units in Node (no renderer; the GPU side is two instanced draws).
//
//   node --expose-gc --import tsx design/heartbeat-bench.ts
import * as THREE from 'three';

(globalThis as any).window = globalThis;
(globalThis as any).localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { store } = await import('../src/client/state');
const { installHeartbeat } = await import('../src/client/features/heartbeat');

const N = 24;
const scene = new THREE.Scene();
const desks = new Map<string, { group: THREE.Group }>();
const workerViews = new Map<string, any>();
const now = Date.now();
for (let i = 0; i < N; i++) {
  const id = `w${i}`;
  const group = new THREE.Group();
  group.position.set((i % 6) * 2, 0, Math.floor(i / 6) * 2);
  scene.add(group);
  desks.set(`desk-${i}`, { group });
  const root = new THREE.Group();
  const mover = new THREE.Object3D();
  root.add(mover);
  group.add(root);
  workerViews.set(id, { deskId: `desk-${i}`, model: { root, showing: 'working', where: (out: THREE.Vector3) => mover.getWorldPosition(out) } });
  store.workers.set(id, { id, status: 'working', action: 'edit', activityAt: now - i * 4000, createdAt: now - 3_600_000 } as any);
}
scene.updateMatrixWorld(true);
const world = { desks };
let tick: (f: any) => void = () => {};
const ctx: any = { scene, ticks: { add: (_p: string, fn: any) => (tick = fn) }, reduceMotion: { matches: false }, world: () => world };
installHeartbeat(ctx, { views: { workerViews } } as any);

let t = performance.now();
// One frame object, reused, so the harness itself allocates nothing a frame.
const f = { now: 0, dt: 0.0167, delta: 0.0167, t: 0 };
const frame = () => {
  t += 16.7;
  f.now = t;
  tick(f);
};
// Warm up, with every unit stamping a new tool call so pulses run.
for (let i = 0; i < 2000; i++) {
  if (i % 60 === 0) for (const w of store.workers.values()) w.activityAt = Date.now();
  frame();
}
const FRAMES = 20000;
const t0 = performance.now();
for (let i = 0; i < FRAMES; i++) {
  if (i % 60 === 0) for (const w of store.workers.values()) w.activityAt = Date.now();
  frame();
}
const per = (performance.now() - t0) / FRAMES;
// Allocations: frames between reads (no store read) should not grow the heap.
const g = (globalThis as any).gc;
let grew = NaN;
const FR = Number(process.env.FR ?? 25);
if (g) {
  g();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < FR; i++) {
    t += 16.7 / 1000; // stay inside one read window: only the per-frame path runs
    f.now = t;
    tick(f);
  }
  grew = process.memoryUsage().heapUsed - before;
}
// Collections while frames run between reads: a frame path that allocates nothing never triggers one.
const { PerformanceObserver } = await import('node:perf_hooks');
let gcs = 0;
const obs = new PerformanceObserver((l) => (gcs += l.getEntries().length));
obs.observe({ entryTypes: ['gc'] });
// Every unit mid-pulse: past the rate limit, a fresh tool call each, and a read to see them.
await new Promise((r) => setTimeout(r, 1300));
for (const w of store.workers.values()) w.activityAt = Date.now() + 10_000;
t += 2000;
f.now = t;
tick(f);
const pulsing = (globalThis as any).__world.heartbeat.counts();
g?.();
await new Promise((r) => setTimeout(r, 50));
gcs = 0;
for (let i = 0; i < 200000; i++) {
  t += 1e-6;
  f.now = t;
  tick(f);
}
await new Promise((r) => setTimeout(r, 50));
obs.disconnect();
console.log(JSON.stringify({ gcsOver200kFrames: gcs, pulsing, units: N, msPerFrameAvg: +per.toFixed(4), heapGrowthBytes: grew, frames: FR, drawn: (globalThis as any).__world.heartbeat.counts() }));
