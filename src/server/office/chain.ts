// The Base side of Proof of Merge, made with the late services: paid tasks over x402 (--x402),
// proof-of-merge attestations (--attest) and ERC-8004 reputation for the office's agents
// (--reputation), each off unless the office was started with its switch. Bad switches stop the
// office at start, as any other bad option does.
import path from 'node:path';
import { agentKey } from '../../shared/reputation.js';
import type { Bounties } from '../bounties.js';
import type { Floor } from '../floor.js';
import { MergeProofs, rpcProblem, type ProofFloor } from '../chain/attest.js';
import { Reputation } from '../chain/reputation.js';
import { ReputationIndex } from '../chain/rep-index.js';
import { httpFacilitator } from '../x402/facilitator.js';
import { X402Gateway, x402Settings } from '../x402/gateway.js';
import type { Ctx } from './context.js';

function refuse(what: string): never {
  console.error(`agent-office: ${what}`);
  process.exit(2);
}

/** Who runs a worker: its owner's account name and own GitHub login, or the office's (its gh login). */
export function operatorOf(ctx: Ctx, f: Floor, workerId: string | undefined): { name: string; login?: string } {
  const owner = workerId ? f.workers.ownerOf(workerId) : undefined;
  const name = (owner && ctx.accounts.get(owner)?.name) || 'office';
  const login = owner ? ctx.signins.githubLogin(owner) : ctx.viewer();
  return { name, ...(login ? { login } : {}) };
}

/** A floor as the attestations see it. */
export function proofFloor(f: Floor, ctx?: Ctx): ProofFloor {
  return {
    id: f.id,
    dir: f.dir,
    pulls: () => f.github.pulls.items,
    officePull: (p) => f.officePull(p),
    workers: () => f.workers.list(),
    tasks: () => f.queue.state().tasks,
    repo: () => f.github.repoInfo().then((r) => r.nameWithOwner.toLowerCase(), () => undefined),
    attested: (e) => f.watch.attested(e),
    ...(ctx ? { operatorOf: (workerId: string | undefined) => operatorOf(ctx, f, workerId) } : {}),
  };
}

export function createChainServices(ctx: Ctx, bounties: Bounties): { x402?: X402Gateway; proofs?: MergeProofs; reputation?: Reputation; reputationIndex?: ReputationIndex } {
  const { cfg } = ctx;
  let x402: X402Gateway | undefined;
  const settings = x402Settings(cfg.chain.x402);
  if (typeof settings === 'string') refuse(settings);
  if (settings) {
    x402 = new X402Gateway({
      settings,
      dataDir: cfg.dataDir,
      secret: cfg.secret,
      facilitator: httpFacilitator(settings.facilitator),
      floorOfRepo: async (repo) => {
        const f = await bounties.floorOfRepo(repo);
        return f && { id: f.id, queue: f.queue, providers: f.project.agentProviders, promptProblem: (prompt: string) => f.github.checkoutProblem(prompt) };
      },
      liveTask: (floorId, taskId) => ctx.floors.get(floorId)?.queue.state().tasks.find((t) => t.id === taskId),
      harnesses: () => [...(ctx.floors.values().next().value?.project.agentProviders ?? [])],
      toast: (floorId, text) => ctx.toastFloor(ctx.floors.get(floorId), text),
    });
    console.log(`  paid tasks over x402: ${settings.price} test USDC on Base Sepolia${settings.payToSolana ? ' and Solana devnet' : ''}, for ${settings.repos.join(', ')}, held for an admin`);
  }
  let proofs: MergeProofs | undefined;
  let reputation: Reputation | undefined;
  let reputationIndex: ReputationIndex | undefined;
  const rep = cfg.chain.reputation;
  if (rep.enabled) {
    if (!cfg.chain.attest.enabled) refuse('--reputation needs --attest: every feedback rests on an attestation, and the attester gives it');
    if (path.resolve(rep.registrarKeyFile) === path.resolve(cfg.chain.attest.keyFile)) refuse('--reputation-registrar-key-file must be another key than the attester\'s: the registry refuses feedback from an agent\'s owner');
    if (rep.cardBase && !/^https:\/\/[^/\s]+\/?$/.test(rep.cardBase)) refuse('--reputation-card-base is this office\'s https address, e.g. https://office.example');
    if (!Number.isFinite(rep.indexMinutes) || rep.indexMinutes < 0) refuse('--reputation-index is a number of minutes');
  }
  if (cfg.chain.attest.enabled) {
    const bad = rpcProblem(cfg.chain.attest.rpc);
    if (bad) refuse(bad);
    let pending: NodeJS.Timeout | undefined;
    const changed = () => {
      pending ??= setTimeout(() => {
        pending = undefined;
        if (reputation) ctx.broadcast({ t: 'reputation', state: reputation.state() });
      }, 500);
    };
    if (rep.enabled) {
      reputation = new Reputation({
        dataDir: cfg.dataDir,
        flags: cfg.chain,
        attestations: () => proofs?.outbox.all() ?? [],
        ownerOf: (floorId, workerId) => ctx.floors.get(floorId)?.workers.ownerOf(workerId),
        wallet: (account) => bounties.settings.wallet(account),
        workers: () =>
          [...ctx.floors.values()].flatMap((f) =>
            f.workers
              .list()
              .filter((w) => w.kind === 'agent' && w.provider)
              .map((w) => ({ id: w.id, key: agentKey(w.provider!, operatorOf(ctx, f, w.id).name, w.name) })),
          ),
        x402: () => !!x402,
        changed,
      });
      if (rep.indexMinutes > 0) reputationIndex = new ReputationIndex({ dataDir: cfg.dataDir, flags: cfg.chain, minutes: rep.indexMinutes, sources: () => reputation!.sources() });
    }
    const r = reputation;
    proofs = new MergeProofs({
      dataDir: cfg.dataDir,
      flags: cfg.chain.attest,
      floor: (id) => {
        const f = ctx.floors.get(id);
        return f && proofFloor(f, ctx);
      },
      payout: (floorId, pr) => bounties.payout(floorId, pr),
      payoutPending: (floorId, pr) => bounties.payoutPending(floorId, pr),
      toast: (floorId, text) => ctx.toastFloor(ctx.floors.get(floorId), text),
      ...(r ? { agentIdFor: (item) => r.agentIdFor(item), onAttested: (item) => r.attested(item) } : {}),
    });
    console.log(`  proof of merge: attesting merged office PRs on Base Sepolia (${cfg.chain.attest.mode === 'event' ? 'MergeAttestor' : 'EAS'})`);
    if (r) console.log(`  reputation: ERC-8004 identities and merge feedback on Base Sepolia${rep.indexMinutes ? `, the board rebuilt from the chain every ${rep.indexMinutes} min` : ''}`);
  }
  return { x402, proofs, reputation, reputationIndex };
}
