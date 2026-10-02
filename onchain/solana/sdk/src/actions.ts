/**
 * "Fund this issue" as a Solana Action (a Blink): the GET payload a wallet or dial.to renders, and
 * the POST answer, an unsigned transaction that opens the issue's bounty if it isn't open yet and
 * funds it from the wallet that asked. Pure: the office's HTTP route supplies the blockhash and what
 * is already on chain.
 */
import { DEVNET_GENESIS_HASH, type Address } from './keys.js';
import { buildFund, buildInit } from './builders.js';
import { findBountyPda, normalizeRepo } from './layout.js';
import { compileMessage, unsignedTransaction } from './tx.js';
import { formatAmount } from './types.js';
import type { Bounty } from './types.js';

/** CAIP-2 id of Solana devnet: the only chain these Actions are for. */
export const DEVNET_CAIP2 = `solana:${DEVNET_GENESIS_HASH.slice(0, 32)}`;
export const ACTION_VERSION = '2.4';

/** The headers the Actions spec asks of every GET, POST and OPTIONS answer (and actions.json). */
export const ACTIONS_CORS_HEADERS: Readonly<Record<string, string>> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids',
  'access-control-expose-headers': 'X-Action-Version, X-Blockchain-Ids',
  'x-action-version': ACTION_VERSION,
  'x-blockchain-ids': DEVNET_CAIP2,
};

/** actions.json at the site root: which paths are Actions. */
export function actionsJson() {
  return { rules: [{ pathPattern: '/api/actions/**', apiPath: '/api/actions/**' }] };
}

export interface LinkedAction {
  type: 'transaction';
  label: string;
  href: string;
  parameters?: { name: string; label: string; type: 'number'; required: boolean; min?: number; max?: number }[];
}

export interface ActionGetResponse {
  type: 'action';
  icon: string;
  title: string;
  description: string;
  label: string;
  disabled?: boolean;
  error?: { message: string };
  links?: { actions: LinkedAction[] };
}

export interface FundActionParams {
  /** Where the office is reached, e.g. https://office.example.com (no trailing slash). */
  baseUrl: string;
  repo: string;
  issue: number;
  /** The issue's title, or undefined to keep it off the card (a private repo, say). */
  issueTitle?: string;
  /** An absolute https URL of a square image. */
  icon: string;
  /** What the bounty holds now, in base units. */
  total: bigint;
  decimals: number;
  symbol: string;
  /** Set when the bounty can't take funds any more (released, refunded, expired). */
  closed?: string;
  presets?: number[];
}

/** The GET answer for /api/actions/fund?repo=&issue=. */
export function fundActionGet(p: FundActionParams): ActionGetResponse {
  const repo = normalizeRepo(p.repo);
  const base = `${p.baseUrl}/api/actions/fund?repo=${encodeURIComponent(repo)}&issue=${p.issue}`;
  const held = `${formatAmount(p.total, p.decimals)} ${p.symbol} held in escrow on Solana devnet`;
  const what = p.issueTitle ? `${repo}#${p.issue}: ${p.issueTitle}` : `${repo}#${p.issue}`;
  const out: ActionGetResponse = {
    type: 'action',
    icon: p.icon,
    title: `Fund ${repo}#${p.issue}`,
    description: `${what}. ${held}. Paid to the agent operator only when a person with write access merges the office's pull request for it and an office admin approves; otherwise each funder can take theirs back after the expiry. Devnet only: no real money.`,
    label: 'Fund',
  };
  if (p.closed) return { ...out, disabled: true, error: { message: p.closed } };
  const presets = p.presets ?? [5, 20, 50];
  out.links = {
    actions: [
      ...presets.map((n): LinkedAction => ({ type: 'transaction', label: `${n} ${p.symbol}`, href: `${base}&amount=${n}` })),
      { type: 'transaction', label: 'Fund', href: `${base}&amount={amount}`, parameters: [{ name: 'amount', label: `${p.symbol} amount`, type: 'number', required: true, min: 1, max: 100_000 }] },
    ],
  };
  return out;
}

/**
 * The bounty an issue's funds go to now: its open or claimed one, else a fresh nonce after the last
 * settled one. `exists` false means the transaction must open it first.
 */
export function activeBounty(bounties: Bounty[], issue: number): { nonce: number; bounty?: Bounty } {
  const mine = bounties.filter((b) => b.issue === issue).sort((a, b) => a.nonce - b.nonce);
  const live = mine.find((b) => b.state === 'open' || b.state === 'claimed');
  if (live) return { nonce: live.nonce, bounty: live };
  const last = mine[mine.length - 1];
  if (last && last.nonce >= 255) throw new Error(`${issue} has used every bounty nonce`);
  return { nonce: last ? last.nonce + 1 : 0 };
}

export interface FundTxParams {
  programId: Address;
  /** The wallet that asked: it signs and pays. */
  funder: Address;
  repo: string;
  issue: number;
  nonce: number;
  amount: bigint;
  mint: Address;
  /** When the bounty has to be opened first: who attests, who approves and when it expires. */
  open?: { attester: Address; approver: Address; expiryTs: number };
  recentBlockhash: string;
}

/** The POST answer's transaction: base64, every signature slot empty, for the funder's wallet to sign. */
export function buildFundTransaction(p: FundTxParams): string {
  const bounty = findBountyPda(p.programId, p.repo, p.issue, p.nonce).address;
  const ixs = [];
  if (p.open) ixs.push(buildInit({ programId: p.programId, payer: p.funder, repo: p.repo, issue: p.issue, nonce: p.nonce, mint: p.mint, ...p.open }));
  ixs.push(buildFund({ programId: p.programId, funder: p.funder, bounty, mint: p.mint, amount: p.amount }));
  return Buffer.from(unsignedTransaction(compileMessage(p.funder, ixs, p.recentBlockhash))).toString('base64');
}

/** A dial.to link that renders an Action on devnet, for sharing without an X unfurl. */
export function dialToLink(actionUrl: string): string {
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl}`)}&cluster=devnet`;
}
