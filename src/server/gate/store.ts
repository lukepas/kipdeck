// What the agent gate keeps (see shared/gate.ts): the requests waiting for a person, the standing
// grants, which agents other agents deployed (for a hire grant's limit), and the activity record of
// every agent-initiated action. All of it is kept in the office's data folder as agent-gate.json, so
// a restart loses neither a waiting request nor the record.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { cleanGrant, grantFor } from '../../shared/gate-rules.js';
import { GATE_ACTIONS, GATE_ACTIVITY_MAX, type GateAction, type GateActivity, type GateOutcome, type GateState, type Grant, type Proposal } from '../../shared/gate.js';
import { readStateJson, writeState } from '../safefs.js';
import type { GateRequest } from './actions.js';

/** A proposal as the office keeps it: with the request to run once approved, and whose agent asked. */
export interface Pending extends Proposal {
  req: GateRequest;
  /** The account the proposing agent runs as, if not the office. */
  owner?: string;
}

interface Saved {
  v: 1;
  pending: Pending[];
  grants: Grant[];
  hired: Record<string, string[]>;
  activity: GateActivity[];
}

const newId = () => randomBytes(5).toString('hex');

export class AgentGate {
  private pending: Pending[] = [];
  private grants: Grant[] = [];
  private hired = new Map<string, Set<string>>();
  /** Hires a grant let through that haven't started yet, per floor: they count towards its limit too. */
  private starting = new Map<string, number>();
  private activity: GateActivity[] = [];
  private readonly file?: string;

  /** `dataDir` undefined keeps nothing on disk (tests). `onState` hears every change. */
  constructor(
    dataDir: string | undefined,
    private readonly onState: (state: GateState) => void = () => {},
  ) {
    this.file = dataDir ? path.join(dataDir, 'agent-gate.json') : undefined;
    this.restore();
  }

  /** What every page is told: the proposals without what the office runs, the grants and the record. */
  state(): GateState {
    return {
      proposals: this.pending.map(({ req: _req, owner: _owner, ...p }) => p),
      grants: this.grants.map((g) => ({ ...g })),
      activity: this.activity.slice(0, 50),
    };
  }

  /** The whole activity record, newest first. */
  record(): GateActivity[] {
    return this.activity.slice();
  }

  get(id: string): Pending | undefined {
    return this.pending.find((p) => p.id === id);
  }

  /** How many agents that agents deployed are still at work on `floor`. */
  running(floor: string, alive: (workerId: string) => boolean): number {
    const ids = this.hired.get(floor);
    if (!ids) return 0;
    const before = ids.size;
    for (const id of ids) if (!alive(id)) ids.delete(id);
    if (ids.size !== before) this.changed(false);
    return ids.size;
  }

  /** The grant that lets an agent on `floor` do `action` now, if one does. */
  covers(floor: string, action: GateAction, alive: (workerId: string) => boolean): Grant | undefined {
    return grantFor(this.grants, floor, action, action === 'hire' ? this.running(floor, alive) + (this.starting.get(floor) ?? 0) : 0);
  }

  /**
   * Holds a place under a hire grant's limit while that hire starts (it waits on the fetch of its
   * base before it counts as running), so hires asked at the same moment can't all slip under the
   * limit. Call the returned function once the hire has started or failed.
   */
  holdHire(floor: string): () => void {
    this.starting.set(floor, (this.starting.get(floor) ?? 0) + 1);
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      const n = (this.starting.get(floor) ?? 1) - 1;
      if (n > 0) this.starting.set(floor, n);
      else this.starting.delete(floor);
    };
  }

  /** An agent deployed `workerId` on `floor`: it counts towards a hire grant's limit while it works. */
  noteHired(floor: string, workerId: string) {
    let ids = this.hired.get(floor);
    if (!ids) this.hired.set(floor, (ids = new Set()));
    ids.add(workerId);
    this.changed(false);
  }

  /** A request waits for a person: it's in everyone's Needs you, and on the record as asked. */
  propose(p: Omit<Pending, 'id' | 'at'>): Pending {
    const made: Pending = { ...p, id: newId(), at: Date.now() };
    this.pending.push(made);
    this.note({ id: made.id, floor: made.floor, floorName: made.floorName, action: made.action, by: made.by.task || made.by.name, ...targetOf(made), outcome: 'proposed' });
    this.changed();
    return made;
  }

  /** Takes a proposal off the waiting list, so nobody decides it twice; undefined when it's gone. */
  take(id: string): Pending | undefined {
    const i = this.pending.findIndex((p) => p.id === id);
    if (i < 0) return undefined;
    const [p] = this.pending.splice(i, 1);
    this.changed();
    return p;
  }

  /** How a proposal ended, on its line of the record. */
  settle(p: Proposal, outcome: GateOutcome, decidedBy: string, note?: string) {
    const line = this.activity.find((a) => a.id === p.id);
    const now = { outcome, decidedBy: decidedBy.slice(0, 64), ...(note ? { note: note.slice(0, 500) } : {}) };
    if (line) Object.assign(line, now, { at: Date.now() });
    else this.note({ id: p.id, floor: p.floor, floorName: p.floorName, action: p.action, by: p.by.task || p.by.name, ...targetOf(p), ...now });
    this.changed();
  }

  /** A line of the record for an action no person was asked about (a grant covered it). */
  log(a: Omit<GateActivity, 'id' | 'at'>): GateActivity {
    const line = this.note({ ...a, id: newId() });
    this.changed();
    return line;
  }

  /** Lets agents on `floor` do `action` without asking; it replaces one for the same two. */
  grant(floor: string, action: GateAction, limit: number | undefined, by: string): Grant {
    const g = cleanGrant({ id: newId(), floor, action, limit, by, at: Date.now() })!;
    this.grants = [...this.grants.filter((x) => !(x.floor === floor && x.action === action)), g];
    this.changed();
    return g;
  }

  /** Takes a grant back, and says which it was; undefined when there was none. */
  revoke(id: string): Grant | undefined {
    const g = this.grants.find((x) => x.id === id);
    if (!g) return undefined;
    this.grants = this.grants.filter((x) => x !== g);
    this.changed();
    return g;
  }

  private note(a: Omit<GateActivity, 'at'>): GateActivity {
    const line: GateActivity = { ...a, at: Date.now() };
    this.activity.unshift(line);
    if (this.activity.length > GATE_ACTIVITY_MAX) this.activity.length = GATE_ACTIVITY_MAX;
    return line;
  }

  private changed(tell = true) {
    if (this.file) {
      const saved: Saved = { v: 1, pending: this.pending, grants: this.grants, hired: Object.fromEntries([...this.hired].map(([f, ids]) => [f, [...ids]])), activity: this.activity };
      try {
        writeState(this.file, JSON.stringify(saved));
      } catch {
        // disk issues shouldn't take the office down
      }
    }
    if (tell) this.onState(this.state());
  }

  private restore() {
    if (!this.file) return;
    let raw: Partial<Saved> | undefined;
    try {
      raw = readStateJson(this.file) as Partial<Saved> | undefined;
    } catch {
      return;
    }
    if (!raw || typeof raw !== 'object') return;
    this.grants = (Array.isArray(raw.grants) ? raw.grants : []).map(cleanGrant).filter((g): g is Grant => !!g);
    this.pending = (Array.isArray(raw.pending) ? raw.pending : []).filter((p) => p && typeof p.id === 'string' && GATE_ACTIONS.includes(p.action) && p.req && p.req.action === p.action);
    this.activity = (Array.isArray(raw.activity) ? raw.activity : []).filter((a) => a && typeof a.id === 'string' && GATE_ACTIONS.includes(a.action)).slice(0, GATE_ACTIVITY_MAX);
    for (const [f, ids] of Object.entries(raw.hired ?? {})) if (Array.isArray(ids)) this.hired.set(f, new Set(ids.filter((x) => typeof x === 'string')));
  }
}

/** Whom a proposal is for, and what it asks, for its line of the record. */
function targetOf(p: Proposal): Pick<GateActivity, 'target' | 'summary'> {
  const target = p.action === 'hire' ? undefined : p.merged ? 'everyone whose pull request merged' : (p.targets ?? []).join(', ');
  const summary = p.text ? p.text.replace(/\s+/g, ' ').trim().slice(0, 160) : undefined;
  return { ...(target ? { target } : {}), ...(summary ? { summary } : {}) };
}
