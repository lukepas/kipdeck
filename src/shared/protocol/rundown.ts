// Rundown (Labs): a map of each project's parts, milestones, activity and decisions (see
// shared/rundown/schema.ts). A page watches the floors it shows; the office computes a floor's rundown
// when someone watches it and sends it again whenever it changes.

import type { Rundown } from '../rundown/schema.js';

export type RundownClientMsg =
  /** Watch this floor's rundown: it comes now (or once computed) and again whenever it changes. Replaces any floor watched before. */
  | { t: 'rundown.watch'; floor: string }
  /** Stop watching. */
  | { t: 'rundown.unwatch' }
  /** Compute this floor's rundown again now (at most once every 30 s a floor). */
  | { t: 'rundown.refresh'; floor: string };

export type RundownServerMsg =
  /** A floor's rundown: null until the first one is computed; `computing` while a new one is on its way. */
  { t: 'rundown.state'; floor: string; rundown: Rundown | null; computing: boolean; error?: string };
