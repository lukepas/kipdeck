// Small formatters for the showcase page.

/** "2 h 5 min", "3 days", "40 s". */
export function span(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** "5 min ago", "in 3 days". */
export function ago(atSeconds: number, nowSeconds = Date.now() / 1000): string {
  const d = nowSeconds - atSeconds;
  if (Math.abs(d) < 45) return 'just now';
  return d > 0 ? `${span(d)} ago` : `in ${span(-d)}`;
}

/** Whole tokens from base units: units('25000000', 6) = "25.00". */
export function units(amount: string, decimals: number): string {
  let v: bigint;
  try {
    v = BigInt(amount);
  } catch {
    return '0.00';
  }
  const base = 10n ** BigInt(decimals);
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${v / base}.${frac.padEnd(2, '0')}`;
}

/** 0x1234...abcd. */
export const short = (s: string, head = 6, tail = 4) => (s.length > head + tail + 3 ? `${s.slice(0, head)}...${s.slice(-tail)}` : s);

export const pct = (r: number | null) => (r === null ? '--' : `${Math.round(r * 100)}%`);

/** A date and time in the reader's own locale. */
export const when = (atSeconds: number) => new Date(atSeconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
