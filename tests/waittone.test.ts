// How long a unit has waited, and on what, wherever the bridge shows it: the shared tone
// (src/shared/wait.ts), the callouts' short ask and clock, and the pod plates' oldest wait.
import assert from 'node:assert/strict';
import test from 'node:test';
import { WAIT_AMBER_MS, WAIT_RED_MS, waitClock, waitTone, waitsOnPerson } from '../src/shared/wait.ts';
import { spokenActivity } from '../src/shared/attention.ts';
import { FAR_MAX, askLine, midLine, shortAsk } from '../src/client/features/workers/lod.ts';
import { calloutText, type UnitSays } from '../src/client/world/character/callout-view.ts';
import { countsText, podLabel, segments } from '../src/client/features/pods/label.ts';

const MIN = 60_000;
const NOW = 1_800_000_000_000;

test('a wait is fresh under 5 minutes, aging from 5, stale from 30', () => {
  assert.equal(waitTone(0), 'fresh');
  assert.equal(waitTone(WAIT_AMBER_MS - 1), 'fresh');
  assert.equal(waitTone(WAIT_AMBER_MS), 'aging');
  assert.equal(waitTone(12 * MIN), 'aging');
  assert.equal(waitTone(WAIT_RED_MS - 1), 'aging');
  assert.equal(waitTone(WAIT_RED_MS), 'stale');
  assert.equal(waitTone(3 * 3_600_000), 'stale');
  assert.equal(WAIT_AMBER_MS, 5 * MIN);
  assert.equal(WAIT_RED_MS, 30 * MIN);
});

test('only a wait on a person takes a tone: a working or parked unit is never late', () => {
  for (const l of ['needs-you', 'stuck', 'review'] as const) assert.ok(waitsOnPerson(l));
  for (const l of ['working', 'parked'] as const) assert.ok(!waitsOnPerson(l));
  assert.deepEqual(waitClock('needs-you', 12 * MIN), { text: '12m', tone: 'aging' });
  assert.deepEqual(waitClock('review', 41 * MIN), { text: '41m', tone: 'stale' });
  assert.deepEqual(waitClock('working', 41 * MIN), { text: '41m' });
});

test("an asking tool's bare name is never said: Codex's request_user_input, Claude's AskUserQuestion", () => {
  for (const name of ['request_user_input', 'AskUserQuestion', 'functions.request_user_input', ' request_user_input ']) assert.equal(spokenActivity(name), undefined);
  assert.equal(spokenActivity('Which selector?'), 'Which selector?');
  assert.equal(spokenActivity(undefined), undefined);
  const codex = { activity: 'request_user_input', level: 'needs-you' as const, label: 'Needs an answer' };
  assert.doesNotMatch(midLine(codex), /request_user_input/);
  assert.equal(askLine(codex), 'Needs an answer');
  assert.equal(shortAsk(codex), null, 'nothing more to say than its state');
  // The question read off the terminal (the ranking's label) says it instead.
  const asked = shortAsk({ ...codex, label: 'Which selector should I use?' })!;
  assert.match(asked, /^Which selector/);
  assert.ok(asked.length <= FAR_MAX);
});

test('the short ask leads a permission with its command, else says the question or why it is stuck', () => {
  assert.equal(shortAsk({ activity: 'Wants permission: Bash: npm publish', level: 'needs-you' }), 'npm publish?');
  assert.equal(shortAsk({ activity: 'Which one?', level: 'needs-you' }), 'Which one?');
  assert.ok(shortAsk({ activity: 'Should I also rewrite the whole session store?', level: 'needs-you' })!.length <= FAR_MAX);
  assert.equal(shortAsk({ level: 'stuck', label: 'Crashed' }), 'Crashed');
  assert.equal(shortAsk({ activity: 'Edit a.ts', level: 'working' }), null);
  assert.equal(shortAsk({ level: 'review', label: 'Done: PR ready' }), null);
});

const unit = (o: Partial<UnitSays>): UnitSays => ({
  tier: 'far',
  sign: 'A-03',
  name: 'Pixel',
  kind: 'needs-you',
  level: 'needs-you',
  since: NOW - 12 * MIN,
  status: 'needs_input',
  lost: false,
  epithet: '',
  said: null,
  leaving: null,
  activity: 'Wants permission: Bash: npm publish',
  ...o,
});

test("from the Overview a unit that needs you keeps its call sign, what it asks and how long: 'A-03 npm publish? 12m'", () => {
  assert.deepEqual(calloutText(unit({}), NOW), { tier: 'far', sign: 'A-03', name: 'Pixel', kind: 'needs-you', ask: 'npm publish?', wait: '12m', waitTone: 'aging' });
  // The mid tier keeps its line and gains the clock; the ask is there for when callouts crowd (compact).
  const mid = calloutText(unit({ tier: 'mid' }), NOW);
  assert.equal(mid.line, 'Allow npm publish?');
  assert.equal(mid.ask, 'npm publish?');
  assert.equal(mid.wait, '12m');
  // Past 30 minutes it's stale.
  assert.equal(calloutText(unit({ since: NOW - 41 * MIN }), NOW).waitTone, 'stale');
  // Stuck says why; to review keeps its sign and a clock but no ask.
  const stuck = calloutText(unit({ kind: 'stuck', level: 'stuck', reason: 'Crashed', activity: undefined }), NOW);
  assert.deepEqual([stuck.ask, stuck.wait], ['Crashed', '12m']);
  const review = calloutText(unit({ kind: 'review', level: 'review', activity: undefined, since: NOW - 3 * MIN }), NOW);
  assert.deepEqual([review.sign, review.ask, review.wait, review.waitTone], ['A-03', undefined, '3m', 'fresh']);
  // A working unit from far off is still a bare tab: no clock.
  assert.deepEqual(calloutText(unit({ kind: 'working', level: 'working', activity: 'Edit a.ts' }), NOW), { tier: 'far', sign: '', name: 'Pixel', kind: 'working' });
});

test("a pod plate's lead count says its oldest wait, toned, past the first minute: '1 needs you 12m'", () => {
  const units = [
    { level: 'needs-you' as const, snoozed: false, since: NOW - 4 * MIN },
    { level: 'needs-you' as const, snoozed: false, since: NOW - 12 * MIN },
    { level: 'working' as const, snoozed: false, since: NOW - 90 * MIN },
  ];
  const segs = segments(units, NOW);
  assert.equal(countsText(segs), '2 need you 12m · 1 working');
  assert.equal(segs[0].waitTone, 'aging');
  assert.equal(countsText(segments([{ level: 'review', snoozed: false, since: NOW - 30_000 }], NOW)), '1 to review', 'under a minute says nothing');
  assert.equal(countsText(segments(units)), '2 need you · 1 working', 'without the time, no wait');
  // A change of tone alone draws the label again.
  const at = (ms: number) => podLabel('A', undefined, [{ level: 'stuck', snoozed: false, since: NOW - ms }], NOW).key;
  assert.notEqual(at(4 * MIN + 59_000), at(5 * MIN));
});

test('a head mark holds its size on screen once you are near: it never fills the view as N lands you beside the unit', async () => {
  const { MARK_FULL_AT, markScale } = await import('../src/client/features/signals/logic.ts');
  assert.equal(markScale(MARK_FULL_AT), 1);
  assert.equal(markScale(20), 1);
  assert.equal(markScale(MARK_FULL_AT / 2), 0.5);
  assert.equal(markScale(0), 0.15, 'never vanishes');
  // Scaled with the distance, its size on screen stays what it is at MARK_FULL_AT.
  const px = (d: number) => (markScale(d) / d) * 1000;
  assert.ok(Math.abs(px(2.2) - px(MARK_FULL_AT)) < 1e-9);
});

test("the N chip says who N goes to first and how long they waited: 'next: Byte, 12m'", async () => {
  const { nextWord } = await import('../src/client/features/bottombar/nextword.ts');
  const r = (name: string, level: 'needs-you' | 'review' | 'working', since: number) => ({ entry: { id: name, name } as never, att: { level, label: '', action: 'answer', since, snoozed: false } as never });
  assert.deepEqual(nextWord([], NOW), { who: 'next agent' });
  assert.deepEqual(nextWord([r('Pixel', 'review', NOW - 41 * MIN), r('Byte', 'needs-you', NOW - 12 * MIN)], NOW), { who: 'next: Byte,', wait: '12m', tone: 'aging' });
  assert.deepEqual(nextWord([r('Sprocket', 'working', NOW - 90 * MIN)], NOW), { who: 'next agent' }, 'nobody waits: no name');
});

test('a pod that clears one (answered, merged) gets a calm rim glow, never on a new wait, a snooze or a departure', async () => {
  const { CLEARED_MS, beats, cleared, clearedGlow } = await import('../src/client/features/pods/label.ts');
  const { paintRim } = await import('../src/client/features/pods/draw.ts');
  const { DECK } = await import('../src/client/world/office/materials.ts');
  type L = 'needs-you' | 'review' | 'working' | 'parked';
  const u = (id: string, level: L, o: { snoozed?: boolean; action?: 'send-home' } = {}) => ({ id, level, snoozed: !!o.snoozed, action: o.action });
  const was = beats([u('a', 'needs-you'), u('b', 'review'), u('c', 'working')]);
  assert.equal(cleared(was, beats([u('a', 'working'), u('b', 'review'), u('c', 'working')])), true, 'answered');
  assert.equal(cleared(was, beats([u('a', 'needs-you'), u('b', 'review', { action: 'send-home' }), u('c', 'working')])), true, 'merged');
  assert.equal(cleared(was, beats([u('a', 'needs-you', { snoozed: true }), u('b', 'review'), u('c', 'working')])), false, 'a snooze is no win');
  assert.equal(cleared(was, beats([u('b', 'review'), u('c', 'working')])), false, 'nor a departure');
  assert.equal(cleared(was, beats([u('a', 'parked'), u('b', 'review'), u('c', 'working')])), false, 'nor standing one down');
  assert.equal(cleared(undefined, was), false);
  assert.equal(CLEARED_MS, 900);
  assert.equal(clearedGlow(0), 1);
  assert.equal(clearedGlow(100), 1, 'full strength for the first beat');
  assert.ok(clearedGlow(450) > 0 && clearedGlow(450) < 1);
  assert.ok(clearedGlow(450) > clearedGlow(700), 'eases out');
  assert.equal(clearedGlow(CLEARED_MS), 0);
  assert.equal(clearedGlow(-Infinity), 0);
  assert.equal(clearedGlow(Number.NaN), 0);
  // In the merged hue, not orange (orange only ever means someone needs you).
  const calls: string[] = [];
  const g = new Proxy({} as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => calls.push(String(k))), set: (t, k, v) => ((t[k as string] = v), true) });
  paintRim(g as unknown as CanvasRenderingContext2D, 100, 40, 0.5);
  assert.equal((g as { strokeStyle?: string }).strokeStyle, DECK.proof);
  assert.notEqual(DECK.proof, DECK.signal);
  assert.ok(calls.includes('stroke'));
});

test('a late clock gets heavier and underlined, never another state colour', async () => {
  const { WAIT_WEIGHT } = await import('../src/shared/wait.ts');
  const { fillWait } = await import('../src/client/ui/waitink.ts');
  assert.ok(WAIT_WEIGHT.fresh < WAIT_WEIGHT.aging && WAIT_WEIGHT.aging < WAIT_WEIGHT.stale);
  const draw = (tone: 'fresh' | 'aging' | 'stale') => {
    const calls: string[] = [];
    const g = { textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', fillText: () => calls.push('text'), fillRect: () => calls.push('bar'), measureText: () => ({ width: 30 }) };
    fillWait(g as unknown as CanvasRenderingContext2D, '42m', 0, 20, tone, '#abc', 20);
    return { calls, color: g.fillStyle };
  };
  assert.deepEqual(draw('aging').calls, ['text']);
  assert.deepEqual(draw('stale').calls, ['text', 'bar'], 'stale is underlined');
  assert.equal(draw('stale').color, '#abc', 'in the row own ink');
});

test('the first in line keeps the whole choice it asks; the rest stay short', async () => {
  const { LEAD_MAX } = await import('../src/client/features/workers/lod.ts');
  const ask = { activity: 'Update the snapshot or fix the selector?', level: 'needs-you' as const };
  assert.equal(shortAsk(ask, LEAD_MAX), 'Update the snapshot or fix the selector?');
  assert.ok(shortAsk(ask)!.length <= FAR_MAX);
});

test('the memory of what each clock showed lets go of units that have gone', async () => {
  const { forgetClocks, shown } = await import('../src/client/ui/waitclock.ts');
  shown.set('rail:gone', '3m');
  shown.set('rail:here', '3m');
  shown.set('mc:review:42', '3m');
  forgetClocks((id) => id === 'here');
  assert.equal(shown.has('rail:gone'), false);
  assert.equal(shown.has('rail:here'), true);
  assert.equal(shown.has('mc:review:42'), true, 'a review item key is not a unit');
});
