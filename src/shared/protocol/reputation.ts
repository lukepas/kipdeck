// Merge-based agent reputation in Mission control (see server/chain/reputation.ts): each office agent
// identity, its ERC-8004 agent id, and its record from the merges, reverts and closes people caused.

import type { RepStats } from '../reputation.js';

/** One agent identity: a (harness, operator, label) the office's workers run as. */
export interface AgentRepView {
  /** harness/operator/label. */
  key: string;
  harness: string;
  operator: string;
  label: string;
  /** Its ERC-8004 agent id on Base Sepolia, once registered. */
  agentId?: string;
  /** Its agent card (the registration file), served by the office at /agents/<id>.json. */
  card?: string;
  /** Its registration transaction on basescan. */
  registered?: string;
  /** Its record, once anything of it was attested. */
  stats?: RepStats;
  /** Workers on the roster running as it now. */
  workers: string[];
}

export interface ReputationState {
  /** The office runs with --reputation (and --attest). */
  enabled: boolean;
  agents: AgentRepView[];
  /** The board per harness, over all time. */
  harnesses: RepStats[];
  /** Attestations and feedback the office still owes the chain. */
  owed: number;
}

export type ReputationClientMsg =
  /** What the agents' records are now (Mission control asks when it opens). */
  { t: 'reputation.get' };

export type ReputationServerMsg =
  /** The agents' records: sent when asked, and to everyone when one changes. */
  { t: 'reputation'; state: ReputationState };
