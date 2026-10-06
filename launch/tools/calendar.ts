// The launch calendar: launch/deadlines.json is the one list of dates, and this turns it into
// launch/calendar.ics (with reminders) and the timeline table in launch/README.md, so the two can't
// drift apart. Run it after editing the JSON:
//
//   npx tsx launch/tools/calendar.ts           rewrite calendar.ics and the README timeline
//   npx tsx launch/tools/calendar.ts --check   exit 1 if either is stale (npm test runs this too)

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Kind = 'deadline' | 'task' | 'event' | 'result';

export interface LaunchEvent {
  id: string;
  title: string;
  kind: Kind;
  /** A moment with its UTC offset, as the organizer states it: 2026-10-23T12:00:00-07:00. */
  at?: string;
  /** Or a whole day (YYYY-MM-DD), for tasks and for dates without a published time. */
  date?: string;
  /** Last day of a multi-day event, inclusive. */
  end?: string;
  /** How the organizer names the time zone, e.g. "PT (PDT, UTC-7)". */
  zone?: string;
  kit: string;
  url?: string;
  verified: boolean;
}

export interface LaunchData {
  calendar: { name: string; stamp: string; from: string; home: string };
  upstream: { repo: string; license: string; copyright: string; author: string; firstCommit: string; baseline: string; baselineDate: string };
  events: LaunchEvent[];
}

const AT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Reminders by kind, as iCalendar triggers relative to the start. A timed deadline starts an hour early. */
const ALARMS: Record<Kind, { timed: string[]; allDay: string[] }> = {
  deadline: { timed: ['-P7D', '-P2D', '-PT5H'], allDay: ['-P7D', '-P2D', 'PT9H'] },
  task: { timed: ['-PT1H'], allDay: ['PT9H'] },
  event: { timed: ['-P1D'], allDay: ['-P1D'] },
  result: { timed: [], allDay: [] },
};

/** Throws on the mistakes a hand-edited deadlines.json invites. */
export function validate(data: LaunchData): void {
  const ids = new Set<string>();
  for (const e of data.events) {
    if (!/^[a-z0-9-]+$/.test(e.id)) throw new Error(`bad id "${e.id}"`);
    if (ids.has(e.id)) throw new Error(`duplicate id "${e.id}"`);
    ids.add(e.id);
    if (!!e.at === !!e.date) throw new Error(`${e.id}: give exactly one of "at" or "date"`);
    if (e.at && (!AT_RE.test(e.at) || Number.isNaN(Date.parse(e.at)))) throw new Error(`${e.id}: "at" needs a date, time and UTC offset, got "${e.at}"`);
    if (e.at && !e.zone) throw new Error(`${e.id}: a timed event needs "zone"`);
    if (e.date && !DATE_RE.test(e.date)) throw new Error(`${e.id}: bad date "${e.date}"`);
    if (e.end && (!e.date || !DATE_RE.test(e.end) || e.end < e.date)) throw new Error(`${e.id}: bad end "${e.end}"`);
    if (!(e.kind in ALARMS)) throw new Error(`${e.id}: unknown kind "${e.kind}"`);
    if (e.url && !e.url.startsWith('https://')) throw new Error(`${e.id}: links must be https`);
  }
}

/** The day an event falls on, as the organizer counts it. */
export function dayOf(e: LaunchEvent): string {
  return e.at ? e.at.slice(0, 10) : e.date!;
}

/** Oldest first; timed events after all-day ones on the same day. */
export function sorted(events: LaunchEvent[]): LaunchEvent[] {
  const key = (e: LaunchEvent) => (e.at ? new Date(e.at).toISOString() : `${e.date}T`);
  return [...events].sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
}

/** 2026-10-23T12:00:00-07:00 -> 20261023T190000Z */
export function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function compactDate(day: string): string {
  return day.replace(/-/g, '');
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** TEXT values escape backslash, semicolon, comma and newline (RFC 5545 3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets continue on the next line after a space, never mid-character (RFC 5545 3.1). */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    // The first line may hold 75 octets; each continuation spends one on its leading space.
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** "2026-10-13 09:59" in the given IANA zone. */
export function wallClock(iso: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function summary(e: LaunchEvent): string {
  const tag = e.kind === 'deadline' ? 'DEADLINE: ' : e.kind === 'result' ? 'Results: ' : '';
  return `${tag}${e.title}${e.verified ? '' : ' [unverified]'}`;
}

function description(e: LaunchEvent, home: string): string {
  const lines: string[] = [];
  if (e.at) lines.push(`Closes ${e.at.slice(11, 16)} ${e.zone} (${wallClock(e.at, 'UTC')} UTC, ${wallClock(e.at, home)} ${home}).`);
  if (!e.verified) lines.push('Not confirmed by the organizer yet: check the official page before relying on it.');
  lines.push(`Kit: launch/${e.kit}`);
  if (e.url) lines.push(e.url);
  return lines.join('\n');
}

/** The whole calendar as an RFC 5545 string, CRLF line endings, reminders included. */
export function buildCalendar(data: LaunchData): string {
  validate(data);
  const stamp = utcStamp(data.calendar.stamp);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//agent-office fork//launch kits//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(data.calendar.name)}`];
  for (const e of sorted(data.events)) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@agent-office-launch`, `DTSTAMP:${stamp}`);
    if (e.at) {
      const close = new Date(e.at).getTime();
      lines.push(`DTSTART:${utcStamp(new Date(close - 3600_000).toISOString())}`, `DTEND:${utcStamp(e.at)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date!)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(e.end ?? e.date!))}`);
    }
    lines.push(`SUMMARY:${escapeText(summary(e))}`, `DESCRIPTION:${escapeText(description(e, data.calendar.home))}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`CATEGORIES:${e.kind.toUpperCase()}`, 'TRANSP:TRANSPARENT');
    for (const trigger of ALARMS[e.kind][e.at ? 'timed' : 'allDay']) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary(e))}`, `TRIGGER:${trigger}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function cell(s: string): string {
  return s.replace(/\|/g, '\\|');
}

/** The dated timeline table for launch/README.md, from `calendar.from` on. */
export function timelineMarkdown(data: LaunchData): string {
  validate(data);
  const home = data.calendar.home;
  const rows = ['| Date | What | Time | Kit | Status |', '| --- | --- | --- | --- | --- |'];
  for (const e of sorted(data.events)) {
    if (dayOf(e) < data.calendar.from) continue;
    const date = e.end ? `${e.date} to ${e.end}` : dayOf(e);
    const time = e.at ? `${e.at.slice(11, 16)} ${e.zone}; ${wallClock(e.at, 'UTC')} UTC; ${wallClock(e.at, home)} Vilnius` : e.kind === 'deadline' ? 'time not published' : 'all day';
    const kit = e.kit === 'README.md' ? 'this page' : `[${e.kit}](${e.kit})`;
    const checked = data.calendar.stamp.slice(0, 10);
    const status = e.kind === 'task' ? `our target${e.verified ? '' : ' [unverified]'}` : e.verified ? `confirmed ${checked}` : '[unverified]';
    rows.push(`| ${date} | ${cell(e.kind === 'deadline' ? `**${e.title}**` : e.title)} | ${cell(time)} | ${kit} | ${status} |`);
  }
  return rows.join('\n');
}

export const TIMELINE_START = '<!-- timeline:start (generated by launch/tools/calendar.ts from deadlines.json) -->';
export const TIMELINE_END = '<!-- timeline:end -->';

/** `readme` with the text between the timeline markers replaced. */
export function withTimeline(readme: string, table: string): string {
  const a = readme.indexOf(TIMELINE_START);
  const b = readme.indexOf(TIMELINE_END);
  if (a < 0 || b < a) throw new Error('launch/README.md is missing the timeline markers');
  return `${readme.slice(0, a + TIMELINE_START.length)}\n${table}\n${readme.slice(b)}`;
}

export const LAUNCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadData(dir = LAUNCH_DIR): LaunchData {
  return JSON.parse(readFileSync(path.join(dir, 'deadlines.json'), 'utf8')) as LaunchData;
}

/** Writes (or with `check`, compares) calendar.ics and the README timeline. Returns the stale files. */
export function sync(dir = LAUNCH_DIR, check = false): string[] {
  const data = loadData(dir);
  const want: Record<string, string> = { 'calendar.ics': buildCalendar(data) };
  const readme = readFileSync(path.join(dir, 'README.md'), 'utf8');
  want['README.md'] = withTimeline(readme, timelineMarkdown(data));
  const stale: string[] = [];
  for (const [file, text] of Object.entries(want)) {
    let have = '';
    try {
      have = readFileSync(path.join(dir, file), 'utf8');
    } catch {}
    if (have === text) continue;
    stale.push(file);
    if (!check) writeFileSync(path.join(dir, file), text);
  }
  return stale;
}

/** True when `url` (a module's import.meta.url) is the script node was started with, through any symlink. */
export function isMain(url: string): boolean {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = sync(LAUNCH_DIR, check);
  if (check && stale.length) {
    console.error(`stale: ${stale.join(', ')} (run: npx tsx launch/tools/calendar.ts)`);
    process.exit(1);
  }
  console.log(stale.length ? `${check ? 'stale' : 'wrote'}: ${stale.join(', ')}` : 'launch calendar up to date');
}
