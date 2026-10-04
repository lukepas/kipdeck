// One run of the action: from the event to the claim (and, when configured, the release or a release
// prepared for the approver, and the Base Sepolia attestation). Everything outside is passed in, so
// the tests drive it with a mock escrow and a fake GitHub.
import {
  Attester,
  DEVNET_USDC_MINT,
  TEST_MINT,
  activeBounty,
  checkRelease,
  formatAmount,
  hexOf,
  mergedByHash,
  type Address,
  type BountyEscrow,
  type BountyRef,
  type Keypair,
  type Permission,
} from '../../solana/sdk/src/index.js';
import type { Attested } from '../../attest/src/attestor.js';
import { easAttestor, mergeRecord, type MakeAttestor } from './attest.js';
import { linkedIssues, parseWallets, pullFacts, walletFor, type WalletSource } from './facts.js';
import { GitHubError, type GitHub, type Pull } from './github.js';
import { InputError, type Inputs } from './inputs.js';

export interface Logger {
  info(line: string): void;
  notice(line: string): void;
  warning(line: string): void;
}

export interface Deps {
  github: Pick<GitHub, 'pull' | 'permission' | 'file'> & Partial<Pick<GitHub, 'comment'>>;
  escrow: BountyEscrow;
  makeAttestor?: MakeAttestor;
  log: Logger;
}

/** The workflow run: GITHUB_EVENT_NAME, the event payload, GITHUB_REPOSITORY. */
export interface RunContext {
  eventName: string;
  event: { action?: string; pull_request?: { number?: number } };
  repo: string;
}

/** What happened to one issue the pull request closes. */
export interface IssueResult {
  issue: number;
  bounty?: Address;
  amount?: string;
  wallet?: Address;
  walletSource?: WalletSource;
  claimed?: string;
  released?: string;
  /** A release the attester signed, waiting for the approver (base64). */
  prepared?: string;
  nonceAccount?: Address;
  note?: string;
}

export interface RunResult {
  pr?: number;
  /** skipped: nothing to do (not merged, say). refused: the merge failed a check. done: it was looked at. */
  status: 'skipped' | 'refused' | 'done';
  reason?: string;
  pull?: Pull;
  issues: IssueResult[];
  attestation?: Attested;
}

/** The pull request this run is about, or why there is none. */
function prOf(inputs: Inputs, ctx: RunContext): number | string {
  if (ctx.eventName === 'pull_request_target') {
    throw new InputError('run this action on pull_request (closed), not pull_request_target: a fork must never get the attester key');
  }
  if (inputs.prNumber) return inputs.prNumber;
  if (ctx.eventName !== 'pull_request') return `a ${ctx.eventName} event names no pull request: pass pr-number`;
  if (ctx.event.action !== 'closed') return `the pull request was ${ctx.event.action ?? 'changed'}, not closed`;
  const n = ctx.event.pull_request?.number;
  return typeof n === 'number' && n > 0 ? n : 'the event has no pull request number';
}

export async function run(inputs: Inputs, ctx: RunContext, deps: Deps): Promise<RunResult> {
  const { github, log } = deps;
  const pr = prOf(inputs, ctx);
  if (typeof pr === 'string') return { status: 'skipped', reason: pr, issues: [] };
  const pull = await github.pull(pr);
  if (!pull.merged) return { pr, status: 'skipped', reason: `PR #${pr} was closed without merging`, pull, issues: [] };

  const issues = linkedIssues(pull.body, ctx.repo);
  let permission: Permission | undefined;
  if (pull.merged_by) {
    try {
      permission = await github.permission(pull.merged_by.login);
    } catch (err) {
      // An app or a deleted account has no collaborator entry: it has no write access, then.
      if (!(err instanceof GitHubError && err.status === 404)) throw err;
      permission = 'none';
    }
  }
  const facts = pullFacts(pull, ctx.repo, permission, issues);
  // The merge itself first (the attestation needs only that), then whether it closes an issue.
  const merge = checkRelease({ ...facts, closesIssue: true });
  if (!merge.ok) return { pr, status: 'refused', reason: merge.reason, pull, issues: [] };

  const pseudonym = inputs.mergedBySecret ? (id: number) => hexOf(mergedByHash(id, inputs.mergedBySecret!)) : undefined;
  const results: IssueResult[] = [];
  if (!issues.length) log.notice(`PR #${pr} closes no issue of ${facts.repo}: no bounty to claim`);
  else await settle(inputs, pull, facts, issues, pseudonym, deps, results);

  let attestation: Attested | undefined;
  const baseKey = inputs.base ? inputs.secrets.baseAttesterKey() : undefined;
  if (inputs.base && baseKey) {
    const make = deps.makeAttestor ?? easAttestor;
    const attestor = make({ rpcUrl: inputs.base.rpcUrl, schemaUid: inputs.base.schemaUid, key: baseKey });
    const solanaTx = results.find((r) => r.released)?.released;
    const by = pseudonym && pull.merged_by ? pseudonym(pull.merged_by.id) : undefined;
    attestation = await attestor.attest(mergeRecord(pull, facts.repo, { mergedByHash: by, harness: inputs.base.harness, solanaTx }));
    log.info(`attested the merge on Base Sepolia: ${attestation.link}`);
  }
  return { pr, status: 'done', pull, issues: results, ...(attestation ? { attestation } : {}) };
}

/**
 * An amount as a person reads it. The program takes devnet USDC and, in test builds, the test mint,
 * both with 6 decimals; anything else (a mock's token) is shown in base units.
 */
export function amountOf(total: bigint, mint: Address): string {
  if (mint === DEVNET_USDC_MINT) return `${formatAmount(total, 6)} USDC`;
  if (mint === TEST_MINT) return `${formatAmount(total, 6)} test USDC`;
  return `${total} base units of ${mint}`;
}

/** Claims (and releases, or prepares the release of) the bounty of each issue the pull request closes. */
async function settle(inputs: Inputs, pull: Pull, facts: ReturnType<typeof pullFacts>, issues: number[], pseudonym: ((id: number) => string) | undefined, deps: Deps, out: IssueResult[]): Promise<void> {
  const { escrow, log, github } = deps;
  const key: Keypair = inputs.secrets.attesterKey();
  if (key.publicKey === inputs.approver) throw new InputError('attester-key and approver must be two different keys');
  const approverKey = inputs.mode === 'claim' ? undefined : inputs.secrets.approverKey();
  if (approverKey && approverKey.publicKey !== inputs.approver) throw new InputError(`approver-key is ${approverKey.publicKey}, not the approver ${inputs.approver}`);
  if (inputs.mode === 'release' && !approverKey) throw new InputError('mode release needs approver-key');
  const attester = new Attester(escrow, key, pseudonym ? { pseudonym } : {});
  const [all, now] = await Promise.all([escrow.list(facts.repo), escrow.now()]);
  let wallets: Map<string, Address> | undefined;

  for (const issue of issues) {
    const r: IssueResult = { issue };
    out.push(r);
    const { bounty } = activeBounty(all, issue, { attester: key.publicKey, approver: inputs.approver, mint: inputs.mint, now });
    if (!bounty) {
      r.note = 'no open bounty under this attester and approver';
      log.info(`#${issue}: ${r.note}`);
      continue;
    }
    r.bounty = bounty.address;
    r.amount = amountOf(bounty.total, bounty.mint);
    const ref: BountyRef = { repo: facts.repo, issue, nonce: bounty.nonce, attester: key.publicKey, approver: inputs.approver };
    if (bounty.state === 'claimed' && bounty.prNumber !== pull.number) {
      r.note = `already claimed for PR #${bounty.prNumber}, which waits for the approver: left as it is`;
      log.warning(`#${issue}: ${r.note}`);
      continue;
    }
    wallets ??= parseWallets(await github.file(inputs.walletsFile, pull.base.sha), inputs.walletsFile);
    const payee = walletFor(pull, wallets, inputs.walletFromBody);
    if (!payee) {
      r.note = `no wallet to pay: add ${pull.user?.login ?? 'the author'} to ${inputs.walletsFile}${inputs.walletFromBody ? ' or a "Bounty-Wallet: <address>" line to the pull request' : ''}, then run this again`;
      log.warning(`#${issue}: ${r.note}`);
      continue;
    }
    r.wallet = payee.wallet;
    r.walletSource = payee.source;
    if (bounty.state === 'claimed' && bounty.claimantWallet === payee.wallet) log.info(`#${issue}: already claimed for PR #${pull.number}`);
    else {
      r.claimed = (await attester.claim(ref, facts, payee.wallet)).signature;
      log.info(`#${issue}: claimed for PR #${pull.number}, paying ${payee.wallet}: ${escrow.explorer(r.claimed) ?? r.claimed}`);
    }

    if (approverKey) {
      r.released = (await attester.release(ref, facts, approverKey)).signature;
      log.info(`#${issue}: released ${r.amount} to ${payee.wallet}: ${escrow.explorer(r.released) ?? r.released}`);
    } else if (inputs.approverNonceAccount) {
      r.prepared = await attester.prepareRelease(ref, facts, inputs.approver, { nonceAccount: inputs.approverNonceAccount });
      r.nonceAccount = inputs.approverNonceAccount;
      log.info(`#${issue}: a release signed by the attester waits for the approver`);
    } else {
      r.note = 'claimed: the release needs the approver';
    }
  }
}
