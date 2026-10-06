// Labs: the parts of the office that are not the product's core loop, each behind one switch that is
// off by default. The core loop is the inbox at /: see what needs you, answer, review, merge. Every
// lab's code stays compiled and tested; a lab that is off is only hidden (its menu rows, its
// settings pane, its routes), never deleted. Pure, so the server, the home page and the Bridge view
// all read the same table.

/** Every lab, in the order the Labs window lists them. */
export const LAB_IDS = ['bridge', 'ops', 'meetings', 'voice', 'ambience', 'proof'] as const;
export type LabId = (typeof LAB_IDS)[number];

/** Which labs are on. */
export type Labs = Record<LabId, boolean>;

/** What a person reads in the Labs window: a name, one line on what turning it on brings back. */
export const LAB_META: Readonly<Record<LabId, { name: string; what: string }>> = {
  bridge: { name: 'Bridge view', what: 'A link to the 3D bridge (/bridge) on the home page, and the deck plan in the pane while no agent is selected. The bridge works as a wall display for a team room.' },
  ops: { name: 'Goals and timeline', what: 'Goals and milestones, the Timeline and Crew tabs in Mission control, and the Services board.' },
  meetings: { name: 'Meetings', what: 'The Review bay, where agents work through a question together, and the planning whiteboard.' },
  voice: { name: 'Voice', what: 'Voice chat, screen sharing, and the dictation mic in prompt boxes and terminals.' },
  ambience: { name: 'Bridge ambience', what: 'The 3D bridge in full: the mascot, ship voice, gloved hands, the lounge, rituals, celebrations, ship motion and soundscape.' },
  proof: { name: 'Proof of Merge (testnets)', what: 'Devnet bounties and payouts, attestations on Base Sepolia, ERC-8004 reputation, x402 paid tasks and the public ledger at /pom/.' },
};

/** Everything off: the office as it ships. */
export function defaultLabs(): Labs {
  return Object.fromEntries(LAB_IDS.map((id) => [id, false])) as Labs;
}

export const isLabId = (v: unknown): v is LabId => LAB_IDS.includes(v as LabId);

/** "bridge, proof" or "bridge,proof" (a --labs value or AGENT_OFFICE_LABS) to the labs it names; `all` names every one. Unknown names are returned apart. */
export function parseLabList(text: string | undefined): { on: LabId[]; unknown: string[] } {
  const on: LabId[] = [];
  const unknown: string[] = [];
  for (const word of (text ?? '').split(/[\s,]+/).filter(Boolean)) {
    const w = word.toLowerCase();
    if (w === 'all') on.push(...LAB_IDS);
    else if (isLabId(w)) on.push(w);
    else unknown.push(word);
  }
  return { on: [...new Set(on)], unknown };
}

/** Labs as read back from a file or sent by a browser: only known labs, only booleans; the rest as `base` has them. */
export function cleanLabs(raw: unknown, base: Labs = defaultLabs()): Labs {
  const out = { ...base };
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isLabId(k) && typeof v === 'boolean') out[k] = v;
  return out;
}

/** What the office says about its labs: which are on, and which the command line holds on (they can't be switched off from a browser). */
export interface LabsState {
  on: Labs;
  /** Labs turned on by --labs, AGENT_OFFICE_LABS or a chain flag such as --x402. */
  forced: LabId[];
  by?: string;
  at?: number;
}

/** Is `id` on? Missing state (a page that hasn't heard yet) counts as off. */
export const labOn = (state: Pick<LabsState, 'on'> | undefined, id: LabId): boolean => !!state?.on[id];
