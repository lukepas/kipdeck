// Every slice of the store, the core's included, in the one order the store runs them in: the order
// they take in each message and each floor you arrive on, and so the order their topics fire in. On
// `welcome`, the floor's topics fire from `floor` on down, then everyone else's from the top; on every
// other message, the topics fire top to bottom. That's the order the
// office has always fired them in, so a new slice goes at the end.
//
// Each slice's module also adds its fields and topics to Store and Topics (see ../store.ts), which only
// happens for a module that's imported: here.

import type { Slice } from '../store';
import { building, floor, me, presence } from '../core';
import { accounts } from './accounts';
import { floorPlan } from './floor-plan';
import { leaveOnMerge } from './leave-on-merge';
import { machine } from './machine';
import { meeting } from './meeting';
import { mission } from './mission';
import { notify } from './notify';
import { prompts } from './prompts';
import { services } from './services';
import { signins } from './signins';
import { team } from './team';
import { timeline } from './timeline';
import { upgrade } from './upgrade';
import { usage } from './usage';
import { whiteboard } from './whiteboard';

export const SLICES: readonly Slice[] = [
  presence,
  upgrade,
  usage,
  me,
  notify,
  machine,
  building,
  prompts,
  leaveOnMerge,
  floor,
  meeting,
  floorPlan,
  services,
  whiteboard,
  team,
  accounts,
  signins,
  mission,
  timeline,
];
