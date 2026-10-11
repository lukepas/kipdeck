// Spend and control (docs/spend.md): what agents cost today across every project, the budget caps
// that pause them, each project's default permission mode, and pausing, resuming or stopping agents
// in bulk. Kept in the office's data folder as spend.json. A pause interrupts the agent (Esc in its
// terminal) and holds it in Needs you (WorkerInfo.hold) until someone lets it carry on or stops it.
//
// Today's figure is the sum of every rise in an agent's reported cost seen today, whichever CLI it
// runs, so it covers Claude Code, OpenCode and anything else that prices its own usage. An agent
// whose CLI reports no cost isn't in it, and the inbox says how many those are.
import path from 'node:path';
import { isAutonomy, type Autonomy } from '../../shared/autonomy.js';
import type { Hold, ServerMsg, SpendState, WorkerInfo, WorktreeCleanup } from '../../shared/protocol.js';
import { budgetLevel, cleanCap, dayOf } from '../../shared/spend.js';
import { fmtCost } from '../../shared/protocol/usage.js';
import { readStateJson, writeState } from '../safefs.js';
import { setDefaultModes } from './launch.js';

/** How often spend is looked at against the caps. */
export const SPEND_SWEEP_MS = 5_000;
/** A paused agent seen at work again, with nobody having typed to it, is interrupted again at most this often. */
const NUDGE_MS = 30_000;
/** What an agent forgotten by every floor is still remembered for (a floor that hasn't opened yet). */
const FORGET_MS = 24 * 60 * 60_000;
/** What a paused agent is told when it may carry on. */
export const RESUME_PROMPT = 'continue - you were paused from Kipdeck. Pick up where you left off.';
const BUDGET_BY = 'Budget';

/** What the service needs of a floor's workers (WorkerManager has all of it). */
export interface SpendWorkers {
  list(): WorkerInfo[];
  get(id: string): WorkerInfo | undefined;
  write(id: string, data: string, by: string): void;
  prompt(id: string, text: string, by?: string): string | undefined;
  annotate(id: string, patch: { hold?: Hold }): unknown;
}

export interface SpendFloor {
  id: string;
  name: string;
  /** Its checkout, as the worker manager knows it. */
  dir: string;
  workers: SpendWorkers;
  sendHome(id: string, cleanup?: WorktreeCleanup): Promise<{ note?: string; error?: string }>;
}

export interface SpendDeps {
  /** Undefined keeps nothing on disk (tests). */
  dataDir?: string;
  floors(): Iterable<SpendFloor>;
  broadcast(msg: ServerMsg): void;
  toast(text: string, level?: 'info' | 'warn'): void;
  /** --budget: the daily cap until an admin sets one. */
  budget?: number;
  now?(): number;
}

interface Saved {
  v: 1;
  agentCap?: number;
  dayCap?: number;
  /** An admin set the caps: --budget no longer stands in for the daily one. */
  capsSet?: boolean;
  modes: Record<string, Autonomy>;
  by?: string;
  at?: number;
  day: string;
  today: number;
  /** Each agent's cost as last seen (`c`), and when it was last on a floor (`t`). */
  seen: Record<string, { c: number; t: number }>;
  holds: Record<string, Hold>;
  /** Room a budget hold's Continue gave an agent past the cap, in USD. */
  allow: Record<string, number>;
  /** Agents let carry on past today's cap, for the rest of `day`. */
  exempt: string[];
}

const INTERRUPT: Partial<Record<string, string[]>> = { opencode: ['\x1b', '\x1b'] };

export class Spend {
  private s: Saved;
  private readonly file?: string;
  private readonly now: () => number;
  private warned = new Map<string, number>();
  private warnedDay = '';
  private stoppedDay = '';
  private nudged = new Map<string, number>();
  private sentCents = -1;

  constructor(private deps: SpendDeps) {
    this.now = deps.now ?? Date.now;
    this.file = deps.dataDir ? path.join(deps.dataDir, 'spend.json') : undefined;
    this.s = this.load();
    setDefaultModes((dir) => {
      for (const f of deps.floors()) if (f.dir === dir) return this.s.modes[f.id];
      return undefined;
    });
  }

  private load(): Saved {
    let raw: Partial<Saved> = {};
    try {
      raw = ((this.file ? readStateJson(this.file) : undefined) ?? {}) as Partial<Saved>;
    } catch {
      // a broken file means the defaults
    }
    const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    const modes: Record<string, Autonomy> = {};
    for (const [k, v] of Object.entries(obj(raw.modes))) if (isAutonomy(v)) modes[k.slice(0, 64)] = v;
    const seen: Saved['seen'] = {};
    for (const [k, v] of Object.entries(obj(raw.seen))) {
      const e = obj(v);
      if (typeof e.c === 'number' && Number.isFinite(e.c) && typeof e.t === 'number') seen[k] = { c: e.c, t: e.t };
    }
    const holds: Saved['holds'] = {};
    for (const [k, v] of Object.entries(obj(raw.holds))) {
      const h = obj(v);
      if ((h.reason === 'paused' || h.reason === 'agent-cap' || h.reason === 'day-cap') && typeof h.at === 'number' && typeof h.by === 'string') {
        holds[k] = { reason: h.reason, at: h.at, by: h.by.slice(0, 64), ...(typeof h.cap === 'number' ? { cap: h.cap } : {}), ...(h.wasWorking === true ? { wasWorking: true } : {}) };
      }
    }
    const allow: Saved['allow'] = {};
    for (const [k, v] of Object.entries(obj(raw.allow))) if (typeof v === 'number' && Number.isFinite(v) && v > 0) allow[k] = v;
    const day = typeof raw.day === 'string' ? raw.day : dayOf(this.now());
    return {
      v: 1,
      ...(cleanCap(raw.agentCap) ? { agentCap: cleanCap(raw.agentCap) } : {}),
      ...(cleanCap(raw.dayCap) ? { dayCap: cleanCap(raw.dayCap) } : {}),
      ...(raw.capsSet === true ? { capsSet: true } : {}),
      modes,
      ...(typeof raw.by === 'string' ? { by: raw.by.slice(0, 64) } : {}),
      ...(typeof raw.at === 'number' ? { at: raw.at } : {}),
      day,
      today: typeof raw.today === 'number' && Number.isFinite(raw.today) && raw.today > 0 ? raw.today : 0,
      seen,
      holds,
      allow,
      exempt: Array.isArray(raw.exempt) ? raw.exempt.filter((x): x is string => typeof x === 'string').slice(0, 500) : [],
    };
  }

  private save() {
    if (!this.file) return;
    try {
      writeState(this.file, JSON.stringify(this.s, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }

  /** The daily cap in force: an admin's, else --budget. */
  private dayCap(): number | undefined {
    return this.s.capsSet ? this.s.dayCap : (this.s.dayCap ?? cleanCap(this.deps.budget));
  }

  state(): SpendState {
    const dayCap = this.dayCap();
    return {
      day: this.s.day,
      today: Math.round(this.s.today * 10_000) / 10_000,
      ...(this.s.agentCap ? { agentCap: this.s.agentCap } : {}),
      ...(dayCap ? { dayCap } : {}),
      modes: { ...this.s.modes },
      ...(this.s.by ? { by: this.s.by } : {}),
      ...(this.s.at ? { at: this.s.at } : {}),
    };
  }

  private changed() {
    this.save();
    this.sentCents = Math.round(this.s.today * 100);
    this.deps.broadcast({ t: 'spend', state: this.state() });
  }

  /** An admin's caps (the caller checks they are one). A field left out stays; null clears it. */
  setCaps(patch: { agentCap?: unknown; dayCap?: unknown }, by: string) {
    const dayBefore = this.dayCap();
    if (patch.agentCap !== undefined) this.s.agentCap = cleanCap(patch.agentCap);
    if (patch.dayCap !== undefined) {
      this.s.dayCap = cleanCap(patch.dayCap);
      this.s.capsSet = true;
    } else if (!this.s.capsSet) this.s.dayCap = dayBefore;
    this.s.capsSet = true;
    this.s.by = by.slice(0, 64);
    this.s.at = this.now();
    // New caps: warn again against them.
    this.warned.clear();
    this.warnedDay = '';
    this.stoppedDay = '';
    this.changed();
  }

  /** An admin's default mode for a project (null: its agents' own settings). Says why not, if it can't. */
  setMode(floor: string, mode: unknown, by: string): string | undefined {
    if (![...this.deps.floors()].some((f) => f.id === floor)) return 'No such project';
    if (mode === null) delete this.s.modes[floor];
    else if (isAutonomy(mode)) this.s.modes[floor] = mode;
    else return 'Unknown mode';
    this.s.by = by.slice(0, 64);
    this.s.at = this.now();
    this.changed();
    return undefined;
  }

  private find(id: string): { floor: SpendFloor; info: WorkerInfo } | undefined {
    for (const floor of this.deps.floors()) {
      const info = floor.workers.get(id);
      if (info) return { floor, info };
    }
    return undefined;
  }

  private interrupt(floor: SpendFloor, info: WorkerInfo, by: string) {
    for (const key of INTERRUPT[info.provider ?? ''] ?? ['\x1b']) floor.workers.write(info.id, key, by);
    this.nudged.set(info.id, this.now());
  }

  private hold(floor: SpendFloor, info: WorkerInfo, hold: Omit<Hold, 'at' | 'wasWorking'>) {
    const working = info.status === 'working';
    if (working) this.interrupt(floor, info, hold.by);
    const h: Hold = { ...hold, at: this.now(), ...(working ? { wasWorking: true } : {}) };
    this.s.holds[info.id] = h;
    floor.workers.annotate(info.id, { hold: h });
  }

  /** Pauses the agents among `ids` that are at work. Returns the ones it paused. */
  pause(ids: readonly string[], by: string): string[] {
    const done: string[] = [];
    for (const id of new Set(ids)) {
      const w = this.find(id);
      if (!w || w.info.kind !== 'agent' || w.info.hold || w.info.status !== 'working') continue;
      this.hold(w.floor, w.info, { reason: 'paused', by: by.slice(0, 64) });
      done.push(id);
    }
    if (done.length) this.save();
    return done;
  }

  /**
   * Lets the held agents among `ids` carry on: one that was at work is told to, one a budget held gets
   * another cap's worth of room (or the rest of the day, past today's cap). Returns the ones it let go.
   */
  resume(ids: readonly string[], by: string): string[] {
    const done: string[] = [];
    for (const id of new Set(ids)) {
      const w = this.find(id);
      const hold = w?.info.hold;
      if (!w || !hold) continue;
      this.release(w.floor, w.info, hold);
      if (hold.wasWorking && w.info.status !== 'working' && w.info.status !== 'needs_input') w.floor.workers.prompt(id, RESUME_PROMPT, by);
      done.push(id);
    }
    if (done.length) this.save();
    return done;
  }

  private release(floor: SpendFloor, info: WorkerInfo, hold: Hold) {
    if (hold.reason === 'agent-cap') this.s.allow[info.id] = Math.max(0, info.usage?.cost ?? 0);
    if (hold.reason === 'day-cap' && !this.s.exempt.includes(info.id)) this.s.exempt.push(info.id);
    delete this.s.holds[info.id];
    this.warned.delete(info.id);
    floor.workers.annotate(info.id, { hold: undefined });
  }

  /** Ends the sessions of the agents among `ids`, keeping their branches. Returns the ones it stopped. */
  stop(ids: readonly string[], onDone?: (floor: SpendFloor, r: { note?: string; error?: string }) => void): string[] {
    const done: string[] = [];
    for (const id of new Set(ids)) {
      const w = this.find(id);
      if (!w || w.info.kind !== 'agent') continue;
      delete this.s.holds[id];
      void w.floor.sendHome(id, 'keep').then((r) => onDone?.(w.floor, r));
      done.push(id);
    }
    if (done.length) this.save();
    return done;
  }

  /** Looks at every agent's spend against the caps, and at the paused ones. On a clock (office/timers.ts). */
  sweep() {
    const now = this.now();
    const s = this.s;
    let dirty = false;
    const day = dayOf(now);
    if (day !== s.day) {
      s.day = day;
      s.today = 0;
      s.exempt = [];
      dirty = true;
    }
    const startOfDay = new Date(now).setHours(0, 0, 0, 0);
    const agents: { floor: SpendFloor; info: WorkerInfo }[] = [];
    for (const floor of this.deps.floors()) for (const info of floor.workers.list()) if (info.kind === 'agent') agents.push({ floor, info });

    for (const { floor, info } of agents) {
      const id = info.id;
      const cost = info.usage && info.usage.costKnown !== false ? info.usage.cost : undefined;
      const seen = s.seen[id];
      if (cost !== undefined) {
        // A new agent counts from nothing; one first seen from before today (an older office) doesn't count backwards.
        const before = seen?.c ?? (info.createdAt >= startOfDay ? 0 : cost);
        if (cost > before) s.today += cost - before;
        if (!seen || seen.c !== cost) dirty = true;
        s.seen[id] = { c: cost, t: now };
      } else if (seen) seen.t = now;
      // A hold kept across a restart goes back on the worker.
      const saved = s.holds[id];
      if (saved && !info.hold) floor.workers.annotate(id, { hold: saved });
      const hold = info.hold ?? saved;
      if (hold) {
        if (info.status === 'working' && this.heldAtWork(floor, info, hold)) dirty = true;
        continue;
      }
      if (cost === undefined || !s.agentCap) continue;
      const cap = s.agentCap + (s.allow[id] ?? 0);
      const level = budgetLevel(cost, cap);
      const name = info.task?.name || info.name;
      if (level === 'over' && info.status === 'working') {
        this.hold(floor, info, { reason: 'agent-cap', by: BUDGET_BY, cap });
        this.deps.toast(`${name} reached its ${fmtCost(cap)} budget and is paused`, 'warn');
        dirty = true;
      } else if (level !== 'ok' && this.warned.get(id) !== cap) {
        this.warned.set(id, cap);
        if (level === 'warn') this.deps.toast(`${name} has spent ${fmtCost(cost)} of its ${fmtCost(cap)} budget`, 'warn');
      }
    }

    const dayCap = this.dayCap();
    const level = budgetLevel(s.today, dayCap);
    if (dayCap && level !== 'ok') {
      if (this.warnedDay !== `${day}:${dayCap}`) {
        this.warnedDay = `${day}:${dayCap}`;
        if (level === 'warn') this.deps.toast(`Agents have spent ${fmtCost(s.today)} of today's ${fmtCost(dayCap)} budget`, 'warn');
      }
      if (level === 'over') {
        const paused = agents.filter(({ info }) => info.status === 'working' && !info.hold && !s.holds[info.id] && !s.exempt.includes(info.id));
        for (const { floor, info } of paused) this.hold(floor, info, { reason: 'day-cap', by: BUDGET_BY, cap: dayCap });
        if (paused.length) dirty = true;
        if (paused.length && this.stoppedDay !== `${day}:${dayCap}`) {
          this.stoppedDay = `${day}:${dayCap}`;
          this.deps.toast(`Today's ${fmtCost(dayCap)} budget is spent: ${paused.length === 1 ? '1 agent is' : `${paused.length} agents are`} paused`, 'warn');
        }
      }
    }

    // Forget what's kept of agents that are gone: a hold at once (once any floor is open), the rest
    // after a day (their project may only be closed for now).
    const live = new Set(agents.map((a) => a.info.id));
    for (const id of Object.keys(s.holds)) {
      if (live.has(id) || !agents.length) continue;
      delete s.holds[id];
      dirty = true;
    }
    for (const id of Object.keys(s.seen)) {
      if (live.has(id) || now - s.seen[id].t <= FORGET_MS) continue;
      delete s.seen[id];
      delete s.allow[id];
      dirty = true;
    }
    if (dirty) this.save();
    if (Math.round(s.today * 100) !== this.sentCents) this.changed();
  }

  /**
   * A paused agent at work again: someone typed to it since the pause (they let it go, so the hold
   * comes off as if they'd pressed Continue), or it didn't stop (interrupt it again, now and then).
   */
  private heldAtWork(floor: SpendFloor, info: WorkerInfo, hold: Hold): boolean {
    if (info.lastInput && info.lastInput.at > hold.at + 2_000) {
      this.release(floor, info, hold);
      return true;
    }
    if (this.now() - (this.nudged.get(info.id) ?? 0) >= NUDGE_MS) this.interrupt(floor, info, hold.by);
    return false;
  }
}
