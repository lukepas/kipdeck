// A worker's record as the manager keeps it (see Worker in types.ts): what a new one is called, its
// colour, and the record itself, fresh from hiring or from workers.json.
import { DATA_COLORS } from '../../shared/datacolors.js';
import { randomBytes } from 'node:crypto';
import type { WorkerInfo } from '../../shared/protocol.js';
import { providerAdapter } from '../providers/index.js';
import type { UsageTracker } from '../usage.js';
import type { Worker } from './types.js';

export const NAMES = [
  'Pixel', 'Byte', 'Nibble', 'Sprocket', 'Widget', 'Gizmo', 'Bolt', 'Cosmo', 'Dot', 'Echo',
  'Fizz', 'Glitch', 'Hopper', 'Jinx', 'Kilo', 'Lumen', 'Mochi', 'Noodle', 'Orbit', 'Pip',
  'Quark', 'Rivet', 'Sparky', 'Tofu', 'Uno', 'Volt', 'Waffle', 'Zippy',
];
/** A new worker's color: the deck's data palette (shared/datacolors.ts). */
export const COLORS: readonly string[] = DATA_COLORS;

export function newWorker(info: WorkerInfo, tracker: UsageTracker, hookToken = randomBytes(16).toString('hex')): Worker {
  return {
    info,
    viewers: new Map(),
    screenDirty: true,
    lastLines: [],
    leftNeedsInputAt: 0,
    keyframeAt: 0,
    hookToken,
    state: providerAdapter(info.provider)?.createState?.(),
    failStreak: 0,
    prompts: [],
    tools: [],
    toolsSinceNamed: 0,
    namedAt: 0,
    taskEpoch: 0,
    tracker,
  };
}
