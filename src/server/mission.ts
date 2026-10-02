import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { MilestoneOp, Mission, MissionMilestone, WorkerInfo } from '../shared/protocol.js';
import { MISSION_LIMITS, cleanDue, cleanIssues, cleanMission, cleanText, emptyMission, findMilestone, goalFor, milestoneOf, zeroTotals } from '../shared/mission.js';
import { workedMs } from './workers/clock.js';
import { readStateJson, writeState } from './safefs.js';

/**
 * A floor's mission: what it's for, and its milestones, with who changed it last. Kept in
 * .agent-office/mission.json (through the state-file helpers, see safefs.ts). Everything people
 * send is cleaned here (shared/mission.ts): length-capped, control characters stripped, ids made
 * by the office.
 */
export class MissionStore {
  private mission: Mission;
  private file: string;

  constructor(
    dataDir: string,
    private onChange: (m: Mission) => void = () => {},
  ) {
    this.file = path.join(dataDir, 'mission.json');
    this.mission = this.load();
  }

  state(): Mission {
    return structuredClone(this.mission);
  }

  get locked(): boolean {
    return !!this.mission.locked;
  }

  /** The milestone a new worker takes on (see goalFor). */
  goalFor(goal?: string, issue?: number): string | undefined {
    return goalFor(this.mission, goal, issue);
  }

  /** A milestone by id, or by its title (how agents name one). */
  find(key: string): MissionMilestone | undefined {
    return findMilestone(this.mission, key);
  }

  title(id: string | undefined): string | undefined {
    return milestoneOf(this.mission, id)?.title;
  }

  /** A new statement. What it did, or why not. */
  setStatement(text: unknown, by: string): string | undefined {
    const statement = cleanText(text, MISSION_LIMITS.statement, true);
    if (statement === this.mission.statement) return undefined;
    this.mission.statement = statement;
    this.changed(by);
    return undefined;
  }

  /** Adds, changes, removes, moves or activates a milestone; why it couldn't, if it couldn't. */
  milestone(op: MilestoneOp, by: string): string | undefined {
    const list = this.mission.milestones;
    if (op.op === 'add') {
      if (list.length >= MISSION_LIMITS.milestones) return `A mission has at most ${MISSION_LIMITS.milestones} milestones`;
      const title = cleanText(op.title, MISSION_LIMITS.title);
      if (!title) return 'Give the milestone a title';
      const due = cleanDue(op.due);
      const m: MissionMilestone = { id: randomBytes(4).toString('hex'), title, issues: cleanIssues(op.issues), done: false, ...(due ? { due } : {}), totals: zeroTotals() };
      list.push(m);
      // The first one is what the team is on, until someone says otherwise.
      if (!this.mission.active) this.mission.active = m.id;
      return this.changed(by);
    }
    if (op.op === 'activate' && op.id === null) {
      if (!this.mission.active) return undefined;
      delete this.mission.active;
      return this.changed(by);
    }
    const i = list.findIndex((m) => m.id === op.id);
    if (i < 0) return 'That milestone is gone';
    const m = list[i];
    switch (op.op) {
      case 'update': {
        if (op.title !== undefined) {
          const title = cleanText(op.title, MISSION_LIMITS.title);
          if (!title) return 'A milestone needs a title';
          m.title = title;
        }
        if (op.issues !== undefined) m.issues = cleanIssues(op.issues);
        if (op.due !== undefined) {
          const due = op.due === null ? undefined : cleanDue(op.due);
          if (op.due !== null && !due) return 'A due date is a day, like 2026-11-30';
          if (due) m.due = due;
          else delete m.due;
        }
        if (op.done !== undefined) m.done = op.done === true;
        break;
      }
      case 'remove':
        list.splice(i, 1);
        if (this.mission.active === m.id) delete this.mission.active;
        break;
      case 'move': {
        const j = i + (op.delta < 0 ? -1 : 1);
        if (j < 0 || j >= list.length) return undefined;
        [list[i], list[j]] = [list[j], list[i]];
        break;
      }
      case 'activate':
        if (m.done) return 'That milestone is done: reopen it first';
        this.mission.active = m.id;
        break;
    }
    return this.changed(by);
  }

  setLocked(locked: boolean, by: string) {
    if (!!this.mission.locked === locked) return;
    if (locked) this.mission.locked = true;
    else delete this.mission.locked;
    this.changed(by);
  }

  /**
   * A worker went home: what it spent and worked stays on its milestone's totals, so a milestone's
   * cost survives sending its workers home.
   */
  retire(w: WorkerInfo) {
    const m = milestoneOf(this.mission, w.goal);
    if (!m) return;
    const u = w.usage;
    m.totals.usd += u?.cost ?? 0;
    m.totals.tokens += u ? u.input + u.output + u.cacheRead + u.cacheWrite : 0;
    m.totals.workedMs += workedMs(w) ?? 0;
    m.totals.workers++;
    this.save();
    this.onChange(this.state());
  }

  private changed(by: string): undefined {
    this.mission.by = cleanText(by, 64) || '?';
    this.mission.at = Date.now();
    this.save();
    this.onChange(this.state());
    return undefined;
  }

  private load(): Mission {
    if (!existsSync(this.file)) return emptyMission();
    try {
      return cleanMission(readStateJson(this.file));
    } catch {
      // a broken file just means no mission yet
      return emptyMission();
    }
  }

  private save() {
    try {
      writeState(this.file, JSON.stringify(this.mission, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
