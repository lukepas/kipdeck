// Signal's rules (src/shared/signal.ts): each status at the edge of its rule, Goals before /rundown,
// a stale rundown feeding nothing, No goal never reading as On track, only agents on the shown
// milestone counting, Signal orange only for a person, and the copy line in plain ASCII.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Ranked } from '../src/shared/attention.js';
import type { RosterEntry, RundownGist, SignalGoal } from '../src/shared/protocol.js';
import {
  ascii,
  BURN_DAYS,
  chipText,
  computeSignal,
  dayAt,
  forecastAt,
  gistOf,
  LONG_WAIT_MS,
  noGoalHint,
  noGoalLine,
  PEEK_GAP_MS,
  peekDelay,
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
  assert.equal(chipText(s, { goals: true, rundown: true }), 'Set a goal');
  // The chip only suggests what this page can do.
  assert.equal(chipText(s, { goals: false, rundown: true }), 'Run /rundown');
  assert.equal(chipText(s, { goals: false, rundown: false }), 'Turn on Goals or Rundown in Labs');
  assert.equal(noGoalHint({ goals: true, rundown: false }), 'Set a goal');
  // Goals on but the boards lab Mission control sits behind is off: name the lab that's off.
  assert.equal(noGoalHint({ goals: false, rundown: false, boardsOff: true }), 'Turn on GitHub boards or Rundown in Labs');
  // The card says the same as the chip.
  for (const src of [{ goals: false, rundown: false }, { goals: false, rundown: false, boardsOff: true }]) assert.ok(noGoalLine(src).includes(noGoalHint(src)), noGoalLine(src));
  assert.match(noGoalLine({ goals: true, rundown: true }), /Set a milestone in Goals/);
  // The read-only demo suggests nothing a visitor can't do.
  assert.equal(noGoalHint({ goals: true, rundown: true, readOnly: true }), 'No milestone set');
  assert.doesNotMatch(noGoalLine({ goals: true, rundown: true, readOnly: true }), /Set|Run|Turn on/);
  assert.equal(computeSignal(input({ goal: null })).level, 'no-goal');
});

test('On track: a milestone and no rule fired', () => {
  const s = computeSignal(input());
  assert.equal(s.level, 'on-track');
  assert.equal(s.person, false);
  assert.deepEqual(s.milestone, { source: 'goals', id: 'g1', title: 'Auth rewrite', done: 5, total: 9, unit: 'issues' });
  assert.equal(chipText(s, { goals: false, rundown: false }), 'Auth rewrite 5/9');
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
  // The date and the count each said once: how late in the forecast line, what's left in the reason.
  assert.equal(late.reasons[0].text, 'Past its due date with 4 issues left');
  assert.equal(late.forecast, `due ${shortDay(dayAt(day(-1))!)}, 1 day late`);
  assert.equal(computeSignal(input({ goal: goal({ due: day(-5) }) })).forecast, `due ${shortDay(dayAt(day(-5))!)}, 5 days late`);
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
  assert.equal(one.reasons[0].text, 'Agent is stuck on this milestone');
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

test('At risk: the forecast past the due date minus the margin, or nothing closed in a whole window', () => {
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
  assert.equal(tight.reasons[0].text, `Pace says ~${shortDay(NOW + 8 * DAY)}, too close to ${shortDay(dayAt(day(9))!)}`);
  // Past the due date, it says so instead of "too close".
  const past = computeSignal(input({ goal: goal({ due: day(3) }), burn }));
  assert.equal(past.reasons[0].text, `Pace says ~${shortDay(NOW + 8 * DAY)}, after the ${shortDay(dayAt(day(3))!)} due date`);
  // Nothing closed in a whole window: at that pace it never lands, so At risk, whatever the due date.
  const none = computeSignal(input({ goal: goal({ due: day(20), closed: 3 }), burn: { closed: 0, days: BURN_DAYS } }));
  assert.equal(none.level, 'at-risk');
  assert.equal(none.person, false);
  assert.equal(none.reasons[0].text, `No issues closed in ${BURN_DAYS} days`);
  assert.equal(none.forecast, `due ${shortDay(dayAt(day(20))!)}, 6 issues left`);
  // A milestone younger than the window has no pace yet, which is no rule; nor is a gist not in yet.
  const young = computeSignal(input({ goal: goal({ due: day(20) }), burn: { closed: 0, days: 2 } }));
  assert.equal(young.level, 'on-track');
  assert.equal(young.forecast, `due ${shortDay(dayAt(day(20))!)}, no pace yet`);
  const waiting = computeSignal(input({ goal: goal({ due: day(20) }), burn: null }));
  assert.equal(waiting.level, 'on-track');
  assert.equal(waiting.forecast, `due ${shortDay(dayAt(day(20))!)}, 4 issues left`);
  // A younger milestone's pace is its own days: 2 closed in 2 days is one a day, 4 left lands in 4.
  assert.equal(forecastAt({ done: 5, total: 9 }, { closed: 2, days: 2 }, NOW), NOW + 4 * DAY);
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
  assert.equal(over.reasons[0].text, 'Agent has waited on you over 1 h');
  assert.deepEqual(over.next, { text: 'Answer the agent', from: 'from the inbox' });
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
  assert.deepEqual(computeSignal(input({ ranked: [agent('needs-you')] })).next, { text: 'Answer the agent', from: 'from the inbox' });
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
  // A clipped question and a title or next step with "..." of their own keep it: one stop, never doubled or cut.
  const long = 'Should the session cookie move to the new domain before the launch or after the first customers are on it?';
  const clipped = signalLine('p', computeSignal(input({ goal: goal({ title: 'Wait for it...' }), rundown: gist({ decisionsOpen: 1, decisions: [{ id: 'D1', question: long }], next: 'Ship it...' }) })));
  assert.match(clipped, /^p: At risk\. Wait for it\.\.\. 5\/9 issues\. 1 decision open: "Should the session .+\.\.\."\. 6 merged this week \(5 the week before\)\. Next: Ship it\.\.\.$/);
  assert.ok(!/[^.]\.\.[^.]/.test(clipped), `no ".." anywhere: ${clipped}`);
  assert.equal(signalLine('p', computeSignal(input({ goal: null, rundown: gist({ next: 'Is it done?' }) }))), 'p: No goal. No milestone set. 6 merged this week (5 the week before). Next: Is it done?');
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
    // Oldest first, an undated one after every dated one.
    decisions: [{ id: 'D1', question: 'Q1?', raised: '2026-10-01' }, { id: 'D4', question: 'Q4?', raised: '2026-10-04' }, { id: 'D5', question: 'Q5?', raised: '2026-10-05' }],
    stuck: 2,
    waitingOn: 'a key',
  });
});

test('a peek sooner than the office answers is held back until just after the gap, never dropped', () => {
  assert.equal(peekDelay(undefined, NOW), 0);
  assert.equal(peekDelay(NOW - PEEK_GAP_MS, NOW), 0);
  const wait = peekDelay(NOW - 200, NOW);
  assert.ok(wait > PEEK_GAP_MS - 200 && wait <= PEEK_GAP_MS, `${wait}`);
});

test('a milestone with no issues yet says so on the chip, never 0/0', () => {
  const s = computeSignal(input({ goal: goal({ closed: 0, issues: 0 }) }));
  assert.equal(chipText(s, { goals: true, rundown: true }), 'Auth rewrite, no issues yet');
});

test("the gist's open decisions are the oldest, whatever order decisions.md lists them in", () => {
  const g = gistOf(NOW, [], [], null, [
    { id: 'D1', question: 'newest A', raised: day(-1), answer: null },
    { id: 'D2', question: 'B', raised: day(-2), answer: null },
    { id: 'D3', question: 'undated', answer: null },
    { id: 'D4', question: 'C', raised: day(-3), answer: null },
    { id: 'D5', question: 'the oldest', raised: day(-40), answer: null },
  ]);
  assert.equal(g.decisionsOpen, 5);
  assert.deepEqual(g.decisions.map((d) => d.id), ['D5', 'D4', 'D2']);
  const s = computeSignal(input({ rundown: { ...g, at: NOW } }));
  assert.equal(s.decisions.oldestDays, 40);
  assert.match(s.reasons.find((r) => r.rule === 'decision')!.text, /oldest 40 days: "the oldest"/);
});
