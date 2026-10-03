// Proof of merge on Base Sepolia, off unless the office is started with --attest: every office-made,
// non-fork pull request a person with write access merges gets one EAS attestation (outcome 1), with
// or without a bounty on it; a later revert of it that merges gets another (outcome 2, refUID the
// first); an office PR closed without merging gets outcome 3. A bot's merge earns nothing.
//
// Attestations go through a persistent outbox (outbox.ts) and are retried until they're on chain. The
// attester's key file is read by onchain/attest (loaded from its build at run time, as the escrow SDK
// is), RPC goes through the network guard to Base Sepolia's public endpoints only, and before every
// signature the node is asked for its chain id: anything but 0x14a34 (84532) is refused.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { GhPull, QueueTask, WorkerInfo } from '../../shared/protocol.js';
import type { AttestFlags } from './flags.js';
import { BASE_SEPOLIA_RPCS } from './flags.js';
import { pullFacts, type GhRun } from './merge-proof.js';
import { Outbox, type OutboxItem, type Outcome } from './outbox.js';
import { guardedRpcFetch, sdkCandidates, type PullFacts } from './sdk.js';

export const CHAIN_ID_HEX = '0x14a34';
const ATTEST_BUILD = ['onchain', 'attest', 'dist', 'index.js'];
const FLUSH_MS = 30_000;
/** Who may merge for it to count: a person with at least write access. */
const WRITERS = new Set(['admin', 'maintain', 'write']);

/** The part of onchain/attest's build the office calls. */
export interface MergeRecord {
  repo: string;
  pr: number;
  mergeSha: string;
  mergedByHash: string;
  harness: string;
  agentId: bigint;
  outcome: Outcome;
  solanaTx: string;
  mergedAt: number;
}
export interface Attestor {
  readonly address: string;
  attest(record: MergeRecord, refUid?: string): Promise<{ uid: string; tx: string; link: string }>;
}
export interface AttestSdk {
  createAttestor(o: { rpcUrl: string; keyFile: string; mode: 'eas' | 'event'; schemaUid?: string; eas?: string; mergeAttestor?: string; fetchFn?: typeof fetch }): Attestor;
  mergedByHashOf(githubUserId: number | undefined): string;
  readDeployment(name?: string): { schemaUid: string; mergeAttestor?: string } | undefined;
}

/** What the service needs of a floor (see Floor). */
export interface ProofFloor {
  id: string;
  dir: string;
  pulls(): readonly GhPull[];
  officePull(p: GhPull): boolean;
  workers(): readonly WorkerInfo[];
  tasks(): readonly QueueTask[];
  repo(): Promise<string | undefined>;
  attested(e: { pr: number; text: string; link?: string; worker?: string; name?: string }): void;
}

export interface ProofDeps {
  dataDir: string;
  flags: AttestFlags;
  floor(id: string): ProofFloor | undefined;
  /** The devnet signature of the bounty paid for PR `pr`, when there was one (see Bounties.paidTx). */
  solanaTx?(floorId: string, pr: number): string | undefined;
  toast?(floorId: string, text: string): void;
  /** Tests: the SDK, an attestor, how gh runs, the RPC fetch, the clock, and no timer. */
  loadSdk?: () => Promise<AttestSdk>;
  gh?: GhRun;
  fetch?: typeof fetch;
  now?: () => number;
  timer?: boolean;
}

/** Asks the node for its chain id (through `fetch`) and refuses anything but Base Sepolia. */
export async function checkChain(rpc: string, fetchImpl: typeof fetch): Promise<void> {
  const res = await fetchImpl(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown };
  const id = typeof body.result === 'string' ? body.result.toLowerCase() : '';
  if (id !== CHAIN_ID_HEX) throw new Error(`Refusing to sign: the node is on chain ${id || '(unknown)'}, not Base Sepolia (84532)`);
}

/** Why an RPC URL can't be used for attestations, or undefined. */
export function rpcProblem(url: string): string | undefined {
  if (BASE_SEPOLIA_RPCS.includes(url.replace(/\/+$/, ''))) return undefined;
  if (/^http:\/\/127\.0\.0\.1:\d{1,5}\/?$/.test(url)) return undefined;
  return `--attest-rpc is ${BASE_SEPOLIA_RPCS.join(' or ')} (or a local node at http://127.0.0.1:<port>)`;
}

/** The PR a merged pull request reverts, from GitHub's own "Reverts owner/name#N" line. */
export function revertedPr(p: GhPull, repo: string): number | undefined {
  const m = /^Reverts ([\w.-]+\/[\w.-]+)#(\d+)\s*$/m.exec(p.body ?? '');
  return m && m[1].toLowerCase() === repo ? Number(m[2]) : undefined;
}

/** The agent CLI behind an office PR: its worker's, else its queue task's. */
function harnessOf(f: ProofFloor, p: GhPull): { harness: string; worker?: string; name?: string } {
  const w = f.workers().find((x) => x.pr?.number === p.number || x.worktree?.branch === p.headRefName);
  if (w?.provider) return { harness: w.provider, worker: w.id, name: w.name };
  const t = f.tasks().find((x) => x.pr?.number === p.number);
  return { harness: t?.provider ?? 'unknown', ...(t?.workerId ? { worker: t.workerId } : {}), ...(t?.workerName ? { name: t.workerName } : {}) };
}

export class MergeProofs {
  readonly outbox: Outbox;
  private sdk?: Promise<AttestSdk>;
  private attestor?: Attestor;
  private flushing?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private open = new Map<string, Set<number>>();
  private rpcFetch: typeof fetch;
  private now: () => number;

  constructor(private deps: ProofDeps) {
    this.outbox = new Outbox(deps.dataDir);
    this.now = deps.now ?? Date.now;
    const rpc = new URL(deps.flags.rpc);
    const local = rpc.hostname === '127.0.0.1';
    this.rpcFetch = deps.fetch ?? guardedRpcFetch([rpc.host], local ? { allow: (ip) => ip === '127.0.0.1' } : {});
    if (deps.timer !== false) {
      this.timer = setInterval(() => void this.flush(), FLUSH_MS);
      this.timer.unref();
    }
  }

  stop() {
    clearInterval(this.timer);
  }

  /** Pull request `n` merged on `floor` (Floor.merged): owe an attestation if it's the office's own, or reverts one. */
  merged(floor: ProofFloor, n: number) {
    void this.mergedNow(floor, n).catch((err) => console.error(`agent-office: proof of merge for PR #${n}: ${(err as Error).message}`));
  }

  private async mergedNow(floor: ProofFloor, n: number) {
    const p = floor.pulls().find((x) => x.number === n);
    const repo = await floor.repo();
    if (!p || !repo || p.fork) return;
    const now = this.now();
    const reverts = revertedPr(p, repo);
    const original = reverts !== undefined ? this.outbox.get(`${repo}#${reverts}:1`) : undefined;
    if (original) {
      this.outbox.add({ key: `${repo}#${n}:2`, floor: floor.id, repo, pr: n, outcome: 2, harness: original.harness, ...(original.worker ? { worker: original.worker } : {}), ...(original.name ? { name: original.name } : {}), ref: original.key, mergedAt: now }, now);
    } else if (floor.officePull(p)) {
      const solanaTx = this.deps.solanaTx?.(floor.id, n);
      this.outbox.add({ key: `${repo}#${n}:1`, floor: floor.id, repo, pr: n, outcome: 1, ...harnessOf(floor, p), mergedAt: now, ...(solanaTx ? { solanaTx } : {}) }, now);
    } else return;
    void this.flush();
  }

  /** A fresh list of a floor's pull requests: an office PR that closed without merging owes outcome 3. */
  async pulls(floor: ProofFloor) {
    const items = floor.pulls();
    const before = this.open.get(floor.id);
    this.open.set(floor.id, new Set(items.filter((p) => p.state === 'OPEN').map((p) => p.number)));
    if (!before) return;
    const closed = items.filter((p) => p.state === 'CLOSED' && before.has(p.number) && floor.officePull(p));
    if (!closed.length) return;
    const repo = await floor.repo();
    if (!repo) return;
    const now = this.now();
    for (const p of closed) this.outbox.add({ key: `${repo}#${p.number}:3`, floor: floor.id, repo, pr: p.number, outcome: 3, ...harnessOf(floor, p), mergedAt: now }, now);
    void this.flush();
  }

  /** Sends what's due, one at a time. Resolves once this round is over. */
  flush(): Promise<void> {
    this.flushing ??= this.flushNow().finally(() => (this.flushing = undefined));
    return this.flushing;
  }

  private async flushNow() {
    for (const item of this.outbox.due(this.now())) {
      try {
        await this.send(item);
      } catch (err) {
        this.outbox.failed(item, (err as Error).message, this.now());
      }
    }
  }

  private async load(): Promise<AttestSdk> {
    if (this.deps.loadSdk) return this.deps.loadSdk();
    const found = sdkCandidates(undefined, ATTEST_BUILD).find((c) => existsSync(c));
    if (!found) throw new Error('onchain/attest is not built: run npm install && npm run build there');
    return (await import(pathToFileURL(found).href)) as AttestSdk;
  }

  private async attestorFor(sdk: AttestSdk): Promise<Attestor> {
    if (this.attestor) return this.attestor;
    const f = this.deps.flags;
    const bad = rpcProblem(f.rpc);
    if (bad) throw new Error(bad);
    const deployment = f.rpc.startsWith('http://127.0.0.1') ? sdk.readDeployment('localnet') : sdk.readDeployment('base-sepolia');
    const schemaUid = f.schema ?? deployment?.schemaUid;
    const contract = f.contract ?? deployment?.mergeAttestor;
    if (f.mode === 'eas' && !schemaUid) throw new Error('No schema UID: register it (onchain/attest scripts/deploy-sepolia.sh) or pass --attest-schema');
    // The key file is read once, by the SDK: its errors name the file, never its bytes.
    this.attestor = sdk.createAttestor({ rpcUrl: f.rpc, keyFile: f.keyFile, mode: f.mode, ...(schemaUid ? { schemaUid } : {}), ...(f.eas ? { eas: f.eas } : {}), ...(contract ? { mergeAttestor: contract } : {}), fetchFn: this.rpcFetch });
    return this.attestor;
  }

  /** What GitHub says about the merge (outcomes 1 and 2), once: who merged it and the merge commit. */
  private async facts(item: OutboxItem): Promise<PullFacts | undefined> {
    if (item.outcome === 3 || item.mergeSha) return undefined;
    const floor = this.deps.floor(item.floor);
    if (!floor) throw new Error('its floor is closed');
    const p = floor.pulls().find((x) => x.number === item.pr);
    return pullFacts(floor.dir, item.repo, item.pr, 0, true, !!p?.fork, this.deps.gh);
  }

  private async send(item: OutboxItem) {
    const facts = await this.facts(item);
    if (facts) {
      if (!facts.merged || facts.fork) return this.outbox.skip(item, facts.fork ? 'a fork\'s pull request' : 'GitHub says it did not merge');
      if (facts.mergedBy?.type !== 'User' || !WRITERS.has(facts.mergerPermission ?? 'none')) return this.outbox.skip(item, `merged by ${facts.mergedBy?.login ?? 'someone unknown'}, not a person with write access`);
      if (!facts.mergeSha) throw new Error('GitHub has not said which commit merged it yet');
      item.mergeSha = facts.mergeSha;
      item.mergedById = facts.mergedBy.id;
      this.outbox.save();
    }
    const ref = item.ref ? this.outbox.get(item.ref) : undefined;
    if (item.ref && !ref?.uid) throw new Error('waiting for the attestation it follows up');
    const sdk = await (this.sdk ??= this.load().catch((e) => {
      this.sdk = undefined;
      throw e;
    }));
    const attestor = await this.attestorFor(sdk);
    await checkChain(this.deps.flags.rpc, this.rpcFetch);
    const record: MergeRecord = {
      repo: item.repo,
      pr: item.pr,
      mergeSha: item.outcome === 3 ? '0'.repeat(40) : (item.mergeSha ?? ''),
      mergedByHash: sdk.mergedByHashOf(item.outcome === 3 ? undefined : item.mergedById),
      harness: /^[a-z0-9_-]{1,32}$/.test(item.harness) ? item.harness : 'unknown',
      agentId: 0n,
      outcome: item.outcome,
      solanaTx: item.solanaTx ?? '',
      mergedAt: Math.floor(item.mergedAt / 1000),
    };
    const r = await attestor.attest(record, ref?.uid);
    this.outbox.done(item, r);
    const what = item.outcome === 1 ? 'merged' : item.outcome === 2 ? `reverted (it reverts #${ref?.pr})` : 'closed without merging';
    const text = `Proof of merge on Base Sepolia: PR #${item.pr} ${what}, by ${item.name ?? 'a worker'} (${item.harness})`;
    this.deps.floor(item.floor)?.attested({ pr: item.pr, text, link: r.link, ...(item.worker ? { worker: item.worker } : {}), ...(item.name ? { name: item.name } : {}) });
    this.deps.toast?.(item.floor, `🔏 ${text}`);
  }
}

