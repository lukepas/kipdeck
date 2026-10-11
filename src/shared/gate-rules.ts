// The agent gate's rules (see shared/gate.ts): which grant covers a request, reading grants and
// limits, what the agent is told, and the activity record in words. Kept apart from gate.ts so the
// inbox's first load carries only what draws a request's row; the server and Settings read these.

import { GATE_ACTIONS, GATE_LIMIT_MAX, targetWords, type GateAction, type GateActivity, type GateOutcome, type Grant, type Proposal } from './gate.js';

/**
 * The grant that lets an agent on `floor` do `action` now, if any. `running` is how many agents
 * other agents deployed are still at work on the project: a hire grant with a limit covers one more
 * only while that's under it.
 */
export function grantFor(grants: readonly Grant[], floor: string, action: GateAction, running = 0): Grant | undefined {
  return grants.find((g) => g.floor === floor && g.action === action && (action !== 'hire' || g.limit === undefined || running < g.limit));
}

/** A grant as sent or saved, cleaned; undefined when it isn't one. */
export function cleanGrant(raw: unknown): Grant | undefined {
  const g = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
  if (!g || typeof g.id !== 'string' || typeof g.floor !== 'string' || !g.floor) return undefined;
  if (!GATE_ACTIONS.includes(g.action as GateAction)) return undefined;
  const limit = readLimit(g.limit);
  if (typeof limit === 'string') return undefined;
  return {
    id: g.id.slice(0, 32),
    floor: g.floor.slice(0, 128),
    action: g.action as GateAction,
    ...(limit !== undefined && g.action === 'hire' ? { limit } : {}),
    by: typeof g.by === 'string' ? g.by.slice(0, 64) : 'someone',
    at: typeof g.at === 'number' ? g.at : 0,
  };
}

/** A hire limit as typed: undefined for none, a whole number from 1 to GATE_LIMIT_MAX, or why not. */
export function readLimit(raw: unknown): number | undefined | string {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > GATE_LIMIT_MAX) return `The limit is a whole number from 1 to ${GATE_LIMIT_MAX}, or empty for no limit`;
  return n;
}

/** Text cut to `max` characters on one line, for a summary. */
export function gist(text: string | undefined, max = 120): string | undefined {
  if (!text) return undefined;
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 3)}...` : one;
}

/** What the proposing agent is told when a person decides, in its own session. */
export function decisionMessage(p: Proposal, approved: boolean, who: string, result?: string, note?: string): string {
  const what = p.action === 'hire' ? 'deploy a new agent' : p.action === 'tell' ? `message ${targetWords(p)}` : `send ${targetWords(p)} home`;
  if (approved) return `[Kipdeck] ${who} approved your request to ${what} (proposal ${p.id}). ${result ?? ''}`.trim();
  return (
    `[Kipdeck] ${who} rejected your request to ${what} (proposal ${p.id}), so it did not happen.` +
    (note ? ` Their reason: ${/[.!?]$/.test(note) ? note : `${note}.`}` : '') +
    ' Do not ask again for the same thing unless a person tells you to; carry on with your own task.'
  );
}

/** What an agent is told when its request has to wait for a person. */
export function waitingMessage(p: Proposal): string {
  return (
    `A person has to approve this first: it waits in their Kipdeck inbox as proposal ${p.id}. Nothing has happened yet. ` +
    "You'll get a message in this session saying whether it was approved, and what came of it. Carry on with your own task meanwhile, and don't send the same request again."
  );
}

/** A line of the activity record in words, for Settings: "Fix the login: deploy a new agent, approved by Ada". */
export function activityLine(a: GateActivity): string {
  const did = a.action === 'hire' ? 'deploy a new agent' : a.action === 'tell' ? `message ${a.target ?? 'an agent'}` : `send ${a.target ?? 'agents'} home`;
  const base = `${a.by}: ${did}`;
  const by = a.decidedBy ? ` by ${a.decidedBy}` : '';
  switch (a.outcome) {
    case 'proposed':
      return `${base}, waiting for a person`;
    case 'approved':
      return `${base}, approved${by}`;
    case 'rejected':
      return `${base}, rejected${by}${a.note ? ` ("${a.note}")` : ''}`;
    case 'granted':
      return `${base}, allowed by a standing permission${a.decidedBy ? ` from ${a.decidedBy}` : ''}`;
    case 'failed':
      return `${base}, failed${a.note ? `: ${a.note}` : ''}`;
  }
}
