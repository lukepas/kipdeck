import { BEANBAGS, DESKS, DESK_BY_ID, MEETING_SEATS, STATIONS, WING_DESKS, cellOf, podOf } from './layout.js';
import type { AgentProvider } from './providers.js';

/*
 * A unit's address: its call sign (the seat it holds) and the grid cell it's in, as "A-03 at C4".
 * The letter is where the seat is: A to D for the pods round the mission table, O for the overflow
 * bay, S for the Standby bench, L for a board agent's lectern and R for a chair in the Review bay.
 * The number is the seat's place in that group. Pure, so the 3D deck, the 2D plot and the DOM all
 * call a unit the same thing.
 */

const GROUPS: readonly [string, readonly { id: string }[]][] = [
  ['O', WING_DESKS],
  ['S', BEANBAGS],
  ['L', STATIONS],
  ['R', MEETING_SEATS],
];

const two = (n: number) => String(n).padStart(2, '0');

/** "A-03" for the third console of pod A, "S-01" for the first Standby seat, "" for a seat the deck doesn't have. */
export function callSign(deskId: string): string {
  const pod = podOf(deskId);
  if (pod) {
    const i = DESKS.findIndex((d) => d.id === deskId);
    return `${pod}-${two((i % 4) + 1)}`;
  }
  for (const [letter, seats] of GROUPS) {
    const i = seats.findIndex((d) => d.id === deskId);
    if (i >= 0) return `${letter}-${two(i + 1)}`;
  }
  return '';
}

/** "A-03 at C4": the call sign and the cell its seat is in. Just the cell for a seat without a call sign. */
export function address(deskId: string): string {
  const d = DESK_BY_ID.get(deskId);
  if (!d) return '';
  const sign = callSign(deskId);
  const cell = cellOf(d.x, d.z);
  return sign ? `${sign} at ${cell}` : cell;
}

/**
 * The provider's glyph on a unit's visor: one or two letters, the same in every view. C Claude Code,
 * X Codex, P Pi, CU Cursor, and so on; a custom agent is a plus.
 */
export const PROVIDER_GLYPH: Record<AgentProvider, string> = {
  claude: 'C',
  opencode: 'OC',
  codex: 'X',
  grok: 'G',
  muse: 'M',
  dsh: 'DS',
  pi: 'P',
  cursor: 'CU',
  custom: '+',
};

/**
 * The stripe down a unit's back plate: a desaturated tint per provider, so a mixed pod reads at a
 * glance without any of them competing with the state colors.
 */
export const PROVIDER_STRIPE: Record<AgentProvider, string> = {
  claude: '#B9A58F',
  opencode: '#8FB9B3',
  codex: '#8FA3B9',
  grok: '#A0A6AD',
  muse: '#B98FA5',
  dsh: '#8F96B9',
  pi: '#9FB98F',
  cursor: '#A98FB9',
  custom: '#8A97A5',
};
