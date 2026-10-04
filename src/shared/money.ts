// The one way an amount is written, on the top bar's proof counter, the merge toast, the review inbox
// and the /pom/ ledger alike: whole tokens with at least two decimals and the token's symbol. Bounties
// are devnet USDC, so the deck and the public ledger always add up to the same total.

/** The token bounties are escrowed and paid in. */
export const BOUNTY_SYMBOL = 'USDC';

/** Base units as a person reads them: "12500000" with 6 decimals is "12.50". */
export function tokenUnits(units: string | bigint, decimals: number): string {
  let v: bigint;
  try {
    v = typeof units === 'bigint' ? units : /^\d+$/.test(units) ? BigInt(units) : 0n;
  } catch {
    v = 0n;
  }
  if (v < 0n) v = 0n;
  const base = 10n ** BigInt(Math.max(0, decimals));
  const frac = decimals > 0 ? (v % base).toString().padStart(decimals, '0').replace(/0+$/, '') : '';
  return `${v / base}.${frac.padEnd(2, '0')}`;
}

/** "25.00 USDC". */
export function tokenLabel(units: string | bigint, decimals: number, symbol: string = BOUNTY_SYMBOL): string {
  return `${tokenUnits(units, decimals)} ${symbol}`;
}

/** The sum of amounts that may differ in decimals, in base units of `decimals` (at least 6). */
export function sumUnits(items: readonly { amount: string; decimals: number }[]): { units: bigint; decimals: number } {
  const d = Math.max(6, ...items.map((i) => i.decimals));
  let total = 0n;
  for (const i of items) if (/^\d+$/.test(i.amount)) total += BigInt(i.amount) * 10n ** BigInt(d - i.decimals);
  return { units: total, decimals: d };
}
