// When the inbox may be warm, and how (docs/voice.md, docs/design.md#warmth-the-crew-look): the greeting
// by local time, which pose Kip is in, and the one gate every warm beat goes through. Pure, so the
// tests read it; the drawing is client/home/warm.ts and the poses client/home/kip/.

/** Kip's poses in the inbox: one inline SVG each, loaded only when wanted (client/home/kip/). */
export type KipPose = 'watching' | 'napping' | 'lantern' | 'cheer' | 'wave' | 'sticker';

export interface Greeting {
  /** The tape-label eyebrow: MORNING, AFTERNOON, EVENING or NIGHT SHIFT. */
  eyebrow: string;
  /** A line under the heading, only on the night shift. */
  line?: string;
  /** Whether it is the night shift (22:00 to 05:00 local): Kip has his lantern. */
  night: boolean;
}

/** The greeting for a local hour (0 to 23). */
export function greeting(hour: number): Greeting {
  if (hour >= 22 || hour < 5) return { eyebrow: 'Night shift', line: "Still up? Nothing needs you. Kip's keeping watch.", night: true };
  if (hour < 12) return { eyebrow: 'Morning', night: false };
  if (hour < 18) return { eyebrow: 'Afternoon', night: false };
  return { eyebrow: 'Evening', night: false };
}

/** Kip in the all-clear pane: the lantern on the night shift, watching while agents work, else napping. */
export function calmPose(working: number, hour: number): KipPose {
  if (greeting(hour).night) return 'lantern';
  return working > 0 ? 'watching' : 'napping';
}

/**
 * Whether anything warm may show or play: never while a person is needed. A beat that was waiting
 * (a pose still loading) asks again when it is ready and is dropped if a question came in meanwhile.
 */
export function quiet(needsYou: number): boolean {
  return needsYou === 0;
}

/** A task as a toast names it: its first line, cut at `max` characters. */
export function taskName(prompt: string, max = 60): string {
  const line = prompt.trim().split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 3).trimEnd()}...` : line;
}

/** The first job's toast: the task, then where it comes back. */
export function aboardWords(prompt: string): { text: string; sub: string } {
  return { text: `${taskName(prompt)} is aboard.`, sub: "It'll come back here when it needs you." };
}
