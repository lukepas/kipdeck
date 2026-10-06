import type { Ctx } from './context.js';
import { SLOW_CLIENT_BYTES } from './client.js';
import { ROSTER_TICK_MS } from './roster.js';
import { REMINDER_SWEEP_MS } from './reminders.js';
import { TELEMETRY_SWEEP_MS } from '../telemetry.js';

/** How often the people in the office are stamped as here (Accounts.seenAll), so a crash loses at most this much of it. */
export const SEEN_MS = 60_000;

/**
 * Stamps everyone connected as here now. On a clock, and as the office shuts down: without it, the
 * time away (and so "While you were away") would start at when they came in, should the office
 * crash or exit before their sockets finish closing.
 */
export function stampConnected(ctx: Pick<Ctx, 'clients' | 'accounts'>) {
  ctx.accounts.seenAll([...ctx.clients.values()].flatMap((c) => (c.accountId ? [c.accountId] : [])));
}

/** The office's own clocks: terminals re-sent to viewers who fell behind, the heartbeat, the roster and the reminders. Returns what stops them. */
export function startTimers(ctx: Ctx): () => void {
  const { clients } = ctx;
  const resync = setInterval(() => {
    for (const c of clients.values()) {
      if (!c.stale.size || c.ws.bufferedAmount > SLOW_CLIENT_BYTES / 8) continue;
      for (const wid of c.stale) {
        const snap = c.attached.has(wid) ? ctx.workerFloor(wid)?.workers.attach(wid, c.id, c.peer.name) : undefined;
        if (snap) ctx.sendTo(c, { t: 'term.snapshot', workerId: wid, ...snap });
      }
      c.stale.clear();
    }
  }, 1000);

  // Drop dead connections so ghosts don't linger in the office.
  // Also signs out anyone `agent-office accounts` revoked, and passes on role changes made there.
  const heartbeat = setInterval(() => {
    let accountsMoved = false;
    for (const c of clients.values()) {
      if (!c.isAlive) {
        c.ws.terminate();
        continue;
      }
      if (!c.out && (!ctx.stillIn(c) || c.admin !== ctx.meOf(c.accountId).admin)) accountsMoved = true;
      c.isAlive = false;
      c.ws.ping();
    }
    if (accountsMoved) ctx.accountsChanged();
  }, 20_000);

  // A worker goes silent, or a finished one is forgotten, without anything happening to it: look again now and then.
  const roster = setInterval(() => ctx.rosterChanged(), ROSTER_TICK_MS);
  // Reminders come up by time passing too; the first look waits for the boards to come back from GitHub.
  const firstSweep = setTimeout(() => ctx.sweepReminders(), 10_000);
  const reminders = setInterval(() => ctx.sweepReminders(), REMINDER_SWEEP_MS);
  const seen = setInterval(() => stampConnected(ctx), SEEN_MS);
  // Anonymous usage numbers, when someone turned them on: does nothing while they're off.
  const usage = setInterval(() => ctx.telemetry.on && ctx.telemetry.sweep(ctx.rosterEntries(), ctx.shipped.recent()), TELEMETRY_SWEEP_MS);

  return () => {
    clearInterval(usage);
    clearInterval(seen);
    clearTimeout(firstSweep);
    clearInterval(reminders);
    clearInterval(roster);
    clearInterval(heartbeat);
    clearInterval(resync);
  };
}
