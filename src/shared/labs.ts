// Labs: the parts of the office beyond the product's core loop, each behind one switch. Every lab is
// on as the office ships, so a new office shows all of it (the Deck first of all); an admin switches
// any of them off from the Labs window. The core loop is the inbox at /: see what needs you, answer,
// review, merge. Every lab's code stays compiled and tested; a lab that is off is only hidden (its
// menu rows, its settings pane, its routes), never deleted. A lab being on never asks the browser
// for anything by itself: the microphone and screen sharing wait for a click, sound for the first
// click or key, and Proof of Merge only talks to a testnet with its own flags and keys. Pure, so the
// server, the home page and the Deck all read the same table.

/** Every lab, in the order the Labs window lists them. */
export const LAB_IDS = ['boards', 'bridge', 'ops', 'meetings', 'voice', 'ambience', 'proof'] as const;
export type LabId = (typeof LAB_IDS)[number];

/** Which labs are on. */
export type Labs = Record<LabId, boolean>;

/** What a person reads in the Labs window: a name, one line on what turning it on brings back. */
export const LAB_META: Readonly<Record<LabId, { name: string; what: string }>> = {
  boards: { name: 'GitHub boards and queue', what: "Issues, Pull requests, the Task queue and Mission control in the home page's menu and commands. The inbox already shows every agent's pull request and checks." },
  bridge: { name: 'Deck (3D)', what: 'Enter the Deck from the home page: your agents at their stations on a 3D starship bridge (/deck), and the deck plan in the pane while no agent is selected. The Deck works as a wall display for a team room.' },
  ops: { name: 'Goals and timeline', what: 'Goals and milestones, the Timeline and Crew tabs in Mission control, and the Services board.' },
  meetings: { name: 'Meetings', what: 'The Review bay, where agents work through a question together, and the planning whiteboard.' },
  voice: { name: 'Voice', what: 'Voice chat, screen sharing, and the dictation mic in prompt boxes and terminals. The browser asks for the microphone or screen only when you click to use them.' },
  ambience: { name: 'Deck ambience', what: 'The Deck in full: the mascot, ship voice, gloved hands, the lounge, rituals, celebrations, ship motion and soundscape. Sound starts with your first click or key.' },
  proof: { name: 'Proof of Merge (testnets)', what: 'Devnet bounties and payouts, attestations on Base Sepolia, ERC-8004 reputation, x402 paid tasks and the public ledger at /pom/. Testnets only, and nothing goes on chain until an admin sets up its keys and flags.' },
};

/** Everything on: the office as it ships. An admin's labs.json overrides any of them. */
export function defaultLabs(): Labs {
  return Object.fromEntries(LAB_IDS.map((id) => [id, true])) as Labs;
}

export const isLabId = (v: unknown): v is LabId => LAB_IDS.includes(v as LabId);

/**
 * "bridge, proof" or "bridge,proof" (a --labs value or AGENT_OFFICE_LABS) to the labs it names:
 * `all` names every one. A name with a leading minus ("-proof") is held off instead, and `none`
 * holds every one off. Unknown names are returned apart.
 */
export function parseLabList(text: string | undefined): { on: LabId[]; off: LabId[]; unknown: string[] } {
  const on: LabId[] = [];
  const off: LabId[] = [];
  const unknown: string[] = [];
  for (const word of (text ?? '').split(/[\s,]+/).filter(Boolean)) {
    const w = word.toLowerCase();
    const minus = w.startsWith('-');
    const name = minus ? w.slice(1) : w;
    if (w === 'all') on.push(...LAB_IDS);
    else if (w === 'none') off.push(...LAB_IDS);
    else if (isLabId(name)) (minus ? off : on).push(name);
    else unknown.push(word);
  }
  return { on: [...new Set(on)], off: [...new Set(off)], unknown };
}

/** Labs as read back from a file or sent by a browser: only known labs, only booleans; the rest as `base` has them. */
export function cleanLabs(raw: unknown, base: Labs = defaultLabs()): Labs {
  const out = { ...base };
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isLabId(k) && typeof v === 'boolean') out[k] = v;
  return out;
}

/** What the office says about its labs: which are on, and which the command line holds on or off (they can't be switched from a browser). */
export interface LabsState {
  on: Labs;
  /** Labs turned on by --labs, AGENT_OFFICE_LABS or a chain flag such as --x402. */
  forced: LabId[];
  /** Labs held off by --labs -name or --labs none (or the same in AGENT_OFFICE_LABS). */
  heldOff?: LabId[];
  by?: string;
  at?: number;
}

/** Is `id` on? Missing state (a page that hasn't heard from the office yet) counts as off, so nothing shows and then hides. */
export const labOn = (state: Pick<LabsState, 'on'> | undefined, id: LabId): boolean => !!state?.on[id];
