// The Numbers window's arithmetic: what this Mergeline's signed shipped log says about the last two
// weeks, the way a pitch deck or an investor update quotes it. Human wait time (how long finished work
// sat waiting on a person before its review), changes merged and sent back, agent-hours behind the
// merges, the merge rate (overall and per agent and model, always with its N) and merges per day.
// Pure, so the page and the tests use the same rules. Every number comes from records on this machine.

import { mergeRates, startOfDay, type MergeRate } from './inbox.js';
import type { ShipRecord } from './protocol.js';

const DAY = 86_400_000;
/** The window the headline numbers cover, and the one before it they're compared with. */
export const WEEK_DAYS = 7;
/** How many days the per-day bars cover. */
export const CHART_DAYS = 14;

/** The middle value, or undefined for none. */
export function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface WeekNumbers {
  merged: number;
  sentBack: number;
  /** Median minutes the reviewed work waited on a person; undefined with no reviews. */
  waitMin?: number;
  /** Hours the merged work's agents spent on it. */
  agentHours: number;
  /** Merged over every review, 0 to 1; undefined with no reviews. */
  rate?: number;
}

export interface Numbers {
  /** The last 7 days, today included. */
  week: WeekNumbers;
  /** The 7 days before those. */
  before: WeekNumbers;
  /** Merges per day for the last 14 days, oldest first, with each day's midnight. */
  days: { at: number; merged: number }[];
  /** Per agent and model, over every record given (the log keeps 30 days). */
  rates: MergeRate[];
  /** Reviews in all the records given. */
  reviews: number;
}

function weekOf(records: readonly ShipRecord[]): WeekNumbers {
  const merged = records.filter((r) => r.kind === 'merged');
  const waits = records.filter((r) => typeof r.waitedMs === 'number').map((r) => r.waitedMs! / 60_000);
  const w = median(waits);
  return {
    merged: merged.length,
    sentBack: records.length - merged.length,
    ...(w === undefined ? {} : { waitMin: w }),
    agentHours: merged.reduce((n, r) => n + (r.workedMs ?? 0), 0) / 3_600_000,
    ...(records.length ? { rate: merged.length / records.length } : {}),
  };
}

/** The numbers as of `now`, from the shipped log's records (in any order). */
export function computeNumbers(records: readonly ShipRecord[], now: number): Numbers {
  const today = startOfDay(now);
  const weekFrom = today - (WEEK_DAYS - 1) * DAY;
  const beforeFrom = weekFrom - WEEK_DAYS * DAY;
  const upTo = now + 60_000;
  const inRange = (from: number, to: number) => records.filter((r) => r.at >= from && r.at < to);
  const days: { at: number; merged: number }[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    // Midnight by the calendar, so a day with a clock change still lines up.
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const at = d.getTime();
    const next = new Date(at);
    next.setDate(next.getDate() + 1);
    days.push({ at, merged: records.filter((r) => r.kind === 'merged' && r.at >= at && r.at < Math.min(next.getTime(), upTo)).length });
  }
  return {
    week: weekOf(inRange(weekFrom, upTo)),
    before: weekOf(inRange(beforeFrom, weekFrom)),
    days,
    rates: mergeRates(records),
    reviews: records.length,
  };
}

/** "4.5 min", "38 min", "2.1 h": a wait in the unit that reads best. */
export function minutesLabel(min: number | undefined): string {
  if (min === undefined) return '-';
  if (min < 10) return `${Math.round(min * 10) / 10} min`;
  if (min < 90) return `${Math.round(min)} min`;
  return `${Math.round((min / 60) * 10) / 10} h`;
}

/** "50%", or "-" with nothing to divide. */
export const percent = (rate: number | undefined) => (rate === undefined ? '-' : `${Math.round(rate * 100)}%`);

/** How a number moved since the week before, in words: "down from 12 min", "up from 3", "new". */
export function changeLabel(now: number | undefined, before: number | undefined, show: (n: number | undefined) => string): string {
  if (now === undefined && before === undefined) return 'nothing yet';
  if (before === undefined) return 'nothing the week before';
  if (now === undefined) return `none this week, ${show(before)} the week before`;
  if (Math.abs(now - before) < 1e-9) return `same as the week before`;
  return `${now < before ? 'down' : 'up'} from ${show(before)}`;
}

/** The numbers as Markdown, to paste into an investor update or a deck's notes. */
export function numbersMarkdown(n: Numbers, opts: { project?: string; demo?: boolean; now: number }): string {
  const day = new Date(opts.now).toISOString().slice(0, 10);
  const lines = [
    `Mergeline numbers, ${day}${opts.project ? `, ${opts.project}` : ''}${opts.demo ? ' (demo data, scripted agents)' : ''}`,
    '',
    '| Last 7 days | This week | Week before |',
    '| --- | --- | --- |',
    `| Human wait time (median) | ${minutesLabel(n.week.waitMin)} | ${minutesLabel(n.before.waitMin)} |`,
    `| Changes merged | ${n.week.merged} | ${n.before.merged} |`,
    `| Sent back | ${n.week.sentBack} | ${n.before.sentBack} |`,
    `| Merge rate | ${percent(n.week.rate)} | ${percent(n.before.rate)} |`,
    `| Agent-hours merged | ${n.week.agentHours.toFixed(1)} | ${n.before.agentHours.toFixed(1)} |`,
  ];
  if (n.rates.length) {
    lines.push('', '| Agent and model (30 days) | Merged | Sent back | Merge rate | N |', '| --- | --- | --- | --- | --- |');
    for (const r of n.rates) lines.push(`| ${r.label} | ${r.merged} | ${r.sentBack} | ${percent(r.rate)} | ${r.merged + r.sentBack} |`);
  }
  lines.push('', 'From the signed shipped log on this machine (shipped.jsonl). Human wait time is how long finished work waited on a person before its review.');
  return lines.join('\n');
}

/** The inbox's two numbers for today (home/pulse.ts): merges, and the median wait on a person, with the longest wait right now. */
export interface TodayPulse {
  merged: number;
  /** Median ms today's reviewed work waited on a person; undefined before the first review. */
  medianWaitMs?: number;
  /** The longest anyone is waiting on you right now (ms), or undefined when nobody is. */
  waitingNowMs?: number;
  /** How many are waiting on you right now. */
  waiting: number;
}

/** Today's pulse from the shipped log and when each agent waiting on you started waiting. */
export function todayPulse(records: readonly ShipRecord[], waitingSince: readonly number[], now: number): TodayPulse {
  const from = startOfDay(now);
  const today = records.filter((r) => r.at >= from && r.at <= now + 60_000);
  const waits = today.filter((r) => typeof r.waitedMs === 'number').map((r) => r.waitedMs!);
  const m = median(waits);
  const longest = waitingSince.length ? Math.max(0, now - Math.min(...waitingSince)) : undefined;
  return {
    merged: today.filter((r) => r.kind === 'merged').length,
    ...(m === undefined ? {} : { medianWaitMs: m }),
    ...(longest === undefined ? {} : { waitingNowMs: longest }),
    waiting: waitingSince.length,
  };
}

/** A wait the way the inbox says it: "38s", "4m", "1h 12m". */
export function waitWords(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}
