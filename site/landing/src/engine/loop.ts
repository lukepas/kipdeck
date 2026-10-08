// One requestAnimationFrame loop for the whole page. A task runs each frame while it is subscribed;
// the loop stops when nothing is subscribed or the tab is hidden, so an idle page costs nothing.
// Each frame reads layout first (every task's `read`), then writes (every task's `write`), so one
// frame never interleaves the two and forces a second layout.

export interface Task {
  read?(now: number): void;
  write(dt: number, now: number): void;
}

const tasks = new Set<Task>();
let raf = 0;
let last = 0;

function frame(now: number) {
  raf = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  for (const t of tasks) t.read?.(now);
  for (const t of tasks) t.write(dt, now);
  if (tasks.size && !document.hidden) raf = requestAnimationFrame(frame);
  else last = 0;
}

function kick() {
  if (!raf && tasks.size && !document.hidden) raf = requestAnimationFrame(frame);
}

/** Runs `task` every frame until the returned function is called. */
export function every(task: Task): () => void {
  tasks.add(task);
  kick();
  return () => {
    tasks.delete(task);
  };
}

document.addEventListener('visibilitychange', () => {
  last = 0;
  kick();
});

/** Calls `fn` with eased progress 0 to 1 over `ms`, then resolves. */
export function tween(ms: number, fn: (p: number) => void, ease: (t: number) => number = easeOut): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const stop = every({
      write(_dt, now) {
        const t = Math.min(1, (now - start) / ms);
        fn(ease(t));
        if (t >= 1) {
          stop();
          resolve();
        }
      },
    });
  });
}

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeInOut = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
