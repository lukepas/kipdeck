// Merge-based agent reputation, off unless the office is started with --reputation (and --attest):
// every worker identity, a (harness, operator, agent label) such as claude/ana/backend-1, gets an
// ERC-8004 agent id in the Identity Registry on Base Sepolia the first time one of its pull requests
// is attested, and each attested outcome (a person merged it, reverted it, or closed it unmerged)
// gets one feedback in the Reputation Registry: merged 100 (tag 'paid' when a bounty was paid),
// reverted 0, closed 30, tag 'self' when the agent's own operator did it; tag2 the harness,
// feedbackURI the attestation, feedbackHash its UID (shared/reputation.ts has the numbers).
//
// Two keys: the registrar (its own key file) owns the identities, and the attester's key gives the
// feedback, since the registry refuses feedback from an agent's owner. Both are read by
// onchain/reputation's build, loaded at run time as the other onchain SDKs are. RPC goes through the
// network guard, and the node must say it is Base Sepolia before anything is signed. Owed feedback
// waits in feedback.json (safefs) and is retried like attestations. Nothing here moves money.
import { PRODUCT } from '../../shared/copy.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgentRepView, ReputationState } from '../../shared/protocol.js';
import { agentKey, feedbackFor, leaderboard, reputationOf, type RepEvent } from '../../shared/reputation.js';
import { readStateJson, writeState } from '../safefs.js';
import { DROPPED_AFTER_MS, checkChain, rpcProblem } from './attest.js';
import { operatorPseudonym, pseudonymSecret, publicAgentName } from './pseudonym.js';
import type { ChainFlags } from './flags.js';
import { Identities, type AgentIdentity } from './identities.js';
import { backoff, type OutboxItem } from './outbox.js';
import { guardedRpcFetch, sdkCandidates } from './sdk.js';

const REPUTATION_BUILD = ['onchain', 'reputation', 'dist', 'index.js'];
const FLUSH_MS = 30_000;
const BASESCAN = 'https://sepolia.basescan.org';
/** CAIP-2 for Solana devnet, as x402 and agent cards name it. */
export const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

/** The part of onchain/reputation's build the office calls. */
export interface RepRegistry {
  readonly address: string;
  register(agentURI?: string, onSent?: (hash: string) => void): Promise<{ agentId: bigint; tx: string; link: string }>;
  registered(hash: string): Promise<{ agentId: bigint; tx: string; link: string } | 'pending' | 'missing' | 'failed'>;
  setAgentURI(agentId: bigint, uri: string): Promise<{ tx: string }>;
  giveFeedback(f: { agentId: bigint; value: number; tag1: string; tag2: string; feedbackURI: string; feedbackHash: string }): Promise<{ tx: string; index: bigint; link: string }>;
}
export interface RepSdk {
  createRegistry(o: { rpcUrl: string; keyFile: string; identity?: string; reputation?: string; fetchFn?: typeof fetch }): RepRegistry;
  readDeployment(name?: string): { identity: string; reputation: string } | undefined;
  keyFileAddress(file: string): string;
  IDENTITY_REGISTRY: string;
  REPUTATION_REGISTRY: string;
}

/** One feedback the office owes the Reputation Registry: for the attestation `key`. */
export interface FeedbackItem {
  key: string;
  agentId: string;
  value: number;
  tag1: string;
  tag2: string;
  feedbackURI: string;
  feedbackHash: string;
  tries: number;
  nextAt: number;
  error?: string;
  skipped?: string;
  tx?: string;
  link?: string;
}

export interface ReputationDeps {
  dataDir: string;
  flags: ChainFlags;
  /** The attestations the office owes and made (MergeProofs' outbox). */
  attestations(): readonly OutboxItem[];
  /** A worker's owner, by account id. */
  ownerOf?(floorId: string, workerId: string): string | undefined;
  /** An operator's Solana payout wallet (the bounty settings). */
  wallet?(account: string | undefined): string | undefined;
  /** Workers on the roster, by the identity they run as. */
  workers?(): { id: string; key: string }[];
  /** Whether the office takes paid tasks over x402 (agent cards say so). */
  x402?(): boolean;
  /** The bounty mint, for payouts recorded before the outbox kept theirs (Bounties.mint). */
  mint?(): string | undefined;
  /** Something a browser shows changed. */
  changed?(): void;
  /** Tests: the SDK, the RPC fetch, the clock, and no timer. */
  loadSdk?: () => Promise<RepSdk>;
  fetch?: typeof fetch;
  now?: () => number;
  timer?: boolean;
}

const zero = (h: string | undefined) => !h || /^0x0*$/.test(h);
const sec = (ms: number) => Math.floor(ms / 1000);
export const solanaTxLink = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function cleanFeedback(raw: unknown): FeedbackItem | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max && !/[\0-\x1f]/.test(v) ? v : undefined);
  const key = s(r.key, 260);
  const agentId = s(r.agentId, 78);
  if (!key || !agentId || !/^\d+$/.test(agentId) || !Number.isSafeInteger(r.value)) return undefined;
  const out: FeedbackItem = { key, agentId, value: r.value as number, tag1: s(r.tag1, 32) ?? 'merge', tag2: s(r.tag2, 32) ?? 'unknown', feedbackURI: s(r.feedbackURI, 300) ?? '', feedbackHash: s(r.feedbackHash, 66) ?? '', tries: Number(r.tries) || 0, nextAt: Number(r.nextAt) || 0 };
  for (const k of ['error', 'skipped', 'tx', 'link'] as const) {
    const v = s(r[k], 300);
    if (v) out[k] = v;
  }
  return out;
}

/** Outcomes the office attested, as the shared metrics take them (the same shape the indexer reads off the chain). */
export function eventsOf(items: readonly OutboxItem[], feedbackLink: (key: string) => string | undefined = () => undefined, mint?: string): RepEvent[] {
  const live = items.filter((i) => i.uid && !i.skipped);
  const byKey = new Map(live.map((i) => [i.key, i]));
  const out: RepEvent[] = [];
  for (const i of live) {
    const fb = feedbackLink(i.key);
    const links = { ...(i.link ? { attestation: i.link } : {}), ...(fb ? { feedback: fb } : {}) };
    const at = sec(i.mergedAt);
    const opened = i.openedAt && sec(i.openedAt) <= at ? { openedAt: sec(i.openedAt) } : {};
    const base = { agentId: i.agentId ?? '0', harness: i.harness, repo: i.repo, uid: i.uid!, ...(!zero(i.maintainer) ? { maintainer: i.maintainer } : {}), ...(i.self ? { self: true } : {}) };
    if (i.outcome === 1) {
      const paid = i.solanaTx && i.paidAmount ? { paid: { amount: i.paidAmount, decimals: i.paidDecimals ?? 6, tx: i.solanaTx, ...((i.paidMint ?? mint) ? { mint: i.paidMint ?? mint } : {}) } } : {};
      out.push({ ...base, pr: i.pr, outcome: 'merged', at, ...opened, ...paid, links: { ...links, ...(i.solanaTx ? { solana: solanaTxLink(i.solanaTx) } : {}) } });
    } else if (i.outcome === 2) {
      const original = i.ref ? byKey.get(i.ref) : undefined;
      if (!original) continue;
      out.push({ ...base, agentId: original.agentId ?? '0', harness: original.harness, pr: original.pr, outcome: 'reverted', at, mergedAt: sec(original.mergedAt), links });
    } else out.push({ ...base, pr: i.pr, outcome: 'closed', at, ...opened, links });
  }
  return out.sort((a, b) => a.at - b.at || a.repo.localeCompare(b.repo) || a.pr - b.pr || a.outcome.localeCompare(b.outcome));
}

export class Reputation {
  readonly identities: Identities;
  private feedback = new Map<string, FeedbackItem>();
  private file: string;
  private sdk?: Promise<RepSdk>;
  private registrar?: RepRegistry;
  private reviewer?: RepRegistry;
  private registering: Promise<unknown> = Promise.resolve();
  private flushing?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private rpcFetch: typeof fetch;
  private secret?: Buffer;
  private now: () => number;

  constructor(private deps: ReputationDeps) {
    this.identities = new Identities(deps.dataDir);
    this.file = path.join(deps.dataDir, 'feedback.json');
    let raw: { items?: unknown[] } | undefined;
    try {
      raw = readStateJson(this.file);
    } catch {
      // a broken file: feedback on chain stays there
    }
    for (const x of raw?.items ?? []) {
      const f = cleanFeedback(x);
      if (f) this.feedback.set(f.key, f);
    }
    this.now = deps.now ?? Date.now;
    const rpc = new URL(deps.flags.attest.rpc);
    this.rpcFetch = deps.fetch ?? guardedRpcFetch([rpc.host], rpc.hostname === '127.0.0.1' ? { allow: (ip) => ip === '127.0.0.1' } : {});
    if (deps.timer !== false) {
      this.timer = setInterval(() => void this.flush(), FLUSH_MS);
      this.timer.unref();
    }
  }

  stop() {
    clearInterval(this.timer);
  }

  private load(): Promise<RepSdk> {
    this.sdk ??= (async () => {
      if (this.deps.loadSdk) return this.deps.loadSdk();
      const found = sdkCandidates(undefined, REPUTATION_BUILD).find((c) => existsSync(c));
      if (!found) throw new Error('onchain/reputation is not built: run npm install && npm run build there');
      return (await import(pathToFileURL(found).href)) as RepSdk;
    })();
    this.sdk.catch(() => (this.sdk = undefined));
    return this.sdk;
  }

  /** The registries: the flags', else the deployment's for a local node, else the live ones on Base Sepolia. */
  private registries(sdk: RepSdk): { identity: string; reputation: string } {
    const f = this.deps.flags.reputation;
    const d = this.deps.flags.attest.rpc.startsWith('http://127.0.0.1') ? sdk.readDeployment('localnet') : sdk.readDeployment('base-sepolia');
    return { identity: f.identity ?? d?.identity ?? sdk.IDENTITY_REGISTRY, reputation: f.registry ?? d?.reputation ?? sdk.REPUTATION_REGISTRY };
  }

  private async clients(): Promise<{ registrar: RepRegistry; reviewer: RepRegistry }> {
    const sdk = await this.load();
    const rpc = this.deps.flags.attest.rpc;
    const bad = rpcProblem(rpc);
    if (bad) throw new Error(bad);
    const r = this.registries(sdk);
    // Each key file is read once, by the SDK: its errors name the file, never its bytes.
    this.registrar ??= sdk.createRegistry({ rpcUrl: rpc, keyFile: this.deps.flags.reputation.registrarKeyFile, ...r, fetchFn: this.rpcFetch });
    this.reviewer ??= sdk.createRegistry({ rpcUrl: rpc, keyFile: this.deps.flags.attest.keyFile, ...r, fetchFn: this.rpcFetch });
    if (this.registrar.address.toLowerCase() === this.reviewer.address.toLowerCase()) throw new Error('The registrar and the attester must be different keys: the registry refuses feedback from an agent\'s owner');
    return { registrar: this.registrar, reviewer: this.reviewer };
  }

  /** The identity an attestation's worker runs as. */
  keyOf(item: Pick<OutboxItem, 'harness' | 'operator' | 'name' | 'worker'>): string {
    return agentKey(item.harness, item.operator ?? 'office', item.name ?? item.worker ?? 'agent');
  }

  /** An identity's name on public pages and its card: the operator as a pseudonym, never their name. */
  publicName(a: Pick<AgentIdentity, 'key' | 'operator'>): string {
    return publicAgentName((this.secret ??= pseudonymSecret(this.deps.dataDir)), a.key, a.operator);
  }

  /** Where an identity's card is: the office's /agents/<id>.json. */
  cardUrl(agentId: string): string {
    return `${(this.deps.flags.reputation.cardBase ?? '').replace(/\/+$/, '')}/agents/${agentId}.json`;
  }

  /**
   * The agent id an attestation's worker has, registering its identity first if it has none (one at
   * a time, so an identity is never registered twice by this office). Throws while the chain can't
   * be reached; the attestation waits in its outbox and tries again.
   */
  agentIdFor(item: OutboxItem): Promise<bigint> {
    const run = this.registering.then(async () => {
      const account = item.worker ? this.deps.ownerOf?.(item.floor, item.worker) : undefined;
      const a = this.identities.ensure(this.keyOf(item), account, this.now());
      if (!a.agentId) {
        const { registrar } = await this.clients();
        await checkChain(this.deps.flags.attest.rpc, this.rpcFetch);
        // A registration sent before whose receipt never came: looked up, so no second identity is made.
        let r = a.pendingTx ? await registrar.registered(a.pendingTx) : 'missing';
        if (r === 'pending' || (r === 'missing' && a.pendingTx && this.now() - (a.pendingAt ?? 0) < DROPPED_AFTER_MS)) throw new Error(`waiting for its registration ${a.pendingTx} to be mined`);
        if (typeof r !== 'object')
          r = await registrar.register(undefined, (hash) => {
            a.pendingTx = hash;
            a.pendingAt = this.now();
            this.identities.save();
          });
        a.agentId = r.agentId.toString();
        a.tx = r.tx;
        delete a.pendingTx;
        delete a.pendingAt;
        this.identities.save();
        this.deps.changed?.();
      }
      await this.pointAtCard(a).catch(() => undefined);
      return BigInt(a.agentId);
    });
    this.registering = run.catch(() => undefined);
    return run;
  }

  /** Sets an identity's agentURI to its card here, once there is a public address to give. */
  private async pointAtCard(a: AgentIdentity) {
    if (!a.agentId || !this.deps.flags.reputation.cardBase) return;
    const uri = this.cardUrl(a.agentId);
    if (a.uri === uri || !/^https:\/\//.test(uri)) return;
    const { registrar } = await this.clients();
    await checkChain(this.deps.flags.attest.rpc, this.rpcFetch);
    await registrar.setAgentURI(BigInt(a.agentId), uri);
    a.uri = uri;
    this.identities.save();
  }

  /** An attestation is on chain: its feedback is owed now (only for a worker with an agent id). */
  attested(item: OutboxItem) {
    if (!item.uid || !item.agentId || item.agentId === '0' || this.feedback.has(item.key)) return;
    const outcome = item.outcome === 1 ? 'merged' : item.outcome === 2 ? 'reverted' : 'closed';
    const fb = feedbackFor({ outcome, harness: /^[a-z0-9_-]{1,32}$/.test(item.harness) ? item.harness : 'unknown', ...(item.self ? { self: true } : {}), ...(item.solanaTx && item.paidAmount ? { paid: { amount: item.paidAmount, decimals: item.paidDecimals ?? 6, tx: item.solanaTx } } : {}) });
    this.feedback.set(item.key, { key: item.key, agentId: item.agentId, ...fb, feedbackURI: item.link ?? '', feedbackHash: item.uid, tries: 0, nextAt: this.now() });
    this.save();
    this.deps.changed?.();
    void this.flush();
  }

  /** Feedback still owed. */
  pending(): FeedbackItem[] {
    return [...this.feedback.values()].filter((f) => !f.tx && !f.skipped);
  }

  feedbackOf(key: string): FeedbackItem | undefined {
    return this.feedback.get(key);
  }

  /** Sends the feedback that's due, one at a time. Resolves once this round is over. */
  flush(): Promise<void> {
    this.flushing ??= this.flushNow().finally(() => (this.flushing = undefined));
    return this.flushing;
  }

  private async flushNow() {
    const due = this.pending().filter((f) => f.nextAt <= this.now());
    for (const f of due) {
      try {
        const { reviewer } = await this.clients();
        await checkChain(this.deps.flags.attest.rpc, this.rpcFetch);
        const r = await reviewer.giveFeedback({ agentId: BigInt(f.agentId), value: f.value, tag1: f.tag1, tag2: f.tag2, feedbackURI: f.feedbackURI, feedbackHash: f.feedbackHash });
        f.tx = r.tx;
        f.link = r.link;
        delete f.error;
        this.deps.changed?.();
      } catch (err) {
        const msg = (err as Error).message;
        // The registry would refuse it every time: never try again.
        if (/may not give it feedback|Self-feedback/.test(msg)) f.skipped = msg.slice(0, 300);
        else {
          f.tries++;
          f.error = msg.slice(0, 300);
          f.nextAt = this.now() + backoff(f.tries - 1);
        }
      }
      this.save();
    }
    for (const a of this.identities.list()) await this.pointAtCard(a).catch(() => undefined);
  }

  private save() {
    try {
      writeState(this.file, JSON.stringify({ items: [...this.feedback.values()] }, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }

  /** Every outcome the office attested, with its links. */
  events(): RepEvent[] {
    return eventsOf(this.deps.attestations(), (key) => this.feedback.get(key)?.link, this.deps.mint?.());
  }

  /** What Mission control shows: every identity (registered, or one a worker on the roster runs as), its record, the board per harness. */
  state(): ReputationState {
    const events = this.events();
    const workers = this.deps.workers?.() ?? [];
    const keys = new Set([...this.identities.list().map((a) => a.key), ...workers.map((w) => w.key)]);
    const agents: AgentRepView[] = [...keys].map((key) => {
      const a = this.identities.get(key);
      const [harness, operator, label] = key.split('/');
      const stats = a?.agentId ? reputationOf(events, a.agentId) : undefined;
      return {
        key,
        harness,
        operator,
        label,
        ...(a?.agentId ? { agentId: a.agentId, card: this.cardUrl(a.agentId) } : {}),
        ...(a?.tx ? { registered: `${BASESCAN}/tx/${a.tx}` } : {}),
        ...(stats ? { stats } : {}),
        workers: workers.filter((w) => w.key === key).map((w) => w.id),
      };
    });
    agents.sort((x, y) => (y.stats?.merged ?? 0) - (x.stats?.merged ?? 0) || x.key.localeCompare(y.key));
    const owed = this.deps.attestations().filter((i) => !i.uid && !i.skipped).length + this.pending().length;
    return { enabled: true, agents, harnesses: leaderboard(events, 'harness'), owed };
  }

  /** The public addresses behind the records: who attests and reviews, who registers, and where. */
  async sources(): Promise<{ attesters: string[]; registrars: string[]; identity?: string; reputation?: string }> {
    try {
      const sdk = await this.load();
      const r = this.registries(sdk);
      return { attesters: [sdk.keyFileAddress(this.deps.flags.attest.keyFile).toLowerCase()], registrars: [sdk.keyFileAddress(this.deps.flags.reputation.registrarKeyFile).toLowerCase()], identity: r.identity.toLowerCase(), reputation: r.reputation.toLowerCase() };
    } catch {
      return { attesters: [], registrars: [] };
    }
  }

  /**
   * The ERC-8004 registration file for agent `agentId`: its name, what it is, how to reach the office,
   * its wallets (the registrar holding the identity, and the operator's Solana payout wallet) and its
   * registration. No secrets and no repository names.
   */
  async card(agentId: string, base: string): Promise<object | undefined> {
    const a = this.identities.byAgentId(agentId);
    if (!a) return undefined;
    const src = await this.sources();
    const wallet = this.deps.wallet?.(a.account);
    const services: { name: string; endpoint: string; version?: string }[] = [
      { name: 'web', endpoint: `${base}/api/public/reputation/${agentId}` },
      { name: 'reputation-dataset', endpoint: `${base}/api/public/dataset.json` },
      ...(this.deps.x402?.() ? [{ name: 'x402', endpoint: `${base}/api/x402/task` }] : []),
      ...(src.registrars[0] ? [{ name: 'agentWallet', endpoint: `eip155:84532:${src.registrars[0]}` }] : []),
      ...(wallet ? [{ name: 'payoutWallet', endpoint: `${SOLANA_DEVNET}:${wallet}` }] : []),
    ];
    return {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: this.publicName(a),
      description: `A coding agent run on ${PRODUCT}: ${a.harness}, operated by ${operatorPseudonym((this.secret ??= pseudonymSecret(this.deps.dataDir)), a.operator)} (a pseudonym). Its reputation comes only from pull requests a person merged, reverted or closed (Proof of Merge, testnets only). Built on agent-office (MIT, webdevcody / AgentSystemLabs).`,
      services,
      x402Support: !!this.deps.x402?.(),
      active: true,
      registrations: src.identity ? [{ agentId: Number(agentId), agentRegistry: `eip155:84532:${src.identity}` }] : [],
      supportedTrust: ['reputation'],
      harness: a.harness,
      operator: operatorPseudonym(this.secret!, a.operator),
    };
  }
}
