// One hired worker as the building-wide roster carries it (RosterEntry): what the attention ranking
// needs and enough to show its row, never its prompts or its terminal.
import type { GhPull, QueueTask, RosterEntry, WorkerInfo } from '../shared/protocol.js';
import { DESK_BY_ID } from '../shared/layout.js';
import { workerPr } from '../shared/status.js';

/** What the roster knows about the floor a worker is on. */
export interface RosterFloor {
  id: string;
  name: string;
  pulls: GhPull[];
  tasks: QueueTask[];
  goalTitle(id: string | undefined): string | undefined;
}

const line = (s: string | undefined, max: number) => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : undefined;
};

/** Whether the roster lists a worker: hired onto a desk, a bean bag or the meeting table, not a board agent. */
export function onRoster(w: WorkerInfo): boolean {
  return !DESK_BY_ID.get(w.deskId)?.station;
}

export function rosterEntry(f: RosterFloor, w: WorkerInfo): RosterEntry {
  const pr = workerPr(w, f.pulls, f.tasks);
  const pull = pr && f.pulls.find((p) => p.number === pr.number);
  // Its latest task on the queue: one that never got going is something to look into.
  const task = [...f.tasks].reverse().find((t) => t.workerId === w.id);
  const u = w.usage;
  const goalTitle = f.goalTitle(w.goal);
  const activity = line(w.activity, 80);
  return {
    id: w.id,
    floor: f.id,
    floorName: f.name,
    deskId: w.deskId,
    name: w.name,
    color: w.color,
    kind: w.kind,
    status: w.status,
    acked: w.acked,
    createdAt: w.createdAt,
    ...(w.waitingSince !== undefined ? { waitingSince: w.waitingSince } : {}),
    ...(w.activityAt !== undefined ? { activityAt: w.activityAt } : {}),
    ...(w.outputAt !== undefined ? { outputAt: w.outputAt } : {}),
    ...(w.exitCode !== undefined ? { exitCode: w.exitCode } : {}),
    ...(w.action ? { action: w.action } : {}),
    ...(w.lost ? { lost: true } : {}),
    tasked: !!(w.prompt || w.task || w.lastInput || w.meeting),
    ...(w.task ? { task: { name: line(w.task.name, 80) ?? '', summary: line(w.task.summary, 120) ?? '' } } : {}),
    ...(activity ? { activity } : {}),
    ...(pr ? { pr: { number: pr.number, state: pr.state, ...(pull ? { checks: pull.checks } : {}) } } : {}),
    ...(task?.outcome === 'failed' ? { taskFailed: true } : {}),
    ...(w.issue ? { issue: w.issue } : {}),
    ...(w.goal && goalTitle ? { goal: w.goal, goalTitle } : {}),
    ...(u && (u.cost > 0 || u.calls > 0) ? { usd: u.cost, tokens: u.input + u.output + u.cacheRead + u.cacheWrite } : {}),
    ...(w.workedMs !== undefined ? { workedMs: w.workedMs } : {}),
    ...(w.workingSince !== undefined ? { workingSince: w.workingSince } : {}),
    ...(w.snooze ? { snooze: { ...w.snooze } } : {}),
  };
}
