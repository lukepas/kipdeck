// Kip's moments: one module per section, keyed by the section's data-scene, the same pattern as
// scenes/index.ts (a new section's moment plugs in here, nowhere else). A moment never edits its
// section; it only watches the hooks the scenes already leave (classes, the page's wait, events)
// and places Kip where the clearance check allows.
import type { Moment } from './kinds';
import { hero } from './hero';
import { funnel } from './funnel';
import { problem } from './problem';
import { loop } from './loop';
import { why } from './why';
import { yours } from './yours';
import { phone } from './phone';
import { numbers } from './numbers';
import { labs } from './labs';
import { teams } from './teams';
import { end } from './end';

// They are small, so they ship in Kip's one lazy chunk rather than a chunk each.
export const MOMENTS: Record<string, Moment> = { hero, funnel, problem, loop, why, yours, phone, numbers, labs, teams, end };

