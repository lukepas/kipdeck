// The agent gate: what one agent does to another (deploying a new one, typing a message to one,
// sending some home) waits for a person, unless a standing grant covers it. The rules are pure and
// here, so the server, the inbox and the tests read the same ones (server/gate/, home/proposals.ts,
// ui/gate-settings.ts, docs/agent-gate.md).

/** What an agent can do to other agents through office-workers. */
export const GATE_ACTIONS = ['hire', 'tell', 'home'] as const;
export type GateAction = (typeof GATE_ACTIONS)[number];

/** Each action in a few words, for a setting's picker and the activity list. */
export const GATE_ACTION_LABEL: Record<GateAction, string> = {
  hire: 'Deploy a new agent',
  tell: 'Message another agent',
  home: 'Stop and remove agents',
};

/** The most a hire grant can allow at once: past that, a cap means little. */
export const GATE_LIMIT_MAX = 50;

/** How many lines of agent activity the office keeps. */
export const GATE_ACTIVITY_MAX = 300;

/** The most requests one agent may have waiting for a person at once. */
export const GATE_PENDING_MAX = 5;

/** The longest reason a person can give for a rejection. */
export const GATE_NOTE_MAX = 500;

/** An agent's request that waits for a person: who asks, what, to whom, and the full text. */
export interface Proposal {
  id: string;
  floor: string;
  floorName: string;
  action: GateAction;
  /** The proposing agent: its id, its name and its task as the inbox shows it. */
  by: { id: string; name: string; task?: string };
  /** The agents it acts on, by name (tell and home). */
  targets?: string[];
  /** Everyone whose pull request merged, rather than named agents (home). */
  merged?: boolean;
  /** The new agent's task (hire) or the message (tell), in full. */
  text?: string;
  /** Anything else it asked for: the agent CLI, model, issue, what happens to worktrees. */
  details?: string[];
  at: number;
}

/** A standing yes: agents on `floor` may do `action` without asking, up to `limit` at once for hires. */
export interface Grant {
  id: string;
  floor: string;
  action: GateAction;
  /** Hires only: the most agent-deployed agents running at once on the project. */
  limit?: number;
  by: string;
  at: number;
}

/** How an agent's request ended up. */
export type GateOutcome = 'proposed' | 'approved' | 'rejected' | 'granted' | 'failed';

/** A line of the activity record: every agent-initiated action, whether it ran and who said so. */
export interface GateActivity {
  id: string;
  at: number;
  floor: string;
  floorName: string;
  action: GateAction;
  /** The agent that asked. */
  by: string;
  /** Whom it was for, in words ("Nova", "everyone whose pull request merged"). */
  target?: string;
  /** What it asked, cut short. */
  summary?: string;
  outcome: GateOutcome;
  /** The person who approved or rejected it, or the grant's author when one covered it. */
  decidedBy?: string;
  /** What came of it: the error, or the reason it was rejected. */
  note?: string;
}

/** What every page hears about the gate. */
export interface GateState {
  proposals: Proposal[];
  grants: Grant[];
  activity: GateActivity[];
}

export const emptyGate = (): GateState => ({ proposals: [], grants: [], activity: [] });

/** Whom a proposal is for, in words. */
export function targetWords(p: Pick<Proposal, 'action' | 'targets' | 'merged'>): string {
  if (p.action === 'hire') return 'a new agent';
  if (p.merged) return 'every agent whose pull request merged';
  const t = p.targets ?? [];
  if (t.length <= 3) return t.join(', ') || 'nobody';
  return `${t.slice(0, 3).join(', ')} and ${t.length - 3} more`;
}

/** The agent that asks, as the inbox names it: its task, else its name. */
export const proposerName = (p: Pick<Proposal, 'by'>): string => p.by.task || p.by.name;

/** A proposal in one line: "Fix the login wants to deploy a new agent". */
export function proposalTitle(p: Proposal): string {
  const who = proposerName(p);
  if (p.action === 'hire') return `${who} wants to deploy a new agent`;
  if (p.action === 'tell') return `${who} wants to message ${targetWords(p)}`;
  return `${who} wants to stop and remove ${targetWords(p)}`;
}
