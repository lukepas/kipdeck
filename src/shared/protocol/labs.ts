// Labs (see shared/labs.ts): which parts beyond the inbox are switched on. Everyone is told which are
// on (the welcome carries it, and a change goes to everyone); only admins switch them.

import type { LabId, LabsState } from '../labs.js';

export type { LabId, Labs, LabsState } from '../labs.js';

export type LabsClientMsg =
  /** Admins: switch labs on or off. A lab held on from the command line stays on. */
  { t: 'labs.set'; patch: Partial<Record<LabId, boolean>> };

export type LabsServerMsg = { t: 'labs'; state: LabsState };
