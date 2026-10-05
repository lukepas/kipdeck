// The deck's pace on the server: the drive core's run and today's best, the fleet's week against its
// record (shared/pace.ts), the captain's turnaround (shared/turnaround.ts), and the day's captain's log
// (shared/launch.ts), written to a deck's timeline once a day when a captain starts a watch there.
//
// Reply times are the one figure the timeline can't give: a unit asking is logged, the answer isn't.
// So each floor keeps a ReplyClock fed by its workers' updates, which notes how long each one waited
// in needs input before someone answered it, in the floor's .agent-office/pace.json (eight days of it).
import path from 'node:path';
import { rankRoster } from '../shared/attention.js';
import { captainsLog } from '../shared/launch.js';
import { milestoneProgress } from '../shared/mission.js';
import { dayStart, fleetWeek, issuesClosed, isRevert, missionDay, runOf } from '../shared/pace.js';
import type { PaceState, TimelineEvent, WorkerInfo, WorkerStatus } from '../shared/protocol.js';
import { TURNAROUND_CAP_MS, turnaroundOf, type Sample } from '../shared/turnaround.js';
import type { Floor } from './floor.js';
import type { Ctx } from './office/context.js';
import { readState, writeState } from './safefs.js';

/** How long reply samples are kept (ms), and at most how many. */
const KEEP_MS = 8 * 24 * 60 * 60_000;
const KEEP_MAX = 500;

/** How long each worker on a floor waited for an answer: needs input until it is working again. */
export class ReplyClock {
  private file: string;
  private status = new Map<string, { status: WorkerStatus; since: number }>();
  private list: Sample[] = [];

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'pace.json');
    try {
      const raw = JSON.parse(readState(this.file) ?? '{}') as { replies?: unknown };
      if (Array.isArray(raw.replies)) this.list = raw.replies.filter((s): s is Sample => !!s && Number.isFinite(s.at) && Number.isFinite(s.ms) && s.ms >= 0).slice(-KEEP_MAX);
    } catch {
      // a torn file starts the clock afresh
    }
  }

  /** A worker's update: an answer ends its wait. The first look at a worker only takes note. */
  worker(w: WorkerInfo, now = Date.now()) {
    const was = this.status.get(w.id);
    if (was?.status === w.status) return;
    this.status.set(w.id, { status: w.status, since: w.status === 'needs_input' ? (w.waitingSince ?? now) : now });
    if (was?.status !== 'needs_input' || w.status !== 'working') return;
    const ms = now - was.since;
    if (ms < 0 || ms > TURNAROUND_CAP_MS) return;
    this.list.push({ at: now, ms });
    this.list = this.list.filter((s) => s.at > now - KEEP_MS).slice(-KEEP_MAX);
    try {
      writeState(this.file, JSON.stringify({ replies: this.list }));
    } catch {
      // disk issues shouldn't take the office down
    }
  }

  forget(workerId: string) {
    this.status.delete(workerId);
  }

  samples(): readonly Sample[] {
    return this.list;
  }
}

/** Every event the building's floors still hold, oldest first. */
function allEvents(ctx: Ctx): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const f of ctx.floors.values()) out.push(...f.timeline.list({ limit: Number.MAX_SAFE_INTEGER }).events);
  return out.sort((a, b) => a.at - b.at);
}

/** A floor's events, oldest first. */
const eventsOf = (floor: Floor) => floor.timeline.list({ limit: Number.MAX_SAFE_INTEGER }).events.reverse();

/** A deck's pace now. */
export function paceOf(ctx: Ctx, floor: Floor, now = Date.now()): PaceState {
  const mine = eventsOf(floor);
  return { ...runOf(mine, now), ...fleetWeek(allEvents(ctx), now), ...turnaroundOf(mine, floor.replies.samples(), now), day: missionDay(mine, now) };
}

/** The day's captain's log for a deck, from its timeline, the fleet's yesterday, its mission and its crew. */
export function logText(ctx: Ctx, floor: Floor, now = Date.now()): string {
  const today = dayStart(now);
  const yesterday = dayStart(today - 1);
  const y = allEvents(ctx).filter((e) => e.at >= yesterday && e.at < today);
  const m = floor.mission.state();
  const open = m.milestones.find((x) => x.id === m.active && !x.done) ?? m.milestones.find((x) => !x.done);
  const roster = ctx.rosterEntries().filter((e) => e.floor === floor.id);
  const p = open ? milestoneProgress(open, floor.github.issues.items, roster, floor.github.pulls.items, now) : undefined;
  const levels = rankRoster(roster, now).map((r) => r.att.level);
  return captainsLog({
    day: missionDay(eventsOf(floor), now),
    yesterday: { merges: y.filter((e) => e.kind === 'pr-merged' && !isRevert(e)).length, issues: issuesClosed(y), bounties: y.filter((e) => e.kind === 'bounty-paid').length },
    mission: !!(m.statement || m.milestones.length),
    ...(open ? { waypoint: { n: m.milestones.indexOf(open) + 1, title: open.title, ...(p?.issues ? { pct: (p.closed / p.issues) * 100 } : {}) } } : {}),
    units: { review: levels.filter((l) => l === 'review').length, idle: levels.filter((l) => l === 'parked').length, aboard: levels.length },
  });
}

/** Today's captain's log on `floor`: the one already written today, else a new one on its timeline. */
export function writeLog(ctx: Ctx, floor: Floor, now = Date.now()): TimelineEvent | undefined {
  const today = dayStart(now);
  const had = floor.timeline.list({ since: today - 1, limit: Number.MAX_SAFE_INTEGER }).events.find((e) => e.kind === 'log');
  return had ?? floor.timeline.add({ kind: 'log', text: logText(ctx, floor, now), at: now });
}
