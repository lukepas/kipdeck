// What the office remembers about a floor's bounties between looks at the chain: the phase it put
// each in (awaiting approval, blocked), the PR and worker it was claimed for, the GitHub facts it
// checked, and the transactions it saw. The chain stays the source of truth for money; this is the
// office's own bookkeeping. Kept in the floor's .agent-office/bounties.json (see safefs.ts).
import path from 'node:path';
import type { BountyPhase, BountyTx, BountyTxKind } from '../../shared/protocol.js';
import { readStateJson, writeState } from '../safefs.js';
import type { PullFacts } from './sdk.js';

export interface StoredBounty {
  issue: number;
  nonce: number;
  pda: string;
  amount: string;
  funders: number;
  expiry: number;
  phase: BountyPhase;
  claimPr?: number;
  workerId?: string;
  workerName?: string;
  note?: string;
  /** The facts the attester checked once the claimed PR merged (awaiting-approval). */
  facts?: PullFacts;
  txs: BountyTx[];
}

const PHASES = new Set<BountyPhase>(['open', 'claimed', 'awaiting-approval', 'blocked', 'paying', 'released', 'refunded', 'cancelled', 'expired']);
const TX_KINDS = new Set<BountyTxKind>(['funded', 'claimed', 'paid', 'refunded', 'cancelled']);
const SIG = /^[1-9A-HJ-NP-Za-km-z]{32,90}$|^mock-tx-\d{1,12}$/;
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Transactions kept per bounty, newest last. */
const TXS_KEPT = 30;
/** Bounties kept per floor. */
const KEPT = 500;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\0-\x1f\x7f]/g, ' ').slice(0, max) : undefined);
const int = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : undefined);

function cleanFacts(raw: unknown): PullFacts | undefined {
  const r = (raw ?? {}) as Record<string, any>;
  if (typeof r.repo !== 'string' || !int(r.number)) return undefined;
  const f: PullFacts = { repo: r.repo.slice(0, 200), number: r.number, officeMade: r.officeMade === true, fork: r.fork !== false, closesIssue: r.closesIssue === true, merged: r.merged === true };
  if (typeof r.mergeSha === 'string' && /^[0-9a-f]{40}$/.test(r.mergeSha)) f.mergeSha = r.mergeSha;
  if (r.mergedBy && typeof r.mergedBy.login === 'string' && int(r.mergedBy.id) !== undefined) f.mergedBy = { login: r.mergedBy.login.slice(0, 60), id: r.mergedBy.id, type: String(r.mergedBy.type ?? '').slice(0, 20) };
  if (typeof r.mergerPermission === 'string') f.mergerPermission = r.mergerPermission as PullFacts['mergerPermission'];
  return f;
}

/** A stored bounty as read back: undefined when it doesn't hold together. */
function clean(raw: unknown): StoredBounty | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const issue = int(r.issue);
  if (!issue || typeof r.pda !== 'string' || !ADDR.test(r.pda) || !PHASES.has(r.phase as BountyPhase) || typeof r.amount !== 'string' || !/^\d{1,20}$/.test(r.amount)) return undefined;
  const txs = (Array.isArray(r.txs) ? r.txs : [])
    .map((t: any) => (t && TX_KINDS.has(t.kind) && typeof t.sig === 'string' && SIG.test(t.sig) && int(t.at) !== undefined ? { kind: t.kind as BountyTxKind, sig: t.sig, at: t.at as number } : undefined))
    .filter((t): t is BountyTx => !!t)
    .slice(-TXS_KEPT);
  const b: StoredBounty = { issue, nonce: int(r.nonce) ?? 0, pda: r.pda, amount: r.amount, funders: int(r.funders) ?? 0, expiry: int(r.expiry) ?? 0, phase: r.phase as BountyPhase, txs };
  if (int(r.claimPr)) b.claimPr = r.claimPr as number;
  const workerId = str(r.workerId, 32);
  const workerName = str(r.workerName, 120);
  const note = str(r.note, 300);
  if (workerId) b.workerId = workerId;
  if (workerName) b.workerName = workerName;
  if (note) b.note = note;
  const facts = cleanFacts(r.facts);
  if (facts) b.facts = facts;
  return b;
}

export class BountyStore {
  private items = new Map<number, StoredBounty>();
  private file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'bounties.json');
    let raw: any;
    try {
      raw = readStateJson(this.file);
    } catch {
      // a broken file: start again from the chain
    }
    for (const x of Array.isArray(raw?.items) ? raw.items : []) {
      const b = clean(x);
      if (b) this.items.set(b.issue, b);
    }
  }

  get(issue: number): StoredBounty | undefined {
    return this.items.get(issue);
  }

  list(): StoredBounty[] {
    return [...this.items.values()].sort((a, b) => a.issue - b.issue);
  }

  put(b: StoredBounty) {
    this.items.set(b.issue, b);
    while (this.items.size > KEPT) this.items.delete(this.items.keys().next().value!);
    this.save();
  }

  /** Notes a transaction once (by signature). */
  tx(b: StoredBounty, kind: BountyTxKind, sig: string, at = Date.now()): boolean {
    if (!SIG.test(sig) || b.txs.some((t) => t.sig === sig && t.kind === kind)) return false;
    b.txs.push({ kind, sig, at });
    if (b.txs.length > TXS_KEPT) b.txs.splice(0, b.txs.length - TXS_KEPT);
    return true;
  }

  save() {
    try {
      writeState(this.file, JSON.stringify({ items: this.list() }, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
