// The proof-of-merge outbox: every attestation the office owes, kept in its data folder (attestations.json,
// through the state-file helpers) until it's on chain, so a merge is never lost to an RPC that's down
// or an office that restarts. Each waits for its next try with a growing pause; the ones on chain stay,
// for a later revert to refer to and so nothing is attested twice.
import path from 'node:path';
import { readStateJson, writeState } from '../safefs.js';

export type Outcome = 1 | 2 | 3;

export interface OutboxItem {
  /** repo#pr:outcome, one attestation each. */
  key: string;
  floor: string;
  repo: string;
  pr: number;
  outcome: Outcome;
  harness: string;
  worker?: string;
  name?: string;
  /** Outcome 2: the key of the merge attestation it follows up. */
  ref?: string;
  /** Filled in when the office looked at GitHub (outcome 3 needs none of it). */
  mergeSha?: string;
  mergedById?: number;
  mergedAt: number;
  solanaTx?: string;
  tries: number;
  nextAt: number;
  error?: string;
  /** Not attested, and never will be (a bot merged it, say). */
  skipped?: string;
  uid?: string;
  tx?: string;
  link?: string;
}

const KEPT = 5000;
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max && !/[\0-\x1f]/.test(v) ? v : undefined);
const int = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : undefined);

function clean(raw: unknown): OutboxItem | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const key = str(r.key, 260);
  const floor = str(r.floor, 64);
  const repo = str(r.repo, 201);
  const harness = str(r.harness, 32);
  const pr = int(r.pr);
  if (!key || !floor || !repo || !harness || !pr || (r.outcome !== 1 && r.outcome !== 2 && r.outcome !== 3)) return undefined;
  const out: OutboxItem = { key, floor, repo, pr, outcome: r.outcome, harness, mergedAt: int(r.mergedAt) ?? 0, tries: int(r.tries) ?? 0, nextAt: int(r.nextAt) ?? 0 };
  for (const k of ['worker', 'name', 'ref', 'mergeSha', 'solanaTx', 'error', 'skipped', 'uid', 'tx', 'link'] as const) {
    const v = str(r[k], 300);
    if (v) out[k] = v;
  }
  const by = int(r.mergedById);
  if (by) out.mergedById = by;
  return out;
}

/** How long to wait before try number `tries + 1`: 30 seconds, doubling, at most an hour. */
export function backoff(tries: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.min(tries, 7));
}

export class Outbox {
  private items = new Map<string, OutboxItem>();
  private file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'attestations.json');
    let raw: { items?: unknown[] } | undefined;
    try {
      raw = readStateJson(this.file);
    } catch {
      // a broken file: start again (attestations on chain stay there)
    }
    for (const x of raw?.items ?? []) {
      const item = clean(x);
      if (item) this.items.set(item.key, item);
    }
  }

  get(key: string): OutboxItem | undefined {
    return this.items.get(key);
  }

  /** Queues one, unless it's queued or done already. Returns whether it was new. */
  add(item: Omit<OutboxItem, 'tries' | 'nextAt'>, now = Date.now()): boolean {
    if (this.items.has(item.key)) return false;
    this.items.set(item.key, { ...item, tries: 0, nextAt: now });
    while (this.items.size > KEPT) this.items.delete(this.items.keys().next().value!);
    this.save();
    return true;
  }

  /** The ones owed and due now, oldest first. */
  due(now = Date.now()): OutboxItem[] {
    return [...this.items.values()].filter((i) => !i.uid && !i.skipped && i.nextAt <= now);
  }

  /** The ones still owed. */
  pending(): OutboxItem[] {
    return [...this.items.values()].filter((i) => !i.uid && !i.skipped);
  }

  failed(item: OutboxItem, error: string, now = Date.now()) {
    item.tries++;
    item.error = error.slice(0, 300);
    item.nextAt = now + backoff(item.tries - 1);
    this.save();
  }

  done(item: OutboxItem, r: { uid: string; tx: string; link: string }) {
    Object.assign(item, r);
    delete item.error;
    this.save();
  }

  skip(item: OutboxItem, why: string) {
    item.skipped = why.slice(0, 300);
    delete item.error;
    this.save();
  }

  save() {
    try {
      writeState(this.file, JSON.stringify({ items: [...this.items.values()] }, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
