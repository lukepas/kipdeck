// The one way an amount is written, on the top bar's proof counter, the merge toast, the review inbox
// and the /pom/ ledger alike: whole tokens with at least two decimals and the token's symbol. The
// symbol comes from the mint (tokenSymbol): bounties may be in devnet USDC or in the project's own
// test mint, and only the first is ever called USDC.

/** Circle's USDC on Solana devnet. Kept equal to the escrow SDK's (onchain/solana/sdk/src/keys.ts). */
export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
/** Circle's USDC on Solana mainnet: never used here, named only so it is never called a test token. */
export const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** The project's own test mint that stands in for USDC on devnet (the SDK's TEST_MINT). */
export const TEST_MINT = '9CL3xM1UNUQk7XqKz8JHbYhPNH9iwZF4mU67sjSEzbMz';

/** The symbol for a USDC mint, the test mint, and any other mint (or none known). */
export const USDC_SYMBOL = 'USDC';
export const TEST_SYMBOL = 'TEST';
export const OTHER_SYMBOL = 'TOKENS';

/** What a bounty's token is called, by its mint: "USDC" only for a USDC mint, "TEST" for the test mint. */
export function tokenSymbol(mint: string | undefined): string {
  if (mint === DEVNET_USDC_MINT || mint === MAINNET_USDC_MINT) return USDC_SYMBOL;
  if (mint === TEST_MINT) return TEST_SYMBOL;
  return OTHER_SYMBOL;
}

/** The token in a sentence, by its symbol: "USDC", "test tokens", or "tokens". */
export function tokenWords(symbol: string | undefined): string {
  return symbol === USDC_SYMBOL ? 'USDC' : symbol === TEST_SYMBOL ? 'test tokens' : 'tokens';
}

/** One symbol for amounts summed together: theirs when they all agree, else the neutral one. */
export function commonSymbol(symbols: readonly (string | undefined)[], fallback: string = OTHER_SYMBOL): string {
  const set = new Set(symbols.filter((s): s is string => !!s));
  return set.size === 1 ? [...set][0] : set.size === 0 ? fallback : OTHER_SYMBOL;
}

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

/** "25.00 USDC" or "25.00 TEST": the symbol always comes from the bounty (tokenSymbol of its mint). */
export function tokenLabel(units: string | bigint, decimals: number, symbol: string): string {
  return `${tokenUnits(units, decimals)} ${symbol}`;
}

/** The sum of amounts that may differ in decimals, in base units of `decimals` (at least 6). */
export function sumUnits(items: readonly { amount: string; decimals: number }[]): { units: bigint; decimals: number } {
  const d = Math.max(6, ...items.map((i) => i.decimals));
  let total = 0n;
  for (const i of items) if (/^\d+$/.test(i.amount)) total += BigInt(i.amount) * 10n ** BigInt(d - i.decimals);
  return { units: total, decimals: d };
}
