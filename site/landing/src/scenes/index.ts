// The scene registry: one module per section, keyed by the section's data-scene. main.ts mounts a
// scene when its section first comes near the viewport. A new section plugs in here, never in main.ts.
//
// The hero is on screen at once, so main.ts imports it directly and it ships in the first chunk.
// Every other scene is its own chunk: main.ts fetches them all while the browser is idle after the
// opening, so a scene is in memory well before its section comes near, and the first load carries
// only the engine, the field and the hero.

export type Mount = (section: HTMLElement) => unknown;
type Loader = () => Promise<Mount>;

export const SCENES: Record<string, Loader> = {
  funnel: () => import('./funnel').then((m) => m.mountFunnel),
  problem: () => import('./problem').then((m) => m.mountProblem),
  loop: () => import('./loop').then((m) => m.mountLoop),
  why: () => import('./why').then((m) => m.mountWhy),
  yours: () => import('./yours').then((m) => m.mountYours),
  phone: () => import('./phone').then((m) => m.mountPhone),
  numbers: () => import('./numbers').then((m) => m.mountNumbers),
  labs: () => import('./labs').then((m) => m.mountLabs),
  teams: () => import('./teams').then((m) => m.mountTeams),
  end: () => import('./end').then((m) => m.mountEnd),
};

/**
 * The scenes whose mount is a costly frame of its own, so they are mounted while the browser is idle
 * after the opening rather than as their section comes near in the middle of a scroll. The loop splits
 * its question into some 180 letters and measures them: on a slow phone that was a task over 50 ms. A
 * scene goes here only when mounting it early changes nothing the visitor sees: its motion waits for
 * its own arrival (drive, onArrive), not for the mount.
 */
export const EARLY: ReadonlySet<string> = new Set(['loop']);

/** Fetches every scene's chunk, one per idle period, in page order. */
export function preloadScenes(order: string[]) {
  const idle = (fn: () => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200);
  const queue = order.filter((id) => id in SCENES);
  const next = () => {
    const id = queue.shift();
    if (!id) return;
    void SCENES[id]().catch(() => undefined).finally(() => idle(next));
  };
  idle(next);
}
