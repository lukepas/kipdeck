// When Proof of Merge has anything to show. The lab being on is not enough: until an admin sets up
// bounties (Settings > Bounties) or starts the office with a chain flag (--attest, --reputation or
// --x402, which hold the lab on from the command line), there is no chain behind it, so the Proof
// corner on the deck plan and the Deck, the ledger's menu row and the payout counter stay hidden. The
// Bounties settings pane itself shows with the lab on, since that is where it gets set up. Pure, so
// the home page and the Deck read the same rule.
import { labOn, type LabsState } from './labs.js';
import type { BountiesState } from './protocol/bounties.js';
import type { ReputationState } from './protocol/reputation.js';

export interface ProofSources {
  labs: LabsState | undefined;
  /** Every floor's bounties the page has heard of. */
  bounties: Readonly<Record<string, BountiesState | undefined>> | undefined;
  reputation: ReputationState | undefined;
}

/** Is Proof of Merge on and set up? */
export function proofReady(s: ProofSources): boolean {
  if (!labOn(s.labs, 'proof')) return false;
  if (s.labs?.forced.includes('proof')) return true;
  if (s.reputation?.enabled) return true;
  return Object.values(s.bounties ?? {}).some((b) => !!b?.enabled);
}
