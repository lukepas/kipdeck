// Proof of Merge bounties, building-wide: devnet USDC escrowed against GitHub issues (the Solana
// program in onchain/solana), claimed for the office PR a worker opened for the issue, and paid to
// the worker's owner's wallet only after a person with write access merged it and an office admin
// approved. Off until an admin turns it on in Settings.
//
// The chain holds the money and its rules; this keeps each floor in step with it on every look at
// the floor's pull requests: what was funded, which PR claims what (never a fork's: Floor.officePull),
// which merged PR waits for approval, and what was paid. The attester key signs claims and vouches
// for merges. The approver is best an admin's browser wallet (approverWallet), which adds its
// signature to a release the attester signed, so no file on this machine can pay anyone; an approver
// key file is read only when an admin approves. Only the office's own bounties count (its keys, its
// mint): a bounty someone opens with keys of their own sits at another address and is ignored.
import path from 'node:path';
import type { BountiesState, BountyView, GhPull, ServerMsg } from '../shared/protocol.js';
import type { Floor } from './floor.js';
import { loadEscrow, guardedRpcFetch, type AttesterApi, type ChainBounty, type Escrow, type EscrowSdk, type Signer } from './chain/sdk.js';
import { ChainSettings } from './chain/settings.js';
import { BountyStore, type StoredBounty } from './chain/store.js';
import { pullFacts, type GhRun } from './chain/merge-proof.js';
import { mergerPseudonym, pseudonymSecret } from './chain/pseudonym.js';
import { actionGet, actionPost, prepareFund, type FundingParts } from './chain/funding.js';

type ToastLevel = 'info' | 'warn' | 'error';

export interface BountiesDeps {
  /** The office's data folder (chain.json goes there). */
  dataDir: string;
  floors(): Iterable<Floor>;
  broadcast(msg: ServerMsg): void;
  toastFloor(floor: Floor, text: string, level?: ToastLevel): void;
  /** Tests: the SDK (default: its build in onchain/solana/sdk/dist). */
  loadSdk?: () => Promise<EscrowSdk>;
  /** Tests: the escrow to use instead of the configured one (a MockEscrow, say). */
  escrow?: (sdk: EscrowSdk) => Escrow;
  /** Tests: how a key file is read (default the SDK's readKeypair: mode 0600 or tighter). */
  readKey?: (file: string) => Signer;
  /** Tests: how gh is run when a merge is checked. */
  gh?: GhRun;
}

export { MAX_FUND } from './chain/funding.js';
const NO_ACTION = { status: 404, body: { message: 'No bounties are open for funding on that repository' } };
/** How long before its expiry an admin is warned about a payout still waiting for approval. */
export const EXPIRY_WARNING_MS = 24 * 60 * 60_000;
/** How often a blocked merge is checked with GitHub again, while the chain still holds the bounty. */
export const RECHECK_BLOCKED_MS = 10 * 60_000;


const issueOk = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

export class Bounties {
  readonly settings: ChainSettings;
  private sdk?: EscrowSdk;
  private escrow?: Escrow;
  private attester?: AttesterApi;
  private attesterKey?: Signer;
  private approverAddress?: string;
  private approverWallet?: string;
  private token = { symbol: 'USDC', decimals: 6, mint: '' };
  private error?: string;
  private floorErrors = new Map<string, string>();
  private stores = new Map<string, BountyStore>();
  private repos = new Map<string, string>();
  private running = new Map<string, Promise<void>>();
  private again = new Set<string>();
  /** floor id + issue of approvals in flight, so a second approve or a look doesn't cross one. */
  private paying = new Set<string>();
  private configured: Promise<void> = Promise.resolve();

  constructor(private deps: BountiesDeps) {
    this.settings = new ChainSettings(deps.dataDir, () => this.reconfigure());
    this.reconfigure();
  }

  /** Settings changed (or the office started): set the escrow up again, then look at every floor. */
  reconfigure() {
    this.configured = this.setup().then(() => {
      for (const f of this.deps.floors()) void this.sync(f);
    });
  }

  /** Settles once the escrow is set up (tests). */
  ready(): Promise<void> {
    return this.configured;
  }

  private async setup() {
    this.escrow = this.attester = this.attesterKey = this.approverAddress = this.approverWallet = this.error = undefined;
    const s = this.settings.get();
    if (!s.enabled) return;
    try {
      const sdk = (this.sdk = await (this.deps.loadSdk ?? loadEscrow)());
      if (s.backend === 'solana-devnet' && !this.deps.escrow && !s.programId) throw new Error('set the escrow program id in Settings (onchain/solana/deployments/devnet.json has it)');
      const mint = s.mint ?? (s.backend === 'mock' ? sdk.TEST_MINT : sdk.DEVNET_USDC_MINT);
      const escrow = this.deps.escrow?.(sdk) ?? sdk.createEscrow({ backend: s.backend, programId: s.programId, mint, testMint: mint === sdk.TEST_MINT, fetch: guardedRpcFetch() });
      const read = this.keyReader(sdk, s.backend);
      const key = read(s.attesterKey);
      // An approver wallet: no key here at all. Otherwise only the approver key's address is kept; the
      // key is read again when an admin approves a payout.
      this.approverWallet = s.approverWallet && s.backend !== 'mock' ? s.approverWallet : undefined;
      this.approverAddress = this.approverWallet ?? read(s.approverKey).publicKey;
      if (this.approverAddress === key.publicKey) throw new Error('the approver must be another key than the attester');
      this.attesterKey = key;
      const secret = pseudonymSecret(this.deps.dataDir);
      this.attester = new sdk.Attester(escrow, key, { pseudonym: (id) => mergerPseudonym(secret, id) });
      this.escrow = escrow;
      try {
        this.token = await escrow.token();
      } catch (err) {
        this.error = `can't read the mint: ${(err as Error).message}`;
      }
    } catch (err) {
      // readKeypair's errors name the file, never its bytes.
      this.error = (err as Error).message;
      this.escrow = this.attester = this.attesterKey = undefined;
    }
  }

  /**
   * How key files are read: the SDK's readKeypair (mode 0600 or tighter, nothing of the key in an
   * error). The mock takes keys at their word, so it runs without any: a made-up address per file.
   */
  private keyReader(sdk: EscrowSdk, backend: string): (file: string) => Signer {
    if (this.deps.readKey) return this.deps.readKey;
    if (backend === 'mock') return (file) => ({ publicKey: sdk.mockAddress(path.basename(file)) });
    return (file) => sdk.readKeypair(file);
  }

  /** Whose bounties are the office's: its attester's and approver's, in its mint. */
  private ownKeys(): { attester: string; approver: string; mint?: string } | undefined {
    if (!this.attester || !this.approverAddress) return undefined;
    return { attester: this.attester.address, approver: this.approverAddress, ...(this.token.mint ? { mint: this.token.mint } : {}) };
  }

  /** The office's own among a repository's bounties (see ownKeys). */
  private own(chain: readonly ChainBounty[]): ChainBounty[] {
    const k = this.ownKeys();
    return k ? chain.filter((b) => b.attester === k.attester && b.approver === k.approver && (!k.mint || b.mint === k.mint)) : [];
  }

  /** A bounty's ref with the office's keys, so the escrow reads it at its own address. */
  private ref(repo: string, b: { issue: number; nonce: number }) {
    return { repo, issue: b.issue, nonce: b.nonce, attester: this.attester!.address, approver: this.approverAddress! };
  }

  get enabled(): boolean {
    return this.settings.get().enabled;
  }

  get network(): string {
    return this.escrow?.network ?? this.settings.get().backend;
  }

  private store(floor: Floor): BountyStore {
    let s = this.stores.get(floor.id);
    if (!s) this.stores.set(floor.id, (s = new BountyStore(path.join(floor.dir, '.agent-office'))));
    return s;
  }

  /** The floor's repository, "owner/name" lowercased, once GitHub said. */
  private async repoOf(floor: Floor): Promise<string | undefined> {
    const known = this.repos.get(floor.id);
    if (known) return known;
    try {
      const name = (await floor.github.repoInfo()).nameWithOwner.toLowerCase();
      this.repos.set(floor.id, name);
      return name;
    } catch {
      return undefined;
    }
  }

  /** The floor whose repository is `repo` ("owner/name", any case). */
  async floorOfRepo(repo: string): Promise<Floor | undefined> {
    const want = repo.toLowerCase();
    for (const f of this.deps.floors()) if ((await this.repoOf(f)) === want) return f;
    return undefined;
  }

  private explorer(id: string, kind: 'tx' | 'address' = 'tx'): string | undefined {
    return this.escrow?.explorer(id, kind);
  }

  view(b: StoredBounty): BountyView {
    const url = this.explorer(b.pda, 'address');
    return {
      issue: b.issue,
      nonce: b.nonce,
      pda: b.pda,
      amount: b.amount,
      decimals: this.token.decimals,
      symbol: this.token.symbol,
      funders: b.funders,
      expiry: b.expiry,
      phase: b.phase,
      ...(b.claimPr ? { claimPr: b.claimPr } : {}),
      ...(b.workerId ? { workerId: b.workerId } : {}),
      ...(b.workerName ? { workerName: b.workerName } : {}),
      ...(b.note ? { note: b.note } : {}),
      ...(b.facts?.mergedBy ? { mergedBy: b.facts.mergedBy.login } : {}),
      txs: b.txs.map((t) => {
        const link = this.explorer(t.sig);
        return link ? { ...t, url: link } : t;
      }),
      ...(url ? { url } : {}),
    };
  }

  /** What the people on `floor` see (FloorView.bounties). */
  state(floor: Floor | undefined): BountiesState {
    const s = this.settings.get();
    const repo = floor && this.repos.get(floor.id);
    const error = this.error ?? (floor && this.floorErrors.get(floor.id));
    return {
      enabled: s.enabled,
      network: this.network,
      ...(this.escrow ? { programId: this.escrow.programId } : {}),
      items: floor && s.enabled ? this.store(floor).list().map((b) => this.view(b)) : [],
      ...(repo ? { repo } : {}),
      blink: !!repo && s.actionRepos.includes(repo),
      ...(s.enabled && error ? { error } : {}),
    };
  }

  private publish(floor: Floor) {
    // Everyone, not just the floor: the review inbox spans every floor.
    this.deps.broadcast({ t: 'bounties', floor: floor.id, state: this.state(floor) });
  }

  /** The bounty paid for PR `pr` on a floor, when one was: its devnet signature and amount (proof of merge carries it). */
  payout(floorId: string, pr: number): { tx: string; amount: string; decimals: number } | undefined {
    const b = this.stores.get(floorId)?.list().find((x) => x.claimPr === pr);
    const sig = b?.txs.filter((t) => t.kind === 'paid').at(-1)?.sig;
    return b && sig && /^[1-9A-HJ-NP-Za-km-z]{32,90}$/.test(sig) ? { tx: sig, amount: b.amount, decimals: this.token.decimals } : undefined;
  }

  /** Whether a bounty claimed by PR `pr` still waits to be paid: merged and waiting for an admin, or being paid. */
  payoutPending(floorId: string, pr: number): boolean {
    return !!this.stores.get(floorId)?.list().some((x) => x.claimPr === pr && (x.phase === 'claimed' || x.phase === 'awaiting-approval' || x.phase === 'paying'));
  }

  /** The floor's pull requests came back from GitHub: look at its bounties again. */
  pulls(floor: Floor) {
    if (this.enabled) void this.sync(floor);
  }

  /** Looks at a floor's bounties on chain and moves them on. Never two at once per floor. */
  sync(floor: Floor): Promise<void> {
    const busy = this.running.get(floor.id);
    if (busy) {
      this.again.add(floor.id);
      return busy;
    }
    const run = (async () => {
      do {
        this.again.delete(floor.id);
        await this.look(floor);
      } while (this.again.has(floor.id));
    })().finally(() => this.running.delete(floor.id));
    this.running.set(floor.id, run);
    return run;
  }

  private async look(floor: Floor) {
    await this.configured;
    const escrow = this.escrow;
    if (!escrow || !this.attester) return this.publish(floor);
    const repo = await this.repoOf(floor);
    if (!repo) return this.publish(floor);
    let chain: ChainBounty[];
    let now: number;
    try {
      [chain, now] = await Promise.all([escrow.list(repo), escrow.now()]);
      chain = this.own(chain);
      this.floorErrors.delete(floor.id);
    } catch (err) {
      this.floorErrors.set(floor.id, `can't read the escrow: ${(err as Error).message}`);
      return this.publish(floor);
    }
    const store = this.store(floor);
    const live = new Map<number, ChainBounty>();
    for (const issue of new Set(chain.map((b) => b.issue))) {
      const { bounty } = this.sdk!.activeBounty(chain, issue, { now });
      const pick = bounty ?? chain.filter((b) => b.issue === issue).sort((a, b) => b.nonce - a.nonce)[0];
      live.set(issue, pick);
      await this.follow(floor, store, pick, now);
    }
    const pulls = floor.github.pulls.items;
    for (const b of store.list()) {
      const c = live.get(b.issue);
      if (!c || c.address !== b.pda) continue;
      if (b.phase === 'open' || b.phase === 'claimed') await this.claim(floor, repo, store, b, c, pulls);
      // A blocked merge is looked at again now and then while the chain still holds it: what blocked
      // it may have been GitHub failing, or another office PR for the issue may have merged since.
      const recheck = b.phase === 'blocked' && c.state === 'claimed' && Date.now() - (b.checkedAt ?? 0) > RECHECK_BLOCKED_MS;
      if (recheck) await this.claim(floor, repo, store, b, c, pulls);
      if (b.phase === 'claimed' || recheck) await this.checkMerge(floor, repo, store, b, pulls);
      this.warnExpiry(floor, store, b, now * 1000);
    }
    this.publish(floor);
  }

  /** Brings the office's record of one bounty in line with the chain, noting what changed on the timeline. */
  private async follow(floor: Floor, store: BountyStore, c: ChainBounty, now: number) {
    let b = store.get(c.issue);
    const fresh = !b || b.pda !== c.address;
    if (!b || b.pda !== c.address) b = { issue: c.issue, nonce: c.nonce, pda: c.address, amount: '0', funders: 0, expiry: c.expiryTs * 1000, phase: 'open', txs: [] };
    const was = BigInt(b.amount);
    // One settled before the office first saw it (a new floor, say) is history, not news.
    const settled = c.state === 'released' || c.state === 'refunded' || c.state === 'cancelled';
    if (c.total > was && !(fresh && settled)) {
      // Its signature when the RPC keeps history (devnet does; a bare local validator may not).
      const sig = await this.latestSig(c.address);
      if (!sig || store.tx(b, 'funded', sig)) floor.watch.bounty('bounty-funded', { issue: c.issue, ...(sig ? { tx: sig } : {}), text: `#${c.issue}'s bounty is ${this.money(c.total)} now (${c.funderCount} funder${c.funderCount === 1 ? '' : 's'})` });
    }
    b.amount = c.total.toString();
    b.funders = c.funderCount;
    b.expiry = c.expiryTs * 1000;
    if (c.prNumber) b.claimPr = c.prNumber;
    const before = b.phase;
    if (c.state === 'released') b.phase = 'released';
    else if (c.state === 'refunded') b.phase = 'refunded';
    else if (c.state === 'cancelled') b.phase = 'cancelled';
    else if (now > c.expiryTs) b.phase = 'expired';
    else if (c.state === 'claimed' && (b.phase === 'open' || b.phase === 'expired')) b.phase = 'claimed';
    else if (c.state === 'claimed' && b.phase === 'paying' && !this.paying.has(`${floor.id}#${c.issue}`)) {
      // A payout that never landed (the office stopped mid-way, say): back before an admin.
      b.phase = 'awaiting-approval';
      b.note = "the last payout didn't land: approve it again";
    }
    if (before !== b.phase && b.phase === 'refunded' && !fresh) {
      const sig = await this.latestSig(c.address);
      if (!sig || store.tx(b, 'refunded', sig)) floor.watch.bounty('bounty-refunded', { issue: c.issue, ...(sig ? { tx: sig } : {}), text: `#${c.issue}'s bounty went back to its funders` });
    }
    // Paid without the office seeing the receipt (a confirm that timed out, a restart, an approver
    // wallet that sent it): the payout is recorded from the chain, as if approve() had seen it.
    if (b.phase === 'released' && !fresh && !b.txs.some((t) => t.kind === 'paid')) {
      const sig = await this.latestSig(c.address);
      if (sig) this.paid(floor, store, b, sig, c.paid ?? c.total, 'paid');
    }
    store.put(b);
  }

  /** Notes a payout: on the bounty, the timeline and everyone's screen. Returns the explorer link. */
  private paid(floor: Floor, store: BountyStore, b: StoredBounty, sig: string, amount: bigint, how: string): string | undefined {
    b.phase = 'released';
    delete b.note;
    if (!store.tx(b, 'paid', sig)) return this.explorer(sig);
    floor.watch.bounty('bounty-paid', { issue: b.issue, pr: b.claimPr, tx: sig, worker: b.workerId, name: b.workerName, text: `${how} ${this.money(amount)} to ${b.workerName ?? 'the office'} for PR #${b.claimPr}` });
    const url = this.explorer(sig);
    this.deps.broadcast({ t: 'bounty.paid', floor: floor.id, issue: b.issue, pr: b.claimPr ?? 0, amount: amount.toString(), symbol: this.token.symbol, ...(b.workerName ? { workerName: b.workerName } : {}), ...(url ? { url } : {}) });
    return url;
  }

  /** A payout waiting for an admin is warned about once, a day before the bounty expires: after that the chain refuses it. */
  private warnExpiry(floor: Floor, store: BountyStore, b: StoredBounty, nowMs: number) {
    if (b.phase !== 'awaiting-approval' || b.warned || b.expiry - nowMs > EXPIRY_WARNING_MS || b.expiry < nowMs) return;
    b.warned = true;
    store.put(b);
    const hours = Math.max(1, Math.round((b.expiry - nowMs) / 3_600_000));
    this.deps.toastFloor(floor, `⏳ #${b.issue}'s ${this.money(BigInt(b.amount))} bounty expires in about ${hours} h: approve the payout for PR #${b.claimPr} before then, or it goes back to its funders`, 'warn');
  }

  /** A worker's office PR closes the issue: the attester binds it, and its owner's wallet. */
  private async claim(floor: Floor, repo: string, store: BountyStore, b: StoredBounty, c: ChainBounty, pulls: readonly GhPull[]) {
    // Never a fork's, whatever branch it's on (officePull refuses forks), and only ones closing this issue.
    const mine = pulls.filter((x) => x.closes.includes(b.issue) && floor.officePull(x)).sort((x, y) => x.number - y.number);
    const merged = mine.find((x) => x.state === 'MERGED');
    const current = b.claimPr ? pulls.find((p) => p.number === b.claimPr) : undefined;
    const held = b.phase === 'claimed' || b.phase === 'blocked';
    // The claimed PR merged, or is still open while no other office PR for the issue merged: it keeps the claim.
    if (held && b.claimPr && (current?.state === 'MERGED' || ((!current || current.state === 'OPEN') && !merged))) return;
    // Another office PR for the issue merged (the claimed one didn't): that one is what fixed it, and is claimed.
    const p = merged ?? mine.find((x) => x.state === 'OPEN');
    if (!p || (held && b.claimPr === p.number && c.prNumber === p.number)) return;
    const w = floor.workers.list().find((x) => x.pr?.number === p.number || x.worktree?.branch === p.headRefName || x.worktree?.made === p.headRefName);
    const owner = w ? floor.workers.ownerOf(w.id) : undefined;
    const wallet = this.settings.wallet(owner);
    b.workerId = w?.id;
    b.workerName = w?.name;
    if (!wallet) {
      b.note = `set a payout wallet (Settings, Bounties) for ${w ? `${w.name}'s owner` : 'the office'} to claim it with PR #${p.number}`;
      return store.put(b);
    }
    try {
      const r = await this.attester!.claim(this.ref(repo, b), { repo, number: p.number, officeMade: true, fork: !!p.fork, closesIssue: true, merged: p.state === 'MERGED' }, wallet);
      b.phase = 'claimed';
      delete b.facts;
      b.claimPr = p.number;
      delete b.note;
      if (store.tx(b, 'claimed', r.signature)) floor.watch.bounty('bounty-claimed', { issue: b.issue, pr: p.number, tx: r.signature, worker: w?.id, name: w?.name, text: `PR #${p.number} claimed #${b.issue}'s bounty${w ? ` for ${w.name}` : ''}` });
    } catch (err) {
      b.note = `couldn't claim it: ${(err as Error).message}`;
    }
    store.put(b);
  }

  /** The claimed PR merged: check with GitHub who merged it, and put it before an admin if it counts. */
  private async checkMerge(floor: Floor, repo: string, store: BountyStore, b: StoredBounty, pulls: readonly GhPull[]) {
    const p = pulls.find((x) => x.number === b.claimPr && x.state === 'MERGED');
    if (!p) return;
    b.checkedAt = Date.now();
    try {
      const facts = await pullFacts(floor.dir, repo, p.number, b.issue, floor.officePull(p), !!p.fork, this.deps.gh);
      const v = this.sdk!.checkRelease(facts);
      b.facts = facts;
      if (v.ok) {
        b.phase = 'awaiting-approval';
        delete b.note;
        delete b.warned;
        this.deps.toastFloor(floor, `💰 PR #${p.number} merged: its ${this.money(BigInt(b.amount))} bounty waits for an admin to approve the payout`);
      } else {
        b.phase = 'blocked';
        b.note = v.reason;
      }
    } catch (err) {
      b.note = `couldn't check the merge with GitHub: ${(err as Error).message}`;
    }
    store.put(b);
  }

  /** The last transaction that touched an account, for the timeline (devnet), or the mock's last event for it. */
  private async latestSig(address: string): Promise<string | undefined> {
    const e = this.escrow as Escrow & { events?: () => { signature: string; event: { bounty?: string } }[] };
    try {
      if (e.events) return [...e.events()].reverse().find((x) => x.event.bounty === address)?.signature;
      const r = await e.rpc?.call<{ signature: string }[]>('getSignaturesForAddress', [address, { limit: 1 }]);
      return r?.[0]?.signature;
    } catch {
      return undefined;
    }
  }

  money(amount: bigint): string {
    return `${this.sdk ? this.sdk.formatAmount(amount, this.token.decimals) : amount.toString()} ${this.token.symbol}`;
  }

  /**
   * An admin approved the payout of issue `issue`'s bounty: checked with GitHub once more, then
   * released with the attester's key and the approver's. With an approver wallet, the attester signs
   * and `tx` goes back to the admin, whose wallet adds the approver's signature and sends it; the next
   * look at the chain records the payout. Otherwise the approver key is read from its file only now.
   * The caller checked the admin.
   */
  async approve(floor: Floor, issue: unknown, by: string): Promise<{ sig?: string; url?: string; error?: string; tx?: string; approver?: string }> {
    await this.configured;
    if (!issueOk(issue)) return { error: 'Which issue?' };
    const key = `${floor.id}#${issue}`;
    const store = this.store(floor);
    const b = store.get(issue);
    if (this.paying.has(key)) return { error: `#${issue}'s payout is already being approved` };
    if (!b || b.phase !== 'awaiting-approval' || !b.claimPr) return { error: `Nothing waits for approval on #${issue}` };
    // Taken before anything is awaited, so two admins approving at once can't both go on.
    this.paying.add(key);
    try {
      return await this.approveNow(floor, store, b, by);
    } finally {
      this.paying.delete(key);
    }
  }

  private async approveNow(floor: Floor, store: BountyStore, b: StoredBounty, by: string): Promise<{ sig?: string; url?: string; error?: string; tx?: string; approver?: string }> {
    const repo = await this.repoOf(floor);
    if (!this.attester || !this.sdk || !this.escrow || !repo) return { error: this.error ?? 'Bounties are off' };
    if ((await this.escrow.now().catch(() => 0)) * 1000 > b.expiry) return { error: `#${b.issue}'s bounty expired: the escrow no longer pays it, and its funders can take theirs back` };
    const pr = b.claimPr!;
    const p = floor.github.pulls.items.find((x) => x.number === pr);
    // The board lists the last few dozen PRs; an older one is still the office's: the office's attester
    // claimed it on chain, and it claims only office PRs (and what was checked at merge time says so).
    const officeMade = p ? floor.officePull(p) : (b.facts?.officeMade ?? true);
    let facts;
    try {
      facts = await pullFacts(floor.dir, repo, pr, b.issue, officeMade, !!(p?.fork ?? b.facts?.fork), this.deps.gh);
    } catch (err) {
      return { error: `couldn't check the merge with GitHub: ${(err as Error).message}` };
    }
    const v = this.sdk.checkRelease(facts);
    if (!v.ok) {
      b.phase = 'blocked';
      b.note = v.reason;
      b.checkedAt = Date.now();
      store.put(b);
      this.publish(floor);
      return { error: v.reason };
    }
    b.facts = facts;
    const ref = this.ref(repo, b);
    if (this.approverWallet) {
      try {
        const tx = await this.attester.prepareRelease(ref, facts, this.approverWallet);
        b.note = `waiting for ${by}'s wallet to sign the payout`;
        store.put(b);
        this.publish(floor);
        return { tx, approver: this.approverWallet };
      } catch (err) {
        return { error: `couldn't build the payout: ${(err as Error).message}` };
      }
    }
    b.phase = 'paying';
    store.put(b);
    this.publish(floor);
    try {
      const s = this.settings.get();
      const approver = this.keyReader(this.sdk, s.backend)(s.approverKey);
      const r = await this.attester.release(ref, facts, approver);
      const url = this.paid(floor, store, b, r.signature, r.bounty?.paid ?? BigInt(b.amount), `${by} approved: paid`);
      store.put(b);
      this.publish(floor);
      return { sig: r.signature, ...(url ? { url } : {}) };
    } catch (err) {
      // What the chain says wins: a release that landed after all is recorded by the next look.
      b.phase = 'awaiting-approval';
      b.note = `the payout didn't go through: ${(err as Error).message}`;
      store.put(b);
      void this.sync(floor);
      return { error: b.note };
    }
  }

  /**
   * Cranks the contributions of the issue's expired or cancelled bounties (the office's own, older
   * nonces too) back to their funders, the attester paying the fees. The caller checked the admin.
   */
  async refund(floor: Floor, issue: unknown): Promise<string | undefined> {
    await this.configured;
    if (!issueOk(issue)) return 'Which issue?';
    const repo = await this.repoOf(floor);
    if (!this.escrow || !this.attesterKey || !repo) return this.error ?? 'Bounties are off';
    let due: ChainBounty[];
    try {
      const [chain, now] = await Promise.all([this.escrow.list(repo), this.escrow.now()]);
      due = this.own(chain).filter((c) => c.issue === issue && (c.state === 'cancelled' || ((c.state === 'open' || c.state === 'claimed') && now > c.expiryTs)) && c.refundedCount < c.funderCount);
    } catch (err) {
      return `can't read the escrow: ${(err as Error).message}`;
    }
    if (!due.length) return `#${issue}'s bounty hasn't expired`;
    try {
      for (const c of due) {
        const ref = this.ref(repo, c);
        for (const x of await this.escrow.contributions(ref)) if (!x.refunded) await this.escrow.refund(ref, x.funder, this.attesterKey);
      }
    } catch (err) {
      return `the refund stopped: ${(err as Error).message}`;
    }
    await this.sync(floor);
    return undefined;
  }

  /** What funding (chain/funding.ts) needs, or why bounties can't be funded now. */
  private async funding(): Promise<FundingParts | string> {
    await this.configured;
    const s = this.settings.get();
    if (!s.enabled || !this.sdk || !this.escrow || !this.attester || !this.approverAddress) return this.error ?? 'Bounties are off';
    return {
      sdk: this.sdk,
      escrow: this.escrow,
      attester: this.attester.address,
      approver: this.approverAddress,
      token: this.token,
      expiryDays: s.expiryDays,
      actionTitles: s.actionTitles,
      actionRepos: s.actionRepos,
      repoOf: (f) => this.repoOf(f),
      floorOfRepo: (r) => this.floorOfRepo(r),
      stored: (f, issue) => this.store(f).get(issue),
      own: (chain) => this.own(chain),
      sync: (f) => this.sync(f),
    };
  }

  /** A transaction for `wallet` to sign that opens the issue's bounty if needed and funds it (chain/funding.ts). */
  async prepareFund(floor: Floor, issue: unknown, amountText: unknown, wallet: unknown): Promise<{ tx?: string; error?: string }> {
    const p = await this.funding();
    return typeof p === 'string' ? { error: p } : prepareFund(p, floor, issue, amountText, wallet);
  }

  /** The public Action's GET payload (chain/funding.ts). */
  async actionGet(repo: string, issue: number, baseUrl: string): Promise<{ status: number; body: unknown }> {
    const p = await this.funding();
    return typeof p === 'string' ? NO_ACTION : actionGet(p, repo, issue, baseUrl);
  }

  /** The public Action's POST answer (chain/funding.ts). */
  async actionPost(repo: string, issue: number, amount: string, account: string): Promise<{ status: number; body: unknown }> {
    const p = await this.funding();
    return typeof p === 'string' ? NO_ACTION : actionPost(p, repo, issue, amount, account);
  }

  /** Public addresses of the keys, for Settings. */
  keys(): { attester?: string; approver?: string } {
    return { ...(this.attester ? { attester: this.attester.address } : {}), ...(this.approverAddress ? { approver: this.approverAddress } : {}) };
  }

  isAddress(a: string): boolean {
    return this.sdk ? this.sdk.isAddress(a) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  }
}
