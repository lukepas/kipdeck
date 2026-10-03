// The office's agent identities: each (harness, operator, agent label) a worker runs as, and the
// ERC-8004 agent id it was registered under on Base Sepolia, with its registration transaction and
// whether its agentURI (the agent card) is set. Also who to pay: the operator's account, whose Solana
// payout wallet the bounty settings hold. Kept in the office's data folder (agents.json, through the
// state-file helpers). No keys, ever: the registrar's key stays in its key file.
import path from 'node:path';
import { readStateJson, writeState } from '../safefs.js';

export interface AgentIdentity {
  /** harness/operator/label (see agentKey in shared/reputation.ts). */
  key: string;
  harness: string;
  operator: string;
  label: string;
  /** The operator's account id, for their payout wallet; missing for the office's own. */
  account?: string;
  /** In decimal, once registered. */
  agentId?: string;
  /** The registration transaction. */
  tx?: string;
  /** The agentURI it was pointed at, once it was. */
  uri?: string;
  createdAt: number;
}

const KEY = /^[a-z0-9-]{1,32}\/[a-z0-9-]{1,32}\/[a-z0-9-]{1,32}$/;
const KEPT = 2000;
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max && !/[\0-\x1f]/.test(v) ? v : undefined);

function clean(raw: unknown): AgentIdentity | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const key = str(r.key, 100);
  if (!key || !KEY.test(key)) return undefined;
  const [harness, operator, label] = key.split('/');
  const out: AgentIdentity = { key, harness, operator, label, createdAt: Number.isSafeInteger(r.createdAt) ? (r.createdAt as number) : 0 };
  const account = str(r.account, 64);
  if (account) out.account = account;
  if (typeof r.agentId === 'string' && /^\d{1,78}$/.test(r.agentId)) out.agentId = r.agentId;
  const tx = str(r.tx, 80);
  if (tx && /^0x[0-9a-f]{64}$/i.test(tx)) out.tx = tx;
  const uri = str(r.uri, 300);
  if (uri && /^https:\/\//.test(uri)) out.uri = uri;
  return out;
}

export class Identities {
  private items = new Map<string, AgentIdentity>();
  private file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'agents.json');
    let raw: { items?: unknown[] } | undefined;
    try {
      raw = readStateJson(this.file);
    } catch {
      // a broken file: identities on chain stay there; ones not noted here get registered again
    }
    for (const x of raw?.items ?? []) {
      const a = clean(x);
      if (a) this.items.set(a.key, a);
    }
  }

  get(key: string): AgentIdentity | undefined {
    return this.items.get(key);
  }

  byAgentId(agentId: string): AgentIdentity | undefined {
    return [...this.items.values()].find((a) => a.agentId === agentId);
  }

  list(): AgentIdentity[] {
    return [...this.items.values()];
  }

  /** The identity for `key`, made (unregistered) if there is none yet. */
  ensure(key: string, account: string | undefined, now = Date.now()): AgentIdentity {
    let a = this.items.get(key);
    if (!a) {
      if (!KEY.test(key)) throw new Error(`Not an agent key: ${key}`);
      const [harness, operator, label] = key.split('/');
      a = { key, harness, operator, label, ...(account ? { account } : {}), createdAt: now };
      this.items.set(key, a);
      while (this.items.size > KEPT) this.items.delete(this.items.keys().next().value!);
      this.save();
    }
    return a;
  }

  save() {
    try {
      writeState(this.file, JSON.stringify({ items: [...this.items.values()] }, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
