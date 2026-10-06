import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, escapeText, fold, sorted, timelineMarkdown, utcStamp, validate, wallClock, withTimeline, TIMELINE_END, TIMELINE_START, type LaunchData, type LaunchEvent } from '../launch/tools/calendar.js';

/** A small calendar with one of each kind of entry. */
function data(events: LaunchEvent[] = sample()): LaunchData {
  return {
    calendar: { name: 'Test, launch; calendar', stamp: '2026-09-30T00:00:00Z', from: '2026-10-01', home: 'Europe/Vilnius' },
    upstream: { repo: 'https://example.com/r', license: 'MIT', copyright: 'Copyright (c) 2026 X', author: 'x', firstCommit: '2026-09-25', baseline: 'abc', baselineDate: '2026-09-30' },
    events,
  };
}

function sample(): LaunchEvent[] {
  return [
    { id: 'meta', at: '2026-11-18T12:00:00-08:00', zone: 'PT (PST, UTC-8)', kind: 'deadline', title: 'Meta closes', kit: 'meta-vr-start.md', url: 'https://example.com/meta', verified: true },
    { id: 'build', date: '2026-11-03', end: '2026-11-08', kind: 'event', title: 'Build phase', kit: 'vultr-agent-rush.md', verified: false },
    { id: 'old', date: '2026-09-29', kind: 'task', title: 'Before the timeline starts', kit: 'README.md', verified: true },
    { id: 'record', date: '2026-11-12', kind: 'task', title: 'Record | video', kit: 'meta-vr-start.md', verified: true },
    { id: 'results', date: '2026-12-11', kind: 'result', title: 'Winners', kit: 'meta-vr-start.md', verified: true },
  ];
}

/** Undo RFC 5545 folding, the way a calendar app reads the file. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

test('deadlines convert to UTC across both daylight-saving changes', () => {
  assert.equal(utcStamp('2026-10-12T23:59:00-07:00'), '20261013T065900Z');
  assert.equal(utcStamp('2026-11-18T12:00:00-08:00'), '20261118T200000Z');
  assert.equal(utcStamp('2026-11-11T17:00:00+02:00'), '20261111T150000Z');
  // Vilnius is on summer time until 2026-10-25, the US until 2026-11-01.
  assert.equal(wallClock('2026-10-12T23:59:00-07:00', 'Europe/Vilnius'), '2026-10-13 09:59');
  assert.equal(wallClock('2026-10-30T10:00:00-07:00', 'Europe/Vilnius'), '2026-10-30 19:00');
  assert.equal(wallClock('2026-11-18T12:00:00-08:00', 'Europe/Vilnius'), '2026-11-18 22:00');
  assert.equal(wallClock('2026-10-23T12:00:00-07:00', 'America/Los_Angeles'), '2026-10-23 12:00');
});

test('text values escape what iCalendar reserves', () => {
  assert.equal(escapeText('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
});

test('long lines fold at 75 octets without splitting a character, and unfold back', () => {
  const line = `SUMMARY:${'x'.repeat(70)}${'ą'.repeat(40)}${'y'.repeat(100)}`;
  const folded = fold(line);
  for (const part of folded.split('\r\n')) assert.ok(Buffer.byteLength(part) <= 75, part);
  assert.equal(folded.replace(/\r\n /g, ''), line);
  assert.equal(fold('SHORT:1'), 'SHORT:1');
});

test('validation rejects the mistakes a hand-edited file invites', () => {
  const base = sample()[0];
  const bad: [Partial<LaunchEvent>, RegExp][] = [
    [{ at: '2026-11-18T12:00:00' }, /UTC offset/],
    [{ zone: undefined }, /needs "zone"/],
    [{ date: '2026-11-18' }, /exactly one/],
    [{ url: 'http://example.com' }, /https/],
    [{ id: 'Bad Id' }, /bad id/],
    [{ kind: 'party' as never }, /unknown kind/],
  ];
  for (const [patch, re] of bad) assert.throws(() => validate(data([{ ...base, ...patch }])), re);
  assert.throws(() => validate(data([base, { ...base }])), /duplicate/);
  assert.throws(() => validate(data([{ id: 'x', date: '2026-11-08', end: '2026-11-01', kind: 'event', title: 't', kit: 'k', verified: true }])), /bad end/);
  assert.doesNotThrow(() => validate(data()));
});

test('the calendar is valid iCalendar: CRLF, balanced blocks, one event per entry, reminders by kind', () => {
  const ics = buildCalendar(data());
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'bare LF');
  for (const raw of ics.split('\r\n')) assert.ok(Buffer.byteLength(raw) <= 75, raw);
  const lines = unfold(ics);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes('X-WR-CALNAME:Test\\, launch\\; calendar'));
  for (const block of ['VEVENT', 'VALARM']) assert.equal(lines.filter((l) => l === `BEGIN:${block}`).length, lines.filter((l) => l === `END:${block}`).length);
  const events = ics.split('BEGIN:VEVENT').slice(1).map((e) => unfold(e));
  assert.equal(events.length, 5);
  const byId = (id: string) => events.find((e) => e.includes(`UID:${id}@agent-office-launch`))!;
  const alarms = (e: string[]) => e.filter((l) => l.startsWith('TRIGGER:')).map((l) => l.slice(8));

  const meta = byId('meta');
  assert.ok(meta.includes('DTSTART:20261118T190000Z') && meta.includes('DTEND:20261118T200000Z'), 'a deadline ends at the cut-off');
  assert.deepEqual(alarms(meta), ['-P7D', '-P2D', '-PT5H']);
  assert.ok(meta.includes('SUMMARY:DEADLINE: Meta closes'));
  assert.ok(meta.some((l) => l.startsWith('DESCRIPTION:Closes 12:00 PT (PST\\, UTC-8) (2026-11-18 20:00 UTC\\, 2026-11-18 22:00 Europe/Vilnius).')));
  assert.ok(meta.includes('URL:https://example.com/meta'));

  const build = byId('build');
  assert.ok(build.includes('DTSTART;VALUE=DATE:20261103') && build.includes('DTEND;VALUE=DATE:20261109'), 'all-day end is exclusive');
  assert.ok(build.includes('SUMMARY:Build phase [unverified]'));
  assert.deepEqual(alarms(build), ['-P1D']);
  assert.deepEqual(alarms(byId('record')), ['PT9H']);
  assert.deepEqual(alarms(byId('results')), []);
  assert.ok(events.every((e) => e.includes('DTSTAMP:20260930T000000Z')), 'stamped from the data, so the file is reproducible');
});

test('the timeline lists entries from the start date, oldest first, with times in three zones', () => {
  const md = timelineMarkdown(data());
  const rows = md.split('\n').slice(2);
  assert.deepEqual(rows.map((r) => r.split(' | ')[0].slice(2)), ['2026-11-03 to 2026-11-08', '2026-11-12', '2026-11-18', '2026-12-11']);
  assert.ok(rows[2].includes('**Meta closes**') && rows[2].includes('12:00 PT (PST, UTC-8); 2026-11-18 20:00 UTC; 2026-11-18 22:00 Vilnius'));
  assert.ok(rows[1].includes('Record \\| video'), 'pipes inside a cell are escaped');
  assert.ok(rows[0].endsWith('| [unverified] |'));
  assert.ok(rows[1].endsWith('| our target |'));
  assert.ok(rows[2].endsWith('| confirmed 2026-09-30 |'));
});

test('sorting puts all-day items before timed ones on the same day', () => {
  const same = [
    { id: 'b', at: '2026-10-12T23:59:00-07:00', zone: 'PT', kind: 'deadline', title: 'late', kit: 'k', verified: true },
    { id: 'a', date: '2026-10-12', kind: 'task', title: 'day', kit: 'k', verified: true },
  ] as LaunchEvent[];
  assert.deepEqual(sorted(same).map((e) => e.id), ['a', 'b']);
});

test('the README timeline is replaced between its markers, and missing markers are an error', () => {
  const readme = `# Title\n\n${TIMELINE_START}\nold\n${TIMELINE_END}\n\nAfter.\n`;
  const out = withTimeline(readme, '| new |');
  assert.equal(out, `# Title\n\n${TIMELINE_START}\n| new |\n${TIMELINE_END}\n\nAfter.\n`);
  assert.equal(withTimeline(out, '| new |'), out, 'idempotent');
  assert.throws(() => withTimeline('# no markers\n', 'x'), /markers/);
});
