// What a merged pull request says about the bounties it may claim: the issues it closes, the wallet
// to pay, and the facts the SDK's attester checks (checkRelease) decide on.
import { isAddress, normalizeRepo, type Address, type Permission, type PullFacts } from '../../solana/sdk/src/index.js';
import type { Pull } from './github.js';

const KEYWORDS = 'close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved';

/**
 * The issues of `repo` a pull request body closes, as GitHub reads closing keywords: "Closes #12",
 * "fixes: owner/name#3", "Resolves https://github.com/owner/name/issues/7". Issues of other
 * repositories are left out, since a bounty here is for an issue here.
 */
export function linkedIssues(body: string | null | undefined, repo: string): number[] {
  if (!body) return [];
  const here = normalizeRepo(repo);
  const ref = String.raw`(?:([\w.-]+\/[\w.-]+)#(\d+)|#(\d+)|https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+))`;
  const re = new RegExp(String.raw`\b(?:${KEYWORDS})\b:?\s+${ref}`, 'gi');
  const out: number[] = [];
  for (const m of body.matchAll(re)) {
    const other = m[1] ?? m[4];
    const n = Number(m[2] ?? m[3] ?? m[5]);
    if (other && normalizeRepo(other) !== here) continue;
    if (Number.isSafeInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** A "Bounty-Wallet: <address>" line in a pull request body (case and spacing don't matter). */
export function bodyWallet(body: string | null | undefined): Address | undefined {
  const m = /^\s*bounty[- ]wallet\s*:\s*([1-9A-HJ-NP-Za-km-z]{32,44})\s*$/im.exec(body ?? '');
  return m && isAddress(m[1]) ? m[1] : undefined;
}

/**
 * The repository's wallets file: `{ "login": "address" }`, read at the base branch, so changing it
 * takes a reviewed merge like any other file. Logins are matched without regard to case.
 */
export function parseWallets(text: string | undefined, file: string): Map<string, Address> {
  const out = new Map<string, Address>();
  if (text === undefined) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${file} isn't JSON`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${file} is an object of GitHub login to Solana wallet address`);
  for (const [login, wallet] of Object.entries(raw)) {
    if (typeof wallet !== 'string' || !isAddress(wallet)) throw new Error(`${file}: the wallet for ${login} isn't a Solana address`);
    out.set(login.toLowerCase(), wallet);
  }
  return out;
}

export type WalletSource = 'wallets-file' | 'pull-request body';

/** Who gets paid: the author's entry in the wallets file first, then (if allowed) the body's line. */
export function walletFor(pull: Pull, wallets: Map<string, Address>, fromBody: boolean): { wallet: Address; source: WalletSource } | undefined {
  const listed = pull.user ? wallets.get(pull.user.login.toLowerCase()) : undefined;
  if (listed) return { wallet: listed, source: 'wallets-file' };
  const declared = fromBody ? bodyWallet(pull.body) : undefined;
  return declared ? { wallet: declared, source: 'pull-request body' } : undefined;
}

/**
 * The facts the SDK's checkRelease weighs, from GitHub's own answers. Outside the office "made by the
 * office" has no meaning; its place is taken by "opened from a branch of this repository", which only
 * someone with push access can do, and a fork never is.
 */
export function pullFacts(pull: Pull, repo: string, mergerPermission: Permission | undefined, issues: number[]): PullFacts {
  const here = normalizeRepo(repo);
  const head = pull.head.repo;
  // Compared by name: head.repo.fork only says the repository is itself a fork of another, which a
  // same-repository branch of a forked project is too.
  const fork = !head || normalizeRepo(head.full_name) !== here || normalizeRepo(pull.base.repo.full_name) !== here;
  return {
    repo: here,
    number: pull.number,
    officeMade: !fork,
    fork,
    closesIssue: issues.length > 0,
    merged: pull.merged,
    ...(pull.merge_commit_sha ? { mergeSha: pull.merge_commit_sha } : {}),
    ...(pull.merged_by ? { mergedBy: { login: pull.merged_by.login, id: pull.merged_by.id, type: pull.merged_by.type } } : {}),
    ...(mergerPermission ? { mergerPermission } : {}),
  };
}
