// The start of watch's numbers, kept free of three.js and the page so the tests can pin them: how the
// launch is timed (the lights, the pods, the crawl), how much shorter it runs when someone already
// needs the captain, and how the crawl moves and fades.

/** The launch at full length: the lights come up over `wake`, the crawl starts at `crawlAt` and runs `crawl` (ms). */
export const LAUNCH = { from: 0.1, wake: 2600, crawlAt: 1300, crawl: 4900 } as const;
/** The launch when a unit already needs the captain: lights up in 1.2 s and no crawl. */
export const LAUNCH_YIELD = { from: 0.35, wake: 1200 } as const;
/** How long the launch takes in all (ms). */
export const LAUNCH_MS = LAUNCH.crawlAt + LAUNCH.crawl;
/** How long the reduced-motion card stays up (ms). */
export const STILL_CARD_MS = 6000;
/** How long the debrief stays up (ms), and how long when it lists who waits on you. */
export const DEBRIEF_MS = 15_000;
export const DEBRIEF_WAITING_MS = 30_000;
/** How long the launch waits for the server's log before it plays without the crawl (ms). */
export const LOG_WAIT_MS = 2500;

/** How far into its crawl the log is at `ms` (0-1), and how much of it shows: fading in, holding, fading as it recedes. */
export function crawlAt(ms: number): { k: number; alpha: number } {
  const k = Math.min(1, Math.max(0, ms / LAUNCH.crawl));
  const inA = Math.min(1, ms / 500);
  const outA = Math.min(1, Math.max(0, (LAUNCH.crawl - ms) / 1100));
  return { k, alpha: Math.max(0, Math.min(inA, outA)) };
}

/** The crawl's slide back into the stars: slow, easing off as it goes (in the plane's own meters). */
export function crawlSlide(k: number, distance = 12): number {
  return distance * (1 - (1 - k) * (1 - k) * 0.55) * k;
}

/** Today, as the browser names it, for "the first visit of the day". */
export const dayKey = (at: number) => new Date(at).toDateString();
