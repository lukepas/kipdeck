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
  proof: () => import('./proof').then((m) => m.mountProof),
  teams: () => import('./teams').then((m) => m.mountTeams),
  end: () => import('./end').then((m) => m.mountEnd),
};

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
