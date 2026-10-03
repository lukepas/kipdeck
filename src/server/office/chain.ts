// The Base side of Proof of Merge, made with the late services: paid tasks over x402 (--x402) and
// proof-of-merge attestations (--attest), each off unless the office was started with its switch.
// Bad switches stop the office at start, as any other bad option does.
import type { Bounties } from '../bounties.js';
import type { Floor } from '../floor.js';
import { MergeProofs, rpcProblem, type ProofFloor } from '../chain/attest.js';
import { httpFacilitator } from '../x402/facilitator.js';
import { X402Gateway, x402Settings } from '../x402/gateway.js';
import type { Ctx } from './context.js';

function refuse(what: string): never {
  console.error(`agent-office: ${what}`);
  process.exit(2);
}

/** A floor as the attestations see it. */
export function proofFloor(f: Floor): ProofFloor {
  return {
    id: f.id,
    dir: f.dir,
    pulls: () => f.github.pulls.items,
    officePull: (p) => f.officePull(p),
    workers: () => f.workers.list(),
    tasks: () => f.queue.state().tasks,
    repo: () => f.github.repoInfo().then((r) => r.nameWithOwner.toLowerCase(), () => undefined),
    attested: (e) => f.watch.attested(e),
  };
}

export function createChainServices(ctx: Ctx, bounties: Bounties): { x402?: X402Gateway; proofs?: MergeProofs } {
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
  if (cfg.chain.attest.enabled) {
    const bad = rpcProblem(cfg.chain.attest.rpc);
    if (bad) refuse(bad);
    proofs = new MergeProofs({
      dataDir: cfg.dataDir,
      flags: cfg.chain.attest,
      floor: (id) => {
        const f = ctx.floors.get(id);
        return f && proofFloor(f);
      },
      solanaTx: (floorId, pr) => bounties.paidTx(floorId, pr),
      toast: (floorId, text) => ctx.toastFloor(ctx.floors.get(floorId), text),
    });
    console.log(`  proof of merge: attesting merged office PRs on Base Sepolia (${cfg.chain.attest.mode === 'event' ? 'MergeAttestor' : 'EAS'})`);
  }
  return { x402, proofs };
}
