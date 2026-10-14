// The verdict each To review row carries (shared/brief/row-verdict.ts), so the inbox says "Tested,
// nothing flagged" or "No tests, touches CI config" without anyone opening the brief. The diff's risk
// flags cost a look at the checkout, so they are read once per piece of work (its work key: the same
// one the brief is asked again on), one agent at a time, and kept until the work moves on; the test
// runs come from the agent's journal and CI from its row, both read fresh each time the roster goes out.
import { ciOf, rowVerdict, workKey } from '../../shared/brief/row-verdict.js';
import type { RiskFlag, RosterEntry, RowVerdict } from '../../shared/protocol.js';
import { diffFlags, type BriefChanges } from './build.js';
import type { Journal } from './log.js';

const AT_REST = new Set<RosterEntry['status']>(['done', 'idle', 'exited', 'offline']);

/** A checkout that couldn't be read is tried again after this long, for a floor that was briefly away. */
export const RETRY_MS = 60_000;

/** Whether a row gets a verdict: an agent at rest with changes the office has looked at. */
export const wantsVerdict = (e: RosterEntry) => e.kind === 'agent' && AT_REST.has(e.status) && !!e.work?.files && !e.lost;

export class RowVerdicts {
  private seen = new Map<string, { key: string; flags?: RiskFlag[]; failedAt?: number }>();
  private todo: string[] = [];
  private running = false;

  constructor(
    /** The Changes service of the floor a worker is on (see changes.ts). */
    private changes: (workerId: string) => BriefChanges | undefined,
    private journal: (workerId: string) => Journal | undefined,
    /** Flags came back for a row: the roster should go out again. */
    private changed: () => void,
    private now: () => number = Date.now,
  ) {}

  /** `e`'s verdict as of its work's last look; undefined until its flags are read, or for a row that gets none. */
  verdict(e: RosterEntry): RowVerdict | undefined {
    if (!wantsVerdict(e)) return undefined;
    const key = workKey(e);
    const had = this.seen.get(e.id);
    // A new piece of work, or a read that failed a while ago: (another) look at its checkout.
    if (had?.key !== key || (had.failedAt !== undefined && this.now() - had.failedAt >= RETRY_MS)) {
      this.seen.set(e.id, { key });
      if (!this.todo.includes(e.id)) this.todo.push(e.id);
      void this.next();
      return undefined;
    }
    if (!had.flags) return undefined;
    const j = this.journal(e.id);
    return rowVerdict({ runs: j?.runs ?? [], flags: had.flags, ...(j?.lastEditAt !== undefined ? { lastEditAt: j.lastEditAt } : {}) }, ciOf(e));
  }

  /** Forgets every worker but `ids` (the ones on the roster now). */
  keep(ids: ReadonlySet<string>) {
    for (const id of this.seen.keys()) if (!ids.has(id)) this.seen.delete(id);
    this.todo = this.todo.filter((id) => ids.has(id));
  }

  private async next() {
    if (this.running) return;
    this.running = true;
    try {
      for (let id = this.todo.shift(); id; id = this.todo.shift()) {
        const had = this.seen.get(id);
        const changes = this.changes(id);
        if (!had) continue;
        if (!changes) {
          had.failedAt = this.now();
          continue;
        }
        const { files, flags } = await diffFlags(id, changes);
        // The work moved on (or the worker went) while it was read: the newer look is queued. No files
        // means its checkout couldn't be read, and no verdict beats a "nothing flagged" it can't back.
        if (this.seen.get(id) !== had) continue;
        if (!files.length) {
          had.failedAt = this.now();
          continue;
        }
        had.flags = flags;
        this.changed();
      }
    } finally {
      this.running = false;
    }
  }
}
