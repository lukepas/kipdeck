// Proof of Merge bounties, building-wide: devnet USDC escrowed against GitHub issues (the Solana
// program in onchain/solana), claimed for the office PR a worker opened for the issue, and paid to
// the worker's owner's wallet only after a person with write access merged it and an office admin
// approved. Off until an admin turns it on in ⚙️ Settings.
//
// The chain holds the money and its rules; this keeps each floor in step with it on every look at
// the floor's pull requests: what was funded, which PR claims what (never a fork's: Floor.officePull),
// which merged PR waits for approval, and what was paid. The attester key signs claims and vouches
// for merges; the approver key is read only when an admin approves, after the admin check.
import path from 'node:path';
import type { BountiesState, BountyView, GhPull, ServerMsg } from '../shared/protocol.js';
import type { Floor } from './floor.js';
import { loadEscrow, guardedRpcFetch, type AttesterApi, type ChainBounty, type Escrow, type EscrowSdk, type Signer } from './chain/sdk.js';
import { ChainSettings } from './chain/settings.js';
import { BountyStore, type StoredBounty } from './chain/store.js';
import { pullFacts, type GhRun } from './chain/merge-proof.js';

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

/** The most a single funding from the office may put in, in whole tokens. */
export const MAX_FUND = 100_000;

const issueOk = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

export class Bounties {
  readonly settings: ChainSettings;
  private sdk?: EscrowSdk;
  private escrow?: Escrow;
  private attester?: AttesterApi;
  private attesterKey?: Signer;
  private approverAddress?: string;
  private token = { symbol: 'USDC', decimals: 6, mint: '' };
  private error?: string;
  private floorErrors = new Map<string, string>();
  private stores = new Map<string, BountyStore>();
  private repos = new Map<string, string>();
  private running = new Map<string, Promise<void>>();
  private again = new Set<string>();
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
    this.escrow = this.attester = this.attesterKey = this.approverAddress = this.error = undefined;
    const s = this.settings.get();
    if (!s.enabled) return;
    try {
      const sdk = (this.sdk = await (this.deps.loadSdk ?? loadEscrow)());
      if (s.backend === 'solana-devnet' && !this.deps.escrow && !s.programId) throw new Error('set the escrow program id in ⚙️ Settings (onchain/solana/deployments/devnet.json has it)');
      const mint = s.mint ?? (s.backend === 'mock' ? sdk.TEST_MINT : sdk.DEVNET_USDC_MINT);
      const escrow = this.deps.escrow?.(sdk) ?? sdk.createEscrow({ backend: s.backend, programId: s.programId, mint, testMint: mint === sdk.TEST_MINT, fetch: guardedRpcFetch() });
      const read = this.keyReader(sdk, s.backend);
      const key = read(s.attesterKey);
      // Only the approver's address is kept; its key is read again when an admin approves a payout.
      this.approverAddress = read(s.approverKey).publicKey;
      this.attesterKey = key;
      this.attester = new sdk.Attester(escrow, key);
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

  /** The devnet signature of the bounty paid for PR `pr` on a floor, when one was (proof of merge carries it). */
  paidTx(floorId: string, pr: number): string | undefined {
    const b = this.stores.get(floorId)?.list().find((x) => x.claimPr === pr);
    const sig = b?.txs.filter((t) => t.kind === 'paid').at(-1)?.sig;
    return sig && /^[1-9A-HJ-NP-Za-km-z]{32,90}$/.test(sig) ? sig : undefined;
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
      this.floorErrors.delete(floor.id);
    } catch (err) {
      this.floorErrors.set(floor.id, `can't read the escrow: ${(err as Error).message}`);
      return this.publish(floor);
    }
    const store = this.store(floor);
    const live = new Map<number, ChainBounty>();
    for (const issue of new Set(chain.map((b) => b.issue))) {
      const { bounty } = this.sdk!.activeBounty(chain, issue);
      const pick = bounty ?? chain.filter((b) => b.issue === issue).sort((a, b) => b.nonce - a.nonce)[0];
      live.set(issue, pick);
      await this.follow(floor, store, pick, now);
    }
    const pulls = floor.github.pulls.items;
    for (const b of store.list()) {
      const c = live.get(b.issue);
      if (!c || c.address !== b.pda) continue;
      if (b.phase === 'open' || b.phase === 'claimed') await this.claim(floor, repo, store, b, c, pulls);
      if (b.phase === 'claimed') await this.checkMerge(floor, repo, store, b, pulls);
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
    if (before !== b.phase && b.phase === 'refunded' && !fresh) {
      const sig = await this.latestSig(c.address);
      if (!sig || store.tx(b, 'refunded', sig)) floor.watch.bounty('bounty-refunded', { issue: c.issue, ...(sig ? { tx: sig } : {}), text: `#${c.issue}'s bounty went back to its funders` });
    }
    store.put(b);
  }

  /** A worker's office PR closes the issue: the attester binds it, and its owner's wallet. */
  private async claim(floor: Floor, repo: string, store: BountyStore, b: StoredBounty, c: ChainBounty, pulls: readonly GhPull[]) {
    if (b.claimPr) {
      const current = pulls.find((p) => p.number === b.claimPr);
      // Still open or merged: it keeps the claim. Closed unmerged: another PR may take it.
      if (b.phase === 'claimed' && (!current || current.state === 'OPEN' || current.state === 'MERGED')) return;
    }
    // Never a fork's, whatever branch it's on (officePull refuses forks), and only one closing this issue.
    const p = pulls.filter((x) => x.state === 'OPEN' && x.closes.includes(b.issue) && floor.officePull(x)).sort((x, y) => x.number - y.number)[0];
    if (!p || (b.phase === 'claimed' && b.claimPr === p.number && c.prNumber === p.number)) return;
    const w = floor.workers.list().find((x) => x.pr?.number === p.number || x.worktree?.branch === p.headRefName || x.worktree?.made === p.headRefName);
    const owner = w ? floor.workers.ownerOf(w.id) : undefined;
    const wallet = this.settings.wallet(owner);
    b.workerId = w?.id;
    b.workerName = w?.name;
    if (!wallet) {
      b.note = `set a payout wallet (⚙️ Settings, Bounties) for ${w ? `${w.name}'s owner` : 'the office'} to claim it with PR #${p.number}`;
      return store.put(b);
    }
    try {
      const r = await this.attester!.claim({ repo, issue: b.issue, nonce: b.nonce }, { repo, number: p.number, officeMade: true, fork: !!p.fork, closesIssue: true, merged: false }, wallet);
      b.phase = 'claimed';
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
    try {
      const facts = await pullFacts(floor.dir, repo, p.number, b.issue, floor.officePull(p), !!p.fork, this.deps.gh);
      const v = this.sdk!.checkRelease(facts);
      b.facts = facts;
      if (v.ok) {
        b.phase = 'awaiting-approval';
        delete b.note;
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
   * released with the attester's key and the approver's, read from its file only now. The caller
   * checked the admin.
   */
  async approve(floor: Floor, issue: unknown, by: string): Promise<{ sig?: string; url?: string; error?: string }> {
    await this.configured;
    if (!issueOk(issue)) return { error: 'Which issue?' };
    const store = this.store(floor);
    const b = store.get(issue);
    const repo = await this.repoOf(floor);
    if (!this.attester || !this.sdk || !repo) return { error: this.error ?? 'Bounties are off' };
    if (!b || b.phase !== 'awaiting-approval' || !b.claimPr) return { error: `Nothing waits for approval on #${issue}` };
    const p = floor.github.pulls.items.find((x) => x.number === b.claimPr);
    let facts;
    try {
      facts = await pullFacts(floor.dir, repo, b.claimPr, b.issue, !!p && floor.officePull(p), !!p?.fork, this.deps.gh);
    } catch (err) {
      return { error: `couldn't check the merge with GitHub: ${(err as Error).message}` };
    }
    const v = this.sdk.checkRelease(facts);
    if (!v.ok) {
      b.phase = 'blocked';
      b.note = v.reason;
      store.put(b);
      this.publish(floor);
      return { error: v.reason };
    }
    b.phase = 'paying';
    store.put(b);
    this.publish(floor);
    try {
      const s = this.settings.get();
      const approver = this.keyReader(this.sdk, s.backend)(s.approverKey);
      const r = await this.attester.release({ repo, issue: b.issue, nonce: b.nonce }, facts, approver);
      b.phase = 'released';
      b.facts = facts;
      delete b.note;
      const amount = r.bounty?.paid ?? BigInt(b.amount);
      if (store.tx(b, 'paid', r.signature)) {
        floor.watch.bounty('bounty-paid', { issue: b.issue, pr: b.claimPr, tx: r.signature, worker: b.workerId, name: b.workerName, text: `${by} approved: paid ${this.money(amount)} to ${b.workerName ?? 'the office'} for PR #${b.claimPr}` });
      }
      store.put(b);
      const url = this.explorer(r.signature);
      this.deps.broadcast({ t: 'bounty.paid', floor: floor.id, issue: b.issue, pr: b.claimPr, amount: amount.toString(), symbol: this.token.symbol, ...(b.workerName ? { workerName: b.workerName } : {}), ...(url ? { url } : {}) });
      this.publish(floor);
      return { sig: r.signature, ...(url ? { url } : {}) };
    } catch (err) {
      b.phase = 'awaiting-approval';
      b.note = `the payout didn't go through: ${(err as Error).message}`;
      store.put(b);
      this.publish(floor);
      return { error: b.note };
    }
  }

  /** Cranks an expired or cancelled bounty's contributions back to their funders, the attester paying the fees. */
  async refund(floor: Floor, issue: unknown): Promise<string | undefined> {
    await this.configured;
    if (!issueOk(issue)) return 'Which issue?';
    const b = this.store(floor).get(issue);
    const repo = await this.repoOf(floor);
    if (!this.escrow || !this.attesterKey || !repo) return this.error ?? 'Bounties are off';
    if (!b || (b.phase !== 'expired' && b.phase !== 'cancelled')) return `#${issue}'s bounty hasn't expired`;
    const ref = { repo, issue: b.issue, nonce: b.nonce };
    try {
      for (const c of await this.escrow.contributions(ref)) if (!c.refunded) await this.escrow.refund(ref, c.funder, this.attesterKey);
    } catch (err) {
      return `the refund stopped: ${(err as Error).message}`;
    }
    await this.sync(floor);
    return undefined;
  }

  /**
   * A transaction for `wallet` to sign that opens issue `issue`'s bounty if needed and funds it with
   * `amountText` whole tokens. On the mock there's no wallet to sign: it's funded there and then.
   */
  async prepareFund(floor: Floor, issue: unknown, amountText: unknown, wallet: unknown): Promise<{ tx?: string; error?: string }> {
    await this.configured;
    const sdk = this.sdk;
    const escrow = this.escrow;
    if (!sdk || !escrow || !this.attester || !this.approverAddress) return { error: this.error ?? 'Bounties are off' };
    if (!issueOk(issue)) return { error: 'Which issue?' };
    if (typeof wallet !== 'string' || !sdk.isAddress(wallet)) return { error: "That wallet isn't a Solana address" };
    let amount: bigint;
    try {
      amount = sdk.parseAmount(String(amountText ?? ''), this.token.decimals);
    } catch {
      return { error: 'An amount is a number of tokens, like 20 or 12.5' };
    }
    if (amount <= 0n || amount > BigInt(MAX_FUND) * 10n ** BigInt(this.token.decimals)) return { error: `Fund between 0 and ${MAX_FUND} ${this.token.symbol}` };
    const repo = await this.repoOf(floor);
    if (!repo) return { error: "GitHub hasn't said which repository this floor is yet" };
    try {
      const { nonce, bounty } = sdk.activeBounty(await escrow.list(repo), issue);
      const expiryTs = (await escrow.now()) + this.settings.get().expiryDays * 86_400;
      const ref = { repo, issue, nonce };
      if (!escrow.rpc) {
        const funder = { publicKey: wallet };
        if (!bounty) await escrow.open(ref, { expiryTs, attester: this.attester.address, approver: this.approverAddress, mint: this.token.mint || undefined }, funder);
        await escrow.fund(ref, amount, funder);
        await this.sync(floor);
        return {};
      }
      const { blockhash } = await escrow.rpc.latestBlockhash();
      const tx = sdk.buildFundTransaction({
        programId: escrow.programId,
        funder: wallet,
        repo,
        issue,
        nonce,
        amount,
        mint: this.token.mint,
        ...(bounty ? {} : { open: { attester: this.attester.address, approver: this.approverAddress, expiryTs } }),
        recentBlockhash: blockhash,
      });
      return { tx };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /** The public Action's GET payload for a repository's issue, or why there's none (see http/routes/actions.ts). */
  async actionGet(repo: string, issue: number, baseUrl: string): Promise<{ status: number; body: unknown }> {
    const ready = await this.actionReady(repo);
    if ('status' in ready) return ready;
    const { floor, sdk } = ready;
    const it = floor.github.issues.items.find((x) => x.number === issue);
    if (!it) return { status: 404, body: { message: `${repo}#${issue} isn't an open issue the office knows` } };
    const b = this.store(floor).get(issue);
    const live = !b || b.phase === 'open' || b.phase === 'claimed';
    const closed = live ? undefined : `This bounty is ${b!.phase.replace('-', ' ')}: nothing more can go in`;
    const s = this.settings.get();
    return {
      status: 200,
      body: sdk.fundActionGet({ baseUrl, repo, issue, ...(s.actionTitles ? { issueTitle: it.title } : {}), icon: `${baseUrl}/api/actions/icon.svg`, total: live && b ? BigInt(b.amount) : 0n, decimals: this.token.decimals, symbol: this.token.symbol, ...(closed ? { closed } : {}) }),
    };
  }

  /** The public Action's POST answer: an unsigned transaction for `account`. */
  async actionPost(repo: string, issue: number, amount: string, account: string): Promise<{ status: number; body: unknown }> {
    const ready = await this.actionReady(repo);
    if ('status' in ready) return ready;
    if (!this.escrow?.rpc) return { status: 400, body: { message: 'The office runs bounties on the mock: there is nothing to sign' } };
    if (!ready.floor.github.issues.items.some((x) => x.number === issue)) return { status: 404, body: { message: `${repo}#${issue} isn't an open issue the office knows` } };
    const r = await this.prepareFund(ready.floor, issue, amount, account);
    if (r.error || !r.tx) return { status: 400, body: { message: r.error ?? "Couldn't build the transaction" } };
    return { status: 200, body: { type: 'transaction', transaction: r.tx, message: `Funding ${repo}#${issue} with ${amount} ${this.token.symbol} on Solana devnet. Paid out only when a person merges the office's PR for it.` } };
  }

  private async actionReady(repo: string): Promise<{ floor: Floor; sdk: EscrowSdk } | { status: number; body: unknown }> {
    await this.configured;
    const s = this.settings.get();
    const want = repo.toLowerCase();
    if (!s.enabled || !this.sdk || !this.escrow || !s.actionRepos.includes(want)) return { status: 404, body: { message: 'No bounties are open for funding on that repository' } };
    const floor = await this.floorOfRepo(want);
    if (!floor) return { status: 404, body: { message: 'No bounties are open for funding on that repository' } };
    return { floor, sdk: this.sdk };
  }

  /** Public addresses of the keys, for ⚙️ Settings. */
  keys(): { attester?: string; approver?: string } {
    return { ...(this.attester ? { attester: this.attester.address } : {}), ...(this.approverAddress ? { approver: this.approverAddress } : {}) };
  }

  isAddress(a: string): boolean {
    return this.sdk ? this.sdk.isAddress(a) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  }
}
