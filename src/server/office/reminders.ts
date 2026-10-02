// Reminders for what nobody has answered yet: a sweep once a minute over what the office already
// knows (shared/reminders.ts says what counts), the reminders sent to everyone when they change, a
// toast to the people on the floor when one comes up (again at most once an hour while it stays
// open), and the team's channel told once about a worker waiting on an answer for over an hour.
import { REMINDER_REPEAT_MS, UNPUSHED_ASLEEP_MS } from '../../shared/attention.js';
import { findReminders, reminderSnoozed, type ReminderFloor } from '../../shared/reminders.js';
import type { Reminder, ReminderSnooze } from '../../shared/protocol.js';
import { isAsleep } from '../../shared/status.js';
import type { Ctx, ReminderHelpers } from './context.js';

/** How often the sweep looks. */
export const REMINDER_SWEEP_MS = 60_000;
/** An asleep worker's worktree is looked at again this seldom. */
const INSPECT_MS = 60 * 60_000;

/** `clock` is the time now; tests pass their own. */
export function reminderHelpers(ctx: Ctx, clock: () => number = Date.now): ReminderHelpers {
  let current: Reminder[] = [];
  let sent = '';
  /** When each open reminder was last raised (toasted); undefined before the first sweep, which only takes note. */
  let raised: Map<string, number> | undefined;
  const escalated = new Set<string>();
  /** Since when each floor's queue has been paused with tasks waiting. */
  const paused = new Map<string, number>();
  /** Commits nobody pushed, for asleep workers, and when that was looked at. */
  const unpushed = new Map<string, { at: number; n: number }>();
  const looking = new Set<string>();

  /** Asleep a day or more with a worktree: how many commits only it has (see WorktreeState.unpushed), looked at now and then. */
  const lookAtWorktrees = (now: number) => {
    const asleep = new Set<string>();
    for (const f of ctx.floors.values()) {
      for (const w of f.workers.list()) {
        if (w.kind !== 'agent' || !w.worktree || w.lost || !isAsleep(w.status)) continue;
        const sign = Math.max(w.activityAt ?? 0, w.outputAt ?? 0, w.waitingSince ?? 0, w.createdAt);
        if (now - sign < UNPUSHED_ASLEEP_MS) continue;
        asleep.add(w.id);
        const had = unpushed.get(w.id);
        if ((had && now - had.at < INSPECT_MS) || looking.has(w.id)) continue;
        looking.add(w.id);
        void f.workers
          .inspectWorktree(w.id)
          .then((st) => unpushed.set(w.id, { at: clock(), n: st && !st.error ? st.unpushed : 0 }))
          .catch(() => unpushed.set(w.id, { at: clock(), n: 0 }))
          .finally(() => looking.delete(w.id));
      }
    }
    for (const id of unpushed.keys()) if (!asleep.has(id)) unpushed.delete(id);
  };

  const sweepReminders = () => {
    const now = clock();
    lookAtWorktrees(now);
    const floors: ReminderFloor[] = [];
    for (const f of ctx.floors.values()) {
      const q = f.queue.state();
      const waiting = q.tasks.filter((t) => t.status === 'queued').length;
      if (q.maxWorkers === 0 && waiting) {
        if (!paused.has(f.id)) paused.set(f.id, now);
      } else paused.delete(f.id);
      floors.push({ id: f.id, name: f.def.name, pulls: f.github.pulls.items, issues: f.github.issues.items, mission: f.mission.state(), pausedSince: paused.get(f.id), waiting });
    }
    for (const id of paused.keys()) if (!ctx.floors.has(id)) paused.delete(id);
    const found = findReminders({ roster: ctx.rosterEntries(), floors, unpushed: new Map([...unpushed].map(([id, u]) => [id, u.n])) }, now);
    for (const f of ctx.floors.values()) f.mission.pruneReminders(new Set(found.filter((r) => r.floor === f.id).map((r) => r.key)), now);
    current = found.map((r) => {
      const snooze = ctx.floors.get(r.floor)?.mission.reminderSnooze(r.key);
      return snooze ? { ...r, snooze } : r;
    });

    const live = new Set(current.map((r) => r.key));
    const first = !raised;
    raised ??= new Map();
    for (const r of current) {
      if (reminderSnoozed(r, now)) continue;
      const last = raised.get(r.key);
      if (last !== undefined && now - last < REMINDER_REPEAT_MS) continue;
      raised.set(r.key, now);
      // After a restart: these were seen to (or not) by the last office; the channel isn't told twice.
      const escalate = r.kind === 'needs-input-long' && !escalated.has(r.key);
      if (escalate) escalated.add(r.key);
      if (first) continue;
      ctx.toastFloor(ctx.floors.get(r.floor), `Reminder: ${r.text}`);
      if (escalate) ctx.webhook.onReminder(r);
    }
    for (const k of raised.keys()) if (!live.has(k)) raised.delete(k);
    for (const k of escalated) if (!live.has(k)) escalated.delete(k);

    const json = JSON.stringify(current);
    if (json === sent) return;
    sent = json;
    ctx.broadcast({ t: 'reminders', items: current });
  };

  const snoozeReminder = (key: string, snooze: ReminderSnooze | null): string | undefined => {
    const r = current.find((x) => x.key === key);
    const floor = r && ctx.floors.get(r.floor);
    if (!floor) return 'That reminder is gone';
    floor.mission.snoozeReminder(key, snooze);
    sweepReminders();
    return undefined;
  };

  return { reminders: () => current, sweepReminders, snoozeReminder };
}
