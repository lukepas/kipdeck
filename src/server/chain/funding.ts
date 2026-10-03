// Funding a Proof of Merge bounty: the transaction a browser wallet signs to open an issue's bounty
// (if it has none) and put money in, and the public "Fund this issue" Action (a Blink) built on it.
// Only ever into the office's own bounty for the issue: opened with its attester and approver, in its
// mint, not expired, and not while a merge for it is being checked or paid. See bounties.ts.
import type { Floor } from '../floor.js';
import type { ChainBounty, Escrow, EscrowSdk } from './sdk.js';
import type { StoredBounty } from './store.js';

/** The most a single funding from the office may put in, in whole tokens. */
export const MAX_FUND = 100_000;
/** Phases in which a bounty takes no new funds: a merge is being checked or paid. */
export const FUNDING_CLOSED: ReadonlySet<string> = new Set(['awaiting-approval', 'blocked', 'paying']);

/** What funding needs of the bounty service, once it is set up. */
export interface FundingParts {
  sdk: EscrowSdk;
  escrow: Escrow;
  attester: string;
  approver: string;
  token: { symbol: string; decimals: number; mint: string };
  expiryDays: number;
  actionTitles: boolean;
  actionRepos: readonly string[];
  repoOf(floor: Floor): Promise<string | undefined>;
  floorOfRepo(repo: string): Promise<Floor | undefined>;
  stored(floor: Floor, issue: number): StoredBounty | undefined;
  /** The office's own among a repository's bounties. */
  own(chain: readonly ChainBounty[]): ChainBounty[];
  sync(floor: Floor): Promise<void>;
}

const issueOk = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

/** Why the issue's bounty takes no funds now (a merge waits for approval, say), or undefined. */
function fundingClosed(b: StoredBounty | undefined): string | undefined {
  return b && FUNDING_CLOSED.has(b.phase) ? `This bounty is ${b.phase.replace('-', ' ')}: nothing more can go in` : undefined;
}

/**
 * A transaction for `wallet` to sign that opens issue `issue`'s bounty if needed and funds it with
 * `amountText` whole tokens. On the mock there's no wallet to sign: it's funded there and then.
 */
export async function prepareFund(p: FundingParts, floor: Floor, issue: unknown, amountText: unknown, wallet: unknown): Promise<{ tx?: string; error?: string }> {
  const { sdk, escrow, token } = p;
  if (!issueOk(issue)) return { error: 'Which issue?' };
  if (typeof wallet !== 'string' || !sdk.isAddress(wallet)) return { error: "That wallet isn't a Solana address" };
  let amount: bigint;
  try {
    amount = sdk.parseAmount(String(amountText ?? ''), token.decimals);
  } catch {
    return { error: 'An amount is a number of tokens, like 20 or 12.5' };
  }
  if (amount <= 0n || amount > BigInt(MAX_FUND) * 10n ** BigInt(token.decimals)) return { error: `Fund between 0 and ${MAX_FUND} ${token.symbol}` };
  const repo = await p.repoOf(floor);
  if (!repo) return { error: "GitHub hasn't said which repository this floor is yet" };
  const closed = fundingClosed(p.stored(floor, issue));
  if (closed) return { error: closed };
  try {
    const now = await escrow.now();
    // Only the office's own bounties, and not one past its expiry: the program refuses to fund that.
    const { nonce, bounty } = sdk.activeBounty(p.own(await escrow.list(repo)), issue, { now });
    const expiryTs = now + p.expiryDays * 86_400;
    const keys = { attester: p.attester, approver: p.approver };
    const ref = { repo, issue, nonce, ...keys };
    if (!escrow.rpc) {
      const funder = { publicKey: wallet };
      if (!bounty) await escrow.open(ref, { expiryTs, ...keys, mint: token.mint || undefined }, funder);
      await escrow.fund(ref, amount, funder);
      await p.sync(floor);
      return {};
    }
    const { blockhash } = await escrow.rpc.latestBlockhash();
    const tx = sdk.buildFundTransaction({ programId: escrow.programId, funder: wallet, repo, issue, nonce, amount, mint: token.mint, ...keys, ...(bounty ? {} : { open: { expiryTs } }), recentBlockhash: blockhash });
    return { tx };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

const NONE = { status: 404, body: { message: 'No bounties are open for funding on that repository' } };

/** The floor of a repository the public Action may fund, or the 404 to answer. */
async function actionFloor(p: FundingParts, repo: string): Promise<Floor | { status: number; body: unknown }> {
  const want = repo.toLowerCase();
  if (!p.actionRepos.includes(want)) return NONE;
  return (await p.floorOfRepo(want)) ?? NONE;
}

/** The public Action's GET payload for a repository's issue, or why there's none (see http/routes/actions.ts). */
export async function actionGet(p: FundingParts, repo: string, issue: number, baseUrl: string): Promise<{ status: number; body: unknown }> {
  const floor = await actionFloor(p, repo);
  if ('status' in floor) return floor;
  const it = floor.github.issues.items.find((x) => x.number === issue);
  if (!it) return { status: 404, body: { message: `${repo}#${issue} isn't an open issue the office knows` } };
  const b = p.stored(floor, issue);
  const closed = fundingClosed(b);
  // A settled or expired one is history: funding now opens a fresh bounty, which holds nothing yet.
  const live = b && (b.phase === 'open' || b.phase === 'claimed') && b.expiry > Date.now();
  return {
    status: 200,
    body: p.sdk.fundActionGet({ baseUrl, repo, issue, ...(p.actionTitles ? { issueTitle: it.title } : {}), icon: `${baseUrl}/api/actions/icon.svg`, total: live ? BigInt(b.amount) : 0n, decimals: p.token.decimals, symbol: p.token.symbol, ...(closed ? { closed } : {}) }),
  };
}

/** The public Action's POST answer: an unsigned transaction for `account`. */
export async function actionPost(p: FundingParts, repo: string, issue: number, amount: string, account: string): Promise<{ status: number; body: unknown }> {
  const floor = await actionFloor(p, repo);
  if ('status' in floor) return floor;
  if (!p.escrow.rpc) return { status: 400, body: { message: 'The office runs bounties on the mock: there is nothing to sign' } };
  if (!floor.github.issues.items.some((x) => x.number === issue)) return { status: 404, body: { message: `${repo}#${issue} isn't an open issue the office knows` } };
  const r = await prepareFund(p, floor, issue, amount, account);
  if (r.error || !r.tx) return { status: 400, body: { message: r.error ?? "Couldn't build the transaction" } };
  return { status: 200, body: { type: 'transaction', transaction: r.tx, message: `Funding ${repo}#${issue} with ${amount} ${p.token.symbol} on Solana devnet. Paid out only when a person merges the office's PR for it.` } };
}
