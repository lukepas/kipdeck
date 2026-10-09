import { attention } from '../../shared/attention.js';
import type { ReviewPull, RosterEntry } from '../../shared/protocol.js';
import type { Floor } from '../floor.js';
import { onRoster, rosterEntry, type RosterFloor } from '../roster.js';
import { reviewQueue } from '../review.js';
import type { Ctx, RosterHelpers } from './context.js';

/** How often the roster is looked at again even when nothing changed: a worker goes silent by not changing. */
export const ROSTER_TICK_MS = 30_000;

/** What the roster knows about a floor. */
export function rosterFloor(f: Floor): RosterFloor {
  return {
    id: f.id,
    name: f.def.name,
    ...(f.project.branch ? { branch: f.project.branch } : {}),
    pulls: f.github.pulls.items,
    tasks: f.queue.state().tasks,
    goalTitle: (id) => f.mission.title(id),
    work: (id) => {
      const w = f.workers.get(id);
      return w && f.work.get(w);
    },
  };
}

/**
 * The building-wide roster: every hired worker on every floor (the board agents left out), sent to
 * everyone at most a few times a second and only when it changed, as the elevator's list is. Each
 * time it goes out, a worker that just got stuck is passed to the team's webhook.
 */
export function rosterHelpers(ctx: Ctx): RosterHelpers {
  const rosterEntries = (): RosterEntry[] => {
    const out: RosterEntry[] = [];
    for (const f of ctx.floors.values()) {
      const rf = rosterFloor(f);
      for (const w of f.workers.list()) if (onRoster(w)) out.push(rosterEntry(rf, w));
    }
    return out;
  };
  const entryOf = (workerId: string): RosterEntry | undefined => {
    const f = ctx.workerFloor(workerId);
    const w = f?.workers.get(workerId);
    return f && w ? rosterEntry(rosterFloor(f), w) : undefined;
  };

  /** Workers stuck as of the last look; undefined before the first, which only takes note (no posts on a restart). */
  let stuck: Set<string> | undefined;
  const noticeStuck = (entries: RosterEntry[], now: number) => {
    const next = new Set<string>();
    for (const e of entries) {
      const a = attention(e, now);
      if (a.level !== 'stuck' || a.snoozed) continue;
      next.add(e.id);
      if (stuck && !stuck.has(e.id)) {
        ctx.webhook.onStuck(e, a.reason ?? 'stuck', () => stillStuck(e.id));
        ctx.floors.get(e.floor)?.watch.stuck(e, a.reason ?? 'stuck');
      }
    }
    stuck = next;
  };
  /** Why it's still stuck, or undefined once it isn't (the webhook looks again before it posts). */
  const stillStuck = (id: string): string | undefined => {
    const e = entryOf(id);
    const a = e && attention(e, Date.now());
    return a && a.level === 'stuck' && !a.snoozed && !ctx.workerFloor(id)?.workers.get(id)?.viewers.length ? (a.reason ?? 'stuck') : undefined;
  };

  /** The pull requests waiting for a person that no worker on the roster stands for (see review.ts). */
  const queueOf = (entries: RosterEntry[]): ReviewPull[] =>
    reviewQueue(
      [...ctx.floors.values()].map((f) => ({
        id: f.id,
        name: f.def.name,
        pulls: f.github.pulls.items,
        tasks: f.queue.state().tasks,
        branches: f.workers.list().flatMap((w) => (w.worktree ? [w.worktree.branch] : [])),
      })),
      entries,
    );

  /** Who the office's own gh is signed in as: asked once, the first time the roster goes out. */
  let viewer: string | undefined;
  let askedViewer = false;
  const askViewer = () => {
    if (askedViewer) return;
    askedViewer = true;
    const f = ctx.floors.values().next().value as Floor | undefined;
    void f?.github.viewer().then((login) => {
      if (!login) return;
      viewer = login;
      rosterChanged();
    });
  };

  let sent = '';
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    timer = undefined;
    askViewer();
    const entries = rosterEntries();
    noticeStuck(entries, Date.now());
    const review = queueOf(entries);
    const json = JSON.stringify([entries, review, viewer]);
    if (json === sent) return;
    sent = json;
    ctx.broadcast({ t: 'roster', entries, reviewQueue: review, ...(viewer ? { viewer } : {}) });
  };
  const rosterChanged = () => {
    timer ??= setTimeout(flush, 250);
  };
  return { rosterEntries, rosterEntryOf: entryOf, reviewQueue: () => queueOf(rosterEntries()), viewer: () => viewer, rosterChanged, cancelRosterChanged: () => clearTimeout(timer) };
}
