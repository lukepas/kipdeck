// Signal's rules (src/shared/signal.ts): each status at the edge of its rule, Goals before /rundown,
// a stale rundown feeding nothing, No goal never reading as On track, only agents on the shown
// milestone counting, Signal orange only for a person, and the copy line in plain ASCII.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Ranked } from '../src/shared/attention.js';
import type { RosterEntry, RundownGist, SignalGoal } from '../src/shared/protocol.js';
import type { Rundown } from '../src/shared/rundown/schema.js';
import {
  ascii,
  BURN_DAYS,
  chipText,
  computeSignal,
  dayAt,
  forecastAt,
  gistOf,
  gistOfRundown,
  LONG_WAIT_MS,
  PACE_MIN_BEFORE,
  pickMilestone,
  RISK_MARGIN_DAYS,
  shortDay,
  signalLine,
  STALE_RUNDOWN_DAYS,
  type SignalInput,
} from '../src/shared/signal.js';

const DAY = 86_400_000;
/** Noon on 2026-10-11, local time. */
const NOW = new Date(2026, 9, 11, 12).getTime();
const day = (offset: number) => {
  const d = new Date(NOW + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const goal = (extra: Partial<SignalGoal> = {}): SignalGoal => ({ id: 'g1', title: 'Auth rewrite', closed: 5, issues: 9, ...extra });
const gist = (extra: Partial<RundownGist> = {}): RundownGist => ({ at: NOW - DAY, milestone: null, next: null, decisionsOpen: 0, decisions: [], stuck: 0, ...extra });
const agent = (level: Ranked['att']['level'], extra: Partial<RosterEntry> = {}, since = NOW - 60_000, snoozed = false): Ranked => ({
  entry: { id: extra.name ?? 'a1', name: 'cobalt-3', floor: 'f1', status: 'working', createdAt: NOW - DAY, ...extra } as RosterEntry,
  att: { level, label: '', since, action: 'answer', snoozed },
});
const input = (extra: Partial<SignalInput> = {}): SignalInput => ({ now: NOW, goal: goal(), burn: null, rundown: null, ranked: [], merges: { week: 6, before: 5 }, ...extra });

test('No goal: neither Goals nor a fresh rundown has a milestone, whatever else is going on', () => {
  const s = computeSignal(input({ goal: null, rundown: gist({ decisionsOpen: 2, decisions: [{ id: 'D1', question: 'Which host?' }] }), ranked: [agent('stuck', { goal: 'g1' })] }));
  assert.equal(s.level, 'no-goal');
  assert.deepEqual(s.reasons, []);
  assert.equal(s.milestone, null);
  assert.equal(chipText(s), 'Set a goal');
  assert.equal(computeSignal(input({ goal: null })).level, 'no-goal');
});

test('On track: a milestone and no rule fired', () => {
  const s = computeSignal(input());
  assert.equal(s.level, 'on-track');
  assert.equal(s.person, false);
  assert.deepEqual(s.milestone, { source: 'goals', id: 'g1', title: 'Auth rewrite', done: 5, total: 9, unit: 'issues' });
  assert.equal(chipText(s), 'Auth rewrite 5/9');
  assert.equal(s.pace.trend, 'up');
});

test('Goals first: the rundown milestone only shows when Goals has none, and the source is said', () => {
  const rd = gist({ milestone: { id: 'M2', title: 'First release', done: 1, total: 4, due: day(10) } });
  assert.equal(pickMilestone(goal(), rd)?.source, 'goals');
  const s = computeSignal(input({ goal: null, rundown: rd }));
  assert.equal(s.level, 'on-track');
  assert.deepEqual(s.milestone, { source: 'rundown', id: 'M2', title: 'First release', done: 1, total: 4, unit: 'items', due: day(10) });
  assert.equal(s.forecast, `due ${shortDay(dayAt(day(10))!)}`);
});

test('a rundown 7 days old or more feeds nothing, and says to run /rundown again', () => {
  const old = gist({ at: NOW - STALE_RUNDOWN_DAYS * DAY, milestone: { id: 'M1', title: 'Old', done: 0, total: 3 }, stuck: 2, decisionsOpen: 1, decisions: [{ id: 'D1', question: 'Q?' }], next: 'Do it' });
  const s = computeSignal(input({ goal: null, rundown: old }));
  assert.equal(s.level, 'no-goal');
  assert.equal(s.next, null);
  assert.equal(s.decisions.open, 0);
  assert.match(s.staleNote!, /7 days old: run \/rundown again/);
  assert.equal(s.rundown, 'stale');
  assert.equal(computeSignal(input()).rundown, 'none');
  // A day under the limit, it still counts.
  const fresh = computeSignal(input({ goal: null, rundown: { ...old, at: NOW - (STALE_RUNDOWN_DAYS - 1) * DAY } }));
  assert.equal(fresh.level, 'off-track');
  assert.equal(fresh.staleNote, undefined);
  assert.equal(fresh.rundown, 'fresh');
});

test('Off track: past the due date with issues left, not on the due day itself, not with nothing left', () => {
  const late = computeSignal(input({ goal: goal({ due: day(-1) }) }));
  assert.equal(late.level, 'off-track');
  assert.match(late.reasons[0].text, /^Past its due date \(\w{3} \d+\) with 4 issues left$/);
  assert.match(late.forecast!, /, 4 issues left$/);
  assert.equal(computeSignal(input({ goal: goal({ due: day(0) }) })).level, 'on-track', 'the due day is not overdue');
  const done = computeSignal(input({ goal: goal({ due: day(-3), closed: 9 }) }));
  assert.equal(done.level, 'on-track');
  assert.match(done.forecast!, /all issues done$/);
  const empty = computeSignal(input({ goal: goal({ due: day(-3), closed: 0, issues: 0 }) }));
  assert.equal(empty.level, 'on-track', 'no issues linked is not overdue work');
  assert.match(empty.forecast!, /no issues yet$/);
});

test('Off track: only a stuck agent linked to the shown milestone counts, snoozed ones never', () => {
  assert.equal(computeSignal(input({ ranked: [agent('stuck', { goal: 'other' })] })).level, 'on-track');
  assert.equal(computeSignal(input({ ranked: [agent('stuck')] })).level, 'on-track', 'unlinked');
  assert.equal(computeSignal(input({ ranked: [agent('stuck', { goal: 'g1' }, NOW, true)] })).level, 'on-track', 'snoozed');
  const one = computeSignal(input({ ranked: [agent('stuck', { goal: 'g1' })] }));
  assert.equal(one.level, 'off-track');
  assert.equal(one.reasons[0].text, 'cobalt-3 is stuck on this milestone');
  const two = computeSignal(input({ ranked: [agent('stuck', { goal: 'g1', name: 'a' }), agent('stuck', { goal: 'g1', name: 'b' })] }));
  assert.equal(two.reasons[0].text, '2 agents are stuck on this milestone');
  // A rundown milestone has no agents linked to it.
  const rd = gist({ milestone: { id: 'g1', title: 'Same id', done: 0, total: 2 } });
  assert.equal(computeSignal(input({ goal: null, rundown: rd, ranked: [agent('stuck', { goal: 'g1' })] })).level, 'on-track');
});

test('Off track: a part the skill marked stuck, with what it waits on', () => {
  const s = computeSignal(input({ rundown: gist({ stuck: 1, waitingOn: 'an API key' }) }));
  assert.equal(s.level, 'off-track');
  assert.equal(s.reasons[0].text, '1 part stuck, waiting on an API key');
  assert.equal(computeSignal(input({ rundown: gist({ stuck: 2 }) })).reasons[0].text, '2 parts marked stuck in /rundown');
});

test('At risk: the forecast past the due date minus the margin; no pace means no forecast rule', () => {
  // 4 issues left at 7 closed in 14 days (half a day each): 8 days out.
  const burn = { closed: 7, days: BURN_DAYS };
  assert.equal(forecastAt({ done: 5, total: 9 }, burn, NOW), NOW + 8 * DAY);
  assert.equal(forecastAt({ done: 9, total: 9 }, burn, NOW), undefined);
  assert.equal(forecastAt({ done: 5, total: 9 }, { closed: 0, days: BURN_DAYS }, NOW), undefined);
  const safe = computeSignal(input({ goal: goal({ due: day(8 + RISK_MARGIN_DAYS) }), burn }));
  assert.equal(safe.level, 'on-track');
  assert.equal(safe.forecast, `due ${shortDay(dayAt(day(10))!)}, pace says ~${shortDay(NOW + 8 * DAY)} (rough)`);
  const tight = computeSignal(input({ goal: goal({ due: day(8 + RISK_MARGIN_DAYS - 1) }), burn }));
  assert.equal(tight.level, 'at-risk');
  assert.equal(tight.person, false, 'a forecast is not a person');
  assert.match(tight.reasons[0].text, /^Pace says ~\w{3} \d+, too close to \w{3} \d+$/);
  const none = computeSignal(input({ goal: goal({ due: day(3) }), burn: { closed: 0, days: BURN_DAYS } }));
  assert.equal(none.level, 'on-track');
  assert.match(none.forecast!, /no issues closed in 14 days$/);
});

test('At risk, orange: an open rundown decision, or a needs-you wait over an hour', () => {
  const dec = computeSignal(input({ rundown: gist({ decisionsOpen: 2, decisions: [{ id: 'D1', question: 'JWT or opaque tokens?', raised: day(-2) }] }) }));
  assert.equal(dec.level, 'at-risk');
  assert.equal(dec.person, true);
  assert.equal(dec.reasons[0].text, '2 decisions open, oldest 2 days: "JWT or opaque tokens?"');
  assert.deepEqual(dec.decisions, { open: 2, oldestDays: 2, first: 'JWT or opaque tokens?' });
  const justUnder = computeSignal(input({ ranked: [agent('needs-you', {}, NOW - LONG_WAIT_MS)] }));
  assert.equal(justUnder.level, 'on-track', 'an hour exactly is not over an hour');
  const over = computeSignal(input({ ranked: [agent('needs-you', {}, NOW - LONG_WAIT_MS - 60_000)] }));
  assert.equal(over.level, 'at-risk');
  assert.equal(over.person, true);
  assert.equal(over.reasons[0].text, 'cobalt-3 has waited on you over 1 h');
  assert.deepEqual(over.next, { text: 'Answer cobalt-3', from: 'from the inbox' });
  assert.equal(computeSignal(input({ ranked: [agent('needs-you', {}, NOW - 3 * LONG_WAIT_MS, true)] })).level, 'on-track', 'snoozed');
});

test('At risk: merges under half of last week, only once last week had enough', () => {
  assert.equal(computeSignal(input({ merges: { week: 1, before: PACE_MIN_BEFORE } })).level, 'at-risk');
  assert.equal(computeSignal(input({ merges: { week: 2, before: PACE_MIN_BEFORE } })).level, 'on-track', 'half is not under half');
  assert.equal(computeSignal(input({ merges: { week: 0, before: PACE_MIN_BEFORE - 1 } })).level, 'on-track', 'a quiet project is not slowing');
  const slow = computeSignal(input({ merges: { week: 1, before: 6 } }));
  assert.equal(slow.reasons[0].text, '1 merged this week, 6 the week before');
  assert.equal(slow.person, false);
  assert.equal(slow.pace.trend, 'down');
  assert.equal(computeSignal(input({ merges: { week: 3, before: 3 } })).pace.trend, 'level');
});

test('Off track wins over At risk, and its reasons come first', () => {
  const s = computeSignal(input({ rundown: gist({ stuck: 1, decisionsOpen: 1, decisions: [{ id: 'D1', question: 'Q?' }] }), merges: { week: 0, before: 9 } }));
  assert.equal(s.level, 'off-track');
  assert.equal(s.person, false, 'orange is for At risk only');
  assert.deepEqual(s.reasons.map((r) => r.level), ['off-track', 'at-risk', 'at-risk']);
});

test('the next thing: the skill\'s next step with its age, else the inbox', () => {
  assert.deepEqual(computeSignal(input({ rundown: gist({ next: 'Wire the refresh endpoint', at: NOW - 2 * DAY }) })).next, { text: 'Wire the refresh endpoint', from: 'from /rundown, 2 days ago' });
  assert.deepEqual(computeSignal(input({ rundown: gist({ next: 'X', at: NOW }) })).next?.from, 'from /rundown, today');
  assert.deepEqual(computeSignal(input({ ranked: [agent('needs-you')] })).next, { text: 'Answer cobalt-3', from: 'from the inbox' });
  assert.equal(computeSignal(input()).next, null);
});

test('the copy line: one line, plain ASCII, for Slack', () => {
  const s = computeSignal(input({ goal: goal({ title: 'Caf\u00e9 \u201cauth\u201d rewrite \u2014 v2\u2026', due: day(13) }), burn: { closed: 7, days: BURN_DAYS }, rundown: gist({ decisionsOpen: 1, decisions: [{ id: 'D1', question: 'JWT or opaque?' }], next: 'Wire refresh.' }), merges: { week: 12, before: 9 } }));
  const line = signalLine('agent-office', s);
  assert.match(line, /^[\x20-\x7e]+$/, 'printable ASCII only');
  assert.ok(!line.includes('\n'));
  assert.ok(!line.includes('!'));
  assert.equal(line, `agent-office: At risk. Cafe "auth" rewrite - v2... 5/9 issues, due ${shortDay(dayAt(day(13))!)}, pace says ~${shortDay(NOW + 8 * DAY)} (rough). 1 decision open: "JWT or opaque?". 12 merged this week (9 the week before). Next: Wire refresh.`);
  assert.equal(signalLine('p', computeSignal(input({ goal: null }))), 'p: No goal. No milestone set. 6 merged this week (5 the week before).');
  // The decisions are counted once: in the reason when it is theirs, else after the pace.
  const both = computeSignal(input({ rundown: gist({ stuck: 1, decisionsOpen: 2, decisions: [{ id: 'D1', question: 'Q?' }] }) }));
  assert.equal(signalLine('p', both), 'p: Off track. Auth rewrite 5/9 issues. 1 part marked stuck in /rundown. 6 merged this week (5 the week before), 2 decisions open.');
  assert.equal(ascii('  a\u200bb\u00a0c  '), 'ab c');
});

test('the gist of a rundown: the active milestone, open decisions, and only the skill\'s stuck parts', () => {
  const ms = [
    { id: 'M1', name: 'Done one', doneWhen: '', due: null, items: [{ text: 'a', done: true, partId: null }], state: 'done' as const, source: 'proposed' as const },
    { id: 'M2', name: 'Next one', doneWhen: '', due: '2026-10-24', items: [{ text: 'a', done: true, partId: null }, { text: 'b', done: false, partId: null }], state: 'active' as const, source: 'milestones.md' as const },
  ];
  const decisions = [
    { id: 'D1', question: 'Q1?', raised: '2026-10-01', answer: null },
    { id: 'D2', question: 'Q2?', raised: '2026-10-02', answer: 'B' },
    { id: 'D3', question: 'Q3?', raised: '', answer: null },
    { id: 'D4', question: 'Q4?', raised: '2026-10-04', answer: null },
    { id: 'D5', question: 'Q5?', raised: '2026-10-05', answer: null },
  ];
  const g = gistOf(NOW, [{ status: 'stuck', waitingOn: null }, { status: 'stuck', waitingOn: 'a key' }, { status: 'done', waitingOn: null }], ms, 'Do the thing', decisions);
  assert.deepEqual(g, {
    at: NOW,
    milestone: { id: 'M2', title: 'Next one', done: 1, total: 2, due: '2026-10-24' },
    next: 'Do the thing',
    decisionsOpen: 4,
    decisions: [{ id: 'D1', question: 'Q1?', raised: '2026-10-01' }, { id: 'D3', question: 'Q3?' }, { id: 'D4', question: 'Q4?', raised: '2026-10-04' }],
    stuck: 2,
    waitingOn: 'a key',
  });
  const r = { generatedAt: new Date(NOW).toISOString(), parts: [{ status: 'stuck', statusSource: 'inferred', waitingOn: null }, { status: 'stuck', statusSource: 'claude', waitingOn: 'x' }], milestones: ms, nextStep: null, decisions } as unknown as Rundown;
  const live = gistOfRundown(r);
  assert.equal(live.stuck, 1, 'an inferred status never counts');
  assert.equal(live.at, NOW);
  assert.equal(live.next, null);
});
