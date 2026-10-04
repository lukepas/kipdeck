// Proof of merge on Base Sepolia, off unless the office is started with --attest: every office-made,
// non-fork pull request a person with write access merges, in a repository named in --attest-repos
// that GitHub reports public, gets one EAS attestation (outcome 1), with
// or without a bounty on it; a later revert of it that merges gets another (outcome 2, refUID the
// first); an office PR closed without merging gets outcome 3. A bot's merge earns nothing.
//
// Attestations go through a persistent outbox (outbox.ts) and are retried until they're on chain. The
// attester's key file is read by onchain/attest (loaded from its build at run time, as the escrow SDK
// is), RPC goes through the network guard to Base Sepolia's public endpoints only, and before every
// signature the node is asked for its chain id: anything but 0x14a34 (84532) is refused.
//
// With --reputation, each attestation carries the worker's ERC-8004 agent id (registered on first
// use, see reputation.ts), notes when the person who merged or closed it was the agent's own operator
// (a self-merge), and waits a while for a bounty claimed by the PR to be paid, so that the
// attestation and its feedback say so. Who closed a PR unmerged is checked with GitHub like a merger.
//
// An attestation is public and permanent: the repository's name, the PR number and the merge commit
// are readable by anyone, so a private repository is never attested, whatever --attest-repos says.
// Who merged is a keyed pseudonym (pseudonym.ts), never the GitHub id itself. The transaction hash is
// kept in the outbox as soon as it's sent, so a receipt that times out, or an office that restarts
// mid-send, looks the transaction up again instead of attesting twice.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { GhPull, QueueTask, WorkerInfo } from '../../shared/protocol.js';
import type { AttestFlags } from './flags.js';
import { BASE_SEPOLIA_RPCS } from './flags.js';
import { closeFacts, pullFacts, type GhRun } from './merge-proof.js';
import { Outbox, type OutboxItem, type Outcome } from './outbox.js';
import { mergerPseudonym, pseudonymSecret } from './pseudonym.js';
import { guardedRpcFetch, sdkCandidates, type PullFacts } from './sdk.js';

export const CHAIN_ID_HEX = '0x14a34';
const ATTEST_BUILD = ['onchain', 'attest', 'dist', 'index.js'];
const FLUSH_MS = 30_000;
/** How long an attestation waits for the bounty its PR claimed to be paid, before going without it. */
export const PAYOUT_WAIT_MS = 3 * 24 * 60 * 60_000;
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
  openedAt: number;
}
export interface Attestor {
  readonly address: string;
  attest(record: MergeRecord, refUid?: string, onSent?: (hash: string) => void): Promise<{ uid: string; tx: string; link: string }>;
  lookup(hash: string): Promise<{ uid: string; tx: string; link: string } | 'pending' | 'missing' | 'failed'>;
}
export interface AttestSdk {
  createAttestor(o: { rpcUrl: string; keyFile: string; mode: 'eas' | 'event'; schemaUid?: string; eas?: string; mergeAttestor?: string; fetchFn?: typeof fetch }): Attestor;
  readDeployment(name?: string): { schemaUid: string; mergeAttestor?: string } | undefined;
}

const ZERO32 = `0x${'0'.repeat(64)}`;
/** How long a sent attestation the node has never heard of is waited for before it is sent again. */
export const DROPPED_AFTER_MS = 10 * 60_000;

/** What the service needs of a floor (see Floor). */
export interface ProofFloor {
  id: string;
  dir: string;
  pulls(): readonly GhPull[];
  officePull(p: GhPull): boolean;
  workers(): readonly WorkerInfo[];
  tasks(): readonly QueueTask[];
  repo(): Promise<string | undefined>;
  /** Whether GitHub reports the repository public (undefined when it hasn't said). Only a public one is attested. */
  isPublic?(): Promise<boolean | undefined>;
  attested(e: { pr: number; text: string; link?: string; worker?: string; name?: string }): void;
  /** Who runs a worker (its owner's account name, and their own GitHub login when they signed in to GitHub); the office's own otherwise. */
  operatorOf?(workerId: string | undefined): { name: string; login?: string };
}

/** A bounty paid on Solana devnet for a PR: the release signature and the amount in the token's smallest units. */
export interface Payout {
  tx: string;
  amount: string;
  decimals: number;
}

export interface ProofDeps {
  dataDir: string;
  flags: AttestFlags;
  floor(id: string): ProofFloor | undefined;
  /** The bounty paid for PR `pr`, when there was one (see Bounties.payout). */
  payout?(floorId: string, pr: number): Payout | undefined;
  /** Whether a bounty claimed by PR `pr` still waits to be paid (see Bounties.payoutPending). */
  payoutPending?(floorId: string, pr: number): boolean;
  /** --reputation: the worker's ERC-8004 agent id, registering it first if it has none (see Reputation.agentIdFor). */
  agentIdFor?(item: OutboxItem): Promise<bigint>;
  /** An attestation is on chain (its feedback is owed next). */
  onAttested?(item: OutboxItem): void;
  toast?(floorId: string, text: string): void;
  /** Where a line about a repository that isn't attested goes (default the console). */
  log?(line: string): void;
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

/** When GitHub says a pull request was opened (ms), when it says. */
function openedAt(p: GhPull): { openedAt?: number } {
  const t = Date.parse(p.createdAt);
  return Number.isFinite(t) && t > 0 ? { openedAt: t } : {};
}

/** The agent CLI behind an office PR, and who runs it: its worker's, else its queue task's. */
function harnessOf(f: ProofFloor, p: GhPull): { harness: string; worker?: string; name?: string; operator?: string; operatorLogin?: string; author?: string } {
  const w = f.workers().find((x) => x.pr?.number === p.number || x.worktree?.branch === p.headRefName);
  const t = w?.provider ? undefined : f.tasks().find((x) => x.pr?.number === p.number);
  const who = w?.provider ? { harness: w.provider, worker: w.id, name: w.name } : { harness: t?.provider ?? 'unknown', ...(t?.workerId ? { worker: t.workerId } : {}), ...(t?.workerName ? { name: t.workerName } : {}) };
  const op = f.operatorOf?.(who.worker);
  return { ...who, ...(op ? { operator: op.name } : {}), ...(op?.login ? { operatorLogin: op.login } : {}), ...(p.author ? { author: p.author } : {}) };
}

const sameLogin = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export class MergeProofs {
  readonly outbox: Outbox;
  private sdk?: Promise<AttestSdk>;
  private attestor?: Attestor;
  private flushing?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private open = new Map<string, Set<number>>();
  private rpcFetch: typeof fetch;
  private now: () => number;
  private secret?: Buffer;
  private told = new Set<string>();

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

  /** Why `repo` on `floor` may not be attested (it isn't opted in, or GitHub doesn't report it public), or undefined. */
  async refusal(floor: ProofFloor, repo: string): Promise<string | undefined> {
    if (!this.deps.flags.repos.includes(repo)) return `${repo} isn't in --attest-repos`;
    const open = await floor.isPublic?.();
    if (open !== true) return open === false ? `${repo} is private: its name and pull requests would be public on chain` : `GitHub hasn't said ${repo} is public`;
    return undefined;
  }

  /** Whether `repo` may be attested; says why not once per repository. */
  private async allowed(floor: ProofFloor, repo: string): Promise<boolean> {
    const why = await this.refusal(floor, repo);
    if (why && !this.told.has(repo)) {
      this.told.add(repo);
      (this.deps.log ?? console.log)(`  proof of merge: not attesting ${repo}: ${why}`);
    }
    return !why;
  }

  /** Pull request `n` merged on `floor` (Floor.merged): owe an attestation if it's the office's own, or reverts one. */
  merged(floor: ProofFloor, n: number) {
    void this.mergedNow(floor, n).catch((err) => console.error(`agent-office: proof of merge for PR #${n}: ${(err as Error).message}`));
  }

  private async mergedNow(floor: ProofFloor, n: number) {
    const p = floor.pulls().find((x) => x.number === n);
    const repo = await floor.repo();
    if (!p || !repo || p.fork || !(await this.allowed(floor, repo))) return;
    const now = this.now();
    const reverts = revertedPr(p, repo);
    const original = reverts !== undefined ? this.outbox.get(`${repo}#${reverts}:1`) : undefined;
    if (original) {
      const { worker, name, operator, operatorLogin, agentId } = original;
      this.outbox.add({ key: `${repo}#${n}:2`, floor: floor.id, repo, pr: n, outcome: 2, harness: original.harness, ...(worker ? { worker } : {}), ...(name ? { name } : {}), ...(operator ? { operator } : {}), ...(operatorLogin ? { operatorLogin } : {}), ...(agentId ? { agentId } : {}), ref: original.key, mergedAt: now, ...openedAt(p) }, now);
    } else if (floor.officePull(p)) {
      this.outbox.add({ key: `${repo}#${n}:1`, floor: floor.id, repo, pr: n, outcome: 1, ...harnessOf(floor, p), mergedAt: now, ...openedAt(p), ...this.paid(floor.id, n) }, now);
    } else return;
    void this.flush();
  }

  /** The payout of PR `pr`'s bounty, as outbox fields. */
  private paid(floorId: string, pr: number): Pick<OutboxItem, 'solanaTx' | 'paidAmount' | 'paidDecimals'> {
    const p = this.deps.payout?.(floorId, pr);
    return p ? { solanaTx: p.tx, paidAmount: p.amount, paidDecimals: p.decimals } : {};
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
    if (!repo || !(await this.allowed(floor, repo))) return;
    const now = this.now();
    for (const p of closed) this.outbox.add({ key: `${repo}#${p.number}:3`, floor: floor.id, repo, pr: p.number, outcome: 3, ...harnessOf(floor, p), mergedAt: now, ...openedAt(p) }, now);
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

  /** Who closed an office PR unmerged (outcome 3), once: only a person with write access counts. Returns why not, if not. */
  private async closer(item: OutboxItem): Promise<string | undefined> {
    if (item.outcome !== 3 || item.mergedById) return undefined;
    const floor = this.deps.floor(item.floor);
    if (!floor) throw new Error('its floor is closed');
    const c = await closeFacts(floor.dir, item.pr, this.deps.gh);
    if (c.merged) return 'GitHub says it merged';
    if (c.closedBy?.type !== 'User' || !WRITERS.has(c.closerPermission ?? 'none')) return `closed by ${c.closedBy?.login ?? 'someone unknown'}, not a person with write access`;
    item.mergedById = c.closedBy.id;
    item.mergerLogin = c.closedBy.login;
    this.outbox.save();
    return undefined;
  }

  private async send(item: OutboxItem) {
    // Checked again when it goes out: an item owed from before the rule, or a repository made private since.
    const floor = this.deps.floor(item.floor);
    if (!floor) throw new Error('its floor is closed');
    const refused = await this.refusal(floor, item.repo);
    if (refused) return this.outbox.skip(item, refused);
    if (item.pendingTx && (await this.resume(item))) return;
    const facts = await this.facts(item);
    if (facts) {
      if (!facts.merged || facts.fork) return this.outbox.skip(item, facts.fork ? 'a fork\'s pull request' : 'GitHub says it did not merge');
      if (facts.mergedBy?.type !== 'User' || !WRITERS.has(facts.mergerPermission ?? 'none')) return this.outbox.skip(item, `merged by ${facts.mergedBy?.login ?? 'someone unknown'}, not a person with write access`);
      if (!facts.mergeSha) throw new Error('GitHub has not said which commit merged it yet');
      item.mergeSha = facts.mergeSha;
      item.mergedById = facts.mergedBy.id;
      item.mergerLogin = facts.mergedBy.login;
      this.outbox.save();
    }
    const notByAPerson = await this.closer(item);
    if (notByAPerson) return this.outbox.skip(item, notByAPerson);
    // A self-merge: the person who merged (or closed, or reverted) it runs the agent, or opened the PR.
    item.self = sameLogin(item.mergerLogin, item.operatorLogin) || (item.outcome !== 2 && sameLogin(item.mergerLogin, item.author));
    if (item.outcome === 1 && !item.solanaTx) {
      Object.assign(item, this.paid(item.floor, item.pr));
      if (!item.solanaTx && this.deps.payoutPending?.(item.floor, item.pr) && this.now() - item.mergedAt < PAYOUT_WAIT_MS) throw new Error('waiting for its bounty to be paid, so the attestation says so');
    }
    if (this.deps.agentIdFor && item.agentId === undefined) {
      item.agentId = (await this.deps.agentIdFor(item)).toString();
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
      mergedByHash: item.mergedById ? `0x${mergerPseudonym((this.secret ??= pseudonymSecret(this.deps.dataDir)), item.mergedById)}` : ZERO32,
      harness: /^[a-z0-9_-]{1,32}$/.test(item.harness) ? item.harness : 'unknown',
      agentId: BigInt(item.agentId ?? 0),
      outcome: item.outcome,
      solanaTx: item.solanaTx ?? '',
      mergedAt: Math.floor(item.mergedAt / 1000),
      openedAt: Math.min(Math.floor((item.openedAt ?? 0) / 1000), Math.floor(item.mergedAt / 1000)),
    };
    item.maintainer = record.mergedByHash;
    const r = await attestor.attest(record, ref?.uid, (hash) => this.outbox.sent(item, hash, this.now()));
    this.finish(item, r);
  }

  /**
   * An attestation sent before (its hash in the outbox), looked up instead of sent again. Returns
   * whether it's settled: on chain, or still on its way (throws, to be tried later). Sent again only
   * when it failed, or the node never heard of it for DROPPED_AFTER_MS.
   */
  private async resume(item: OutboxItem): Promise<boolean> {
    const sdk = await (this.sdk ??= this.load().catch((e) => {
      this.sdk = undefined;
      throw e;
    }));
    const found = await (await this.attestorFor(sdk)).lookup(item.pendingTx!);
    if (typeof found === 'object') {
      this.finish(item, found);
      return true;
    }
    if (found === 'pending' || (found === 'missing' && this.now() - (item.pendingAt ?? 0) < DROPPED_AFTER_MS)) throw new Error(`waiting for its transaction ${item.pendingTx} to be mined`);
    this.outbox.unsent(item);
    return false;
  }

  private finish(item: OutboxItem, r: { uid: string; tx: string; link: string }) {
    this.outbox.done(item, r);
    this.deps.onAttested?.(item);
    const ref = item.ref ? this.outbox.get(item.ref) : undefined;
    const what = item.outcome === 1 ? 'merged' : item.outcome === 2 ? `reverted (it reverts #${ref?.pr})` : 'closed without merging';
    const text = `Proof of merge on Base Sepolia: PR #${item.pr} ${what}, by ${item.name ?? 'a worker'} (${item.harness})`;
    this.deps.floor(item.floor)?.attested({ pr: item.pr, text, link: r.link, ...(item.worker ? { worker: item.worker } : {}), ...(item.name ? { name: item.name } : {}) });
    this.deps.toast?.(item.floor, `${text}`);
  }
}

