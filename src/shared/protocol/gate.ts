// The agent gate (see shared/gate.ts): agents' requests to act on other agents, waiting for a person,
// the standing grants that let some through, and the record of what agents did. Everyone hears the
// state (in the welcome, and on every change); an admin or the account the asking agent runs as
// decides a proposal, and only admins add or take back grants.

import type { GateAction, GateState } from '../gate.js';

export type { GateAction, GateActivity, GateOutcome, GateState, Grant, Proposal } from '../gate.js';

export type GateClientMsg =
  /** Approve or reject an agent's request; `note` is the reason, told to the agent when rejected. */
  | { t: 'gate.decide'; id: string; approve: boolean; note?: string }
  /** Admins: let agents on `floor` do `action` without asking (hires up to `limit` at once). */
  | { t: 'gate.grant'; floor: string; action: GateAction; limit?: number }
  /** Admins: take a grant back. */
  | { t: 'gate.revoke'; id: string };

export type GateServerMsg = { t: 'gate'; state: GateState };
