// The commit activity heatmap: 26 weeks by 7 days ending today, each day's commits as one of five
// steps, and the totals and streak under it. Pure; dates are local YYYY-MM-DD strings.

export const WEEKS = 26;
/** The fewest weeks drawn, however young the repository. */
export const MIN_WEEKS = 8;

/** How many weeks to draw for a repository first committed on `first`: its age, MIN_WEEKS to WEEKS. */
export function weeksFor(first: string | null | undefined, today: Date): number {
  const t = first ? Date.parse(first) : Number.NaN;
  if (!Number.isFinite(t)) return WEEKS;
  const weeks = Math.ceil((today.getTime() - t) / (7 * 86_400_000)) + 1;
  return Math.max(MIN_WEEKS, Math.min(WEEKS, weeks));
}

export interface HeatCell {
  date: string;
  count: number;
  /** 0 (none) to 4 (busiest). */
  level: number;
  /** After today: drawn empty. */
  future: boolean;
}

export interface Heat {
  /** WEEKS columns, each Monday first. */
  weeks: HeatCell[][];
  totals: { d7: number; d30: number; d182: number };
  /** Days in a row with a commit, ending today or yesterday. */
  streak: number;
  /** The busiest day's count. */
  max: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A date as YYYY-MM-DD in local time. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The step a count is on, against the busiest day: 1 to 4 for any commit at all, 0 for none. */
export function levelOf(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

export function heatmap(byDay: Readonly<Record<string, number>>, today: Date, nWeeks = WEEKS): Heat {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Monday of this week, then back WEEKS - 1 weeks.
  const dow = (end.getDay() + 6) % 7;
  const start = new Date(end);
  start.setDate(end.getDate() - dow - (nWeeks - 1) * 7);
  const todayKey = ymd(end);
  let max = 0;
  for (const [k, v] of Object.entries(byDay)) if (k <= todayKey && v > max) max = v;
  const weeks: HeatCell[][] = [];
  const at = new Date(start);
  for (let w = 0; w < nWeeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = ymd(at);
      const count = byDay[key] ?? 0;
      const future = key > todayKey;
      col.push({ date: key, count: future ? 0 : count, level: future ? 0 : levelOf(count, max), future });
      at.setDate(at.getDate() + 1);
    }
    weeks.push(col);
  }
  const back = (days: number) => {
    let n = 0;
    const d = new Date(end);
    for (let i = 0; i < days; i++) {
      n += byDay[ymd(d)] ?? 0;
      d.setDate(d.getDate() - 1);
    }
    return n;
  };
  let streak = 0;
  const d = new Date(end);
  if (!(byDay[ymd(d)] ?? 0)) d.setDate(d.getDate() - 1);
  while ((byDay[ymd(d)] ?? 0) > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { weeks, totals: { d7: back(7), d30: back(30), d182: back(182) }, streak, max };
}
