// How a bounty's state is said in words, the same on the issue card's chip, the Fund window and the
// Proof corner's ledger on the deck. Pure.
import type { BountyPhase } from './protocol.js';

/** A bounty's phase in words. */
export const PHASE_LABEL: Record<BountyPhase, string> = {
  open: 'open',
  claimed: 'claimed',
  'awaiting-approval': 'merged: waits for approval',
  blocked: 'blocked',
  paying: 'paying out',
  released: 'paid',
  refunded: 'refunded',
  cancelled: 'cancelled',
  expired: 'expired',
};

/** "3 d left", "5 h left", "expired". */
export function timeLeft(expiry: number, now = Date.now()): string {
  const ms = expiry - now;
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  return h >= 48 ? `${Math.floor(h / 24)} d left` : h >= 1 ? `${h} h left` : `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}
