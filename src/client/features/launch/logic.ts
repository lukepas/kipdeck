// The start of watch's numbers, kept free of three.js and the page so the tests can pin them: how the
// launch is timed (the lights, the pods, the log), how much shorter it runs when someone already
// needs the captain, and how the day's log is typed onto the forward glass.

/** The launch at full length: the lights come up over `wake`, the log is typed from `logAt` and shows for `log` (ms). */
export const LAUNCH = { from: 0.1, wake: 2600, logAt: 1300, log: 4900 } as const;
/** The launch when a unit already needs the captain: lights up in 1.2 s and no log on the glass. */
export const LAUNCH_YIELD = { from: 0.35, wake: 1200 } as const;
/** How long the launch takes in all (ms). */
export const LAUNCH_MS = LAUNCH.logAt + LAUNCH.log;
/** The log's typing: the scanline's wipe first (ms), then this many characters a second. */
export const TYPE = { wipe: 350, cps: 75 } as const;
/** The most lines the log puts on the glass: short, read at a glance. */
export const LOG_LINES = 3;
/** How long the reduced-motion card stays up (ms). */
export const STILL_CARD_MS = 6000;
/** How long the debrief stays up (ms), and how long when it lists who waits on you. */
export const DEBRIEF_MS = 15_000;
export const DEBRIEF_WAITING_MS = 30_000;
/** How long the launch waits for the server's log before it plays without the crawl (ms). */
export const LOG_WAIT_MS = 2500;

/** The log's body as the lines it is typed in: a sentence a line, LOG_LINES at most (the rest joins the last). */
export function logLines(body: string): string[] {
  const parts = body.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= LOG_LINES) return parts;
  return [...parts.slice(0, LOG_LINES - 1), parts.slice(LOG_LINES - 1).join(' ')];
}

/**
 * The log `ms` after it starts: how far the scanline has wiped down the panel (0-1), how many
 * characters of each line are typed, and how much the panel shows (fading in, holding, fading out).
 */
export function typedAt(ms: number, lens: readonly number[]): { wipe: number; typed: number[]; alpha: number } {
  const wipe = Math.min(1, Math.max(0, ms / TYPE.wipe));
  let left = Math.max(0, Math.floor(((ms - TYPE.wipe) / 1000) * TYPE.cps));
  const typed = lens.map((n) => {
    const k = Math.min(n, left);
    left -= k;
    return k;
  });
  const inA = Math.min(1, Math.max(0, ms / 250));
  const outA = Math.min(1, Math.max(0, (LAUNCH.log - ms) / 700));
  return { wipe, typed, alpha: Math.max(0, Math.min(inA, outA)) };
}

/** Today, as the browser names it, for "the first visit of the day". */
export const dayKey = (at: number) => new Date(at).toDateString();
