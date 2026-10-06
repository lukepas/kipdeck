// What the deck's bounty tokens show, worked out from the floor's real bounties and nothing else: the
// vault's stacks (one per bounty still in escrow, as many coins as its amount earns, its state as a
// shape), the coin over a funded issue's row on the Issues board, the payout's flight from the vault to
// the unit's console and the receipt it leaves there. Pure, so tests/bounty-tokens.test.ts pins it;
// world.ts draws it and index.ts keeps it current.
import type { BountiesState, BountyPhase, BountyView } from '../../../shared/protocol';
import { sumUnits, tokenUnits } from '../../../shared/money';

/** Phases still in escrow: each one is a stack on the vault. */
export const HELD: ReadonlySet<BountyPhase> = new Set(['open', 'claimed', 'awaiting-approval', 'blocked', 'paying']);

/**
 * A stack's state as a shape, so it reads without its hue: funded is the bare stack, claimed is
 * clamped by a ring (a unit has it), approve stands in a hollow ring with the review dot under it,
 * blocked under a hollow triangle, paying lifts off its pad.
 */
export type StackShape = 'funded' | 'claimed' | 'approve' | 'blocked' | 'paying';

const SHAPE: Partial<Record<BountyPhase, StackShape>> = {
  open: 'funded',
  claimed: 'claimed',
  'awaiting-approval': 'approve',
  blocked: 'blocked',
  paying: 'paying',
};

/** Where a stack sorts on the vault, left to right: what waits for a person first, as on the ledger. */
const ORDER: Record<StackShape, number> = { approve: 0, blocked: 1, paying: 2, claimed: 3, funded: 4 };

/** The most coins a stack is drawn with (and the most coins a payout flies). */
export const MAX_COINS = 14;
/** How many stacks the vault has room for: past that the last column counts the rest. */
export const MAX_STACKS = 6;

/** A bounty's amount as whole tokens (a number, for sizing only: every word uses tokenUnits). */
export function wholeTokens(amount: string, decimals: number): number {
  const n = Number(tokenUnits(amount, decimals));
  return Number.isFinite(n) ? n : 0;
}

/**
 * How many coins a stack of `tokens` has: grows with the square root, so 2 tokens is 1 coin, 50 is 5,
 * 250 is 12, and it never runs off the top (MAX_COINS). Nothing in escrow is no coin at all.
 */
export function coinsFor(tokens: number): number {
  if (!(tokens > 0)) return 0;
  return Math.max(1, Math.min(MAX_COINS, Math.ceil(Math.sqrt(tokens / 2))));
}

/** One stack on the vault. */
export interface Stack {
  issue: number;
  /** "250.00" and its symbol. */
  amount: string;
  symbol: string;
  coins: number;
  shape: StackShape;
  /** Who has it: the claiming unit, or nobody yet. */
  who?: string;
  /** The PR it's bound to, once claimed. */
  pr?: number;
}

export interface VaultView {
  /** Bounties are on for this floor. */
  on: boolean;
  /** The network as the label says it: always a testnet. */
  network: string;
  stacks: Stack[];
  /** Held bounties past the room on the vault. */
  more: number;
  /** What's in escrow now, "445.00 USDC", and how many bounties. */
  held: { count: number; total: string };
  /** What has been paid out, and how many. */
  paid: { count: number; total: string };
}

/** The network a label names: devnet test tokens, or the office's own mock chain. Never a mainnet. */
export const networkLabel = (network: string | undefined) => (network === 'mock' ? 'MOCK CHAIN' : 'DEVNET  TEST USDC');

/** The vault's stacks and totals from the floor's bounties. Pure. */
export function vaultView(b: BountiesState | undefined): VaultView {
  const items = b?.enabled ? b.items : [];
  const held = items.filter((i) => HELD.has(i.phase));
  const paid = items.filter((i) => i.phase === 'released');
  const symbol = held[0]?.symbol ?? paid[0]?.symbol ?? 'USDC';
  const total = (xs: BountyView[]) => {
    const s = sumUnits(xs);
    return `${tokenUnits(s.units, s.decimals)} ${symbol}`;
  };
  const all = held
    .map((i): Stack => ({
      issue: i.issue,
      amount: tokenUnits(i.amount, i.decimals),
      symbol: i.symbol,
      coins: coinsFor(wholeTokens(i.amount, i.decimals)),
      shape: SHAPE[i.phase] ?? 'funded',
      who: i.workerName,
      pr: i.claimPr,
    }))
    .sort((x, y) => ORDER[x.shape] - ORDER[y.shape] || x.issue - y.issue);
  const room = all.length > MAX_STACKS ? MAX_STACKS - 1 : MAX_STACKS;
  return {
    on: !!b?.enabled,
    network: networkLabel(b?.network),
    stacks: all.slice(0, room),
    more: Math.max(0, all.length - room),
    held: { count: held.length, total: total(held) },
    paid: { count: paid.length, total: total(paid) },
  };
}

/** What a funded issue's row on the Issues board carries: the amount, and its state when it isn't plain funded. */
export interface BoardBounty {
  /** "250.00 USDC", and the amount alone ("250.00") for the row, whose board says the token once. */
  text: string;
  amount: string;
  shape: StackShape;
}

/** The bounty on each issue still in escrow, by issue number, for the Issues board's rows. Pure. */
export function boardBounties(b: BountiesState | undefined): Map<number, BoardBounty> {
  const out = new Map<number, BoardBounty>();
  if (!b?.enabled) return out;
  for (const i of b.items) {
    if (!HELD.has(i.phase)) continue;
    const amount = tokenUnits(i.amount, i.decimals);
    out.set(i.issue, { text: `${amount} ${i.symbol}`, amount, shape: SHAPE[i.phase] ?? 'funded' });
  }
  return out;
}

// ---- The payout's flight ------------------------------------------------------------------------------

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** How long one coin takes from the vault to the console (s), and the gap between coins setting off. */
export const FLIGHT = { s: 1.5, gap: 0.09, rise: 2.2 } as const;
/** How long the receipt holds over the console, and its fades in and out (s). */
export const RECEIPT = { hold: 6, fade: 0.4 } as const;

/** How many coins fly for a payout of `tokens`: the stack it was, at least 3 so it reads as a flow. */
export const flightCoins = (tokens: number) => Math.max(3, coinsFor(tokens));

/** How long the whole flight takes for `n` coins (s): the last one's start plus a flight. */
export const flightTime = (n: number) => (Math.max(1, n) - 1) * FLIGHT.gap + FLIGHT.s;

/**
 * Where coin `i` is `t` seconds after the flight set off: an arc from `from` up over the deck and down
 * to `to`, eased out of the vault and into the console; `k` is how far along (0 waiting, 1 landed).
 */
export function coinAt(i: number, t: number, from: P3, to: P3): { p: P3; k: number } {
  const u = Math.max(0, Math.min(1, (t - i * FLIGHT.gap) / FLIGHT.s));
  const k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const apex = Math.max(from.y, to.y) + FLIGHT.rise;
  // A quadratic through the apex: up out of the vault, down onto the console.
  const y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * apex + k * k * to.y;
  return { p: { x: from.x + (to.x - from.x) * k, y, z: from.z + (to.z - from.z) * k }, k: u };
}

/** How opaque the receipt is `t` seconds after it appeared: in, held, out; 0 once it's gone. */
export function receiptAlpha(t: number, still: boolean): number {
  if (t < 0 || t > RECEIPT.hold) return 0;
  if (still) return 1;
  return Math.min(1, t / RECEIPT.fade, (RECEIPT.hold - t) / RECEIPT.fade);
}

/** A transaction's signature for a label: its head and tail, "9AbcD...wXyz". */
export function shortSig(sig: string | undefined): string {
  if (!sig) return '';
  return sig.length > 12 ? `${sig.slice(0, 5)}...${sig.slice(-4)}` : sig;
}
