// VESPER, the ship's mind (src/shared/shipvoice.ts): the same event gives every viewer the same line,
// the line fits what is true around it, plain mode keeps to status, attention stops the wit at once,
// and the gate keeps the pace (one line in 90 s, never two in a row about one unit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIET_MARKS, VOICE_GAP_MS, VOICE_STALE_MS, VoiceGate, attentionLine, mergeContext, pick, voiceHash, type VoiceKind } from '../src/shared/shipvoice.js';
import type { TimelineEvent } from '../src/shared/protocol.js';

const NOW = new Date(2026, 9, 5, 14, 0).getTime();
const MIN = 60_000;
let n = 0;
const ev = (over: Partial<TimelineEvent>): TimelineEvent => ({ id: `e${n++}`, at: NOW, kind: 'pr-merged', floor: 'f1', text: '', ...over });

test('the same event picks the same line in every browser, and different events vary', () => {
  const a = pick('merged', { unit: 'B-03', pr: 12 }, 'evt-1');
  const b = pick('merged', { unit: 'B-03', pr: 12 }, 'evt-1');
  assert.deepEqual(a, b);
  const seen = new Set(Array.from({ length: 40 }, (_, i) => pick('merged', { unit: 'B-03', pr: 12 }, `evt-${i}`).text));
  assert.ok(seen.size >= 3, 'more than one way to say it');
  assert.equal(voiceHash('x'), voiceHash('x'));
  assert.notEqual(voiceHash('x'), voiceHash('y'));
});

test('the line fits the moment: a burst, a comeback, a round number, the first of the day', () => {
  assert.match(pick('merged', { unit: 'A-01', mergesThisHour: 3 }, 's').text, /^3 merges/);
  assert.match(pick('merged', { unit: 'A-01', comeback: true, pr: 4 }, 's').text, /A-01|stuck/);
  assert.match(pick('merged', { unit: 'A-01', nth: 10 }, 's').text, /10th/);
  assert.match(pick('merged', { unit: 'A-01', firstOfDay: true, nth: 2 }, 's').text, /[Ff]irst merge|first merge|day/);
  assert.match(pick('milestone-done', { title: 'Auth rewrite' }, 'w').text, /[Ww]aypoint|Auth rewrite/);
  assert.match(pick('quiet', { quietMin: 40 }, 'q').text, /40/);
  assert.match(pick('hired', { unit: 'B-02', name: 'Widget', chevrons: 3 }, 'h').text, /^Widget \(B-02\) reporting, 3 chevrons/);
});

test('Plain only says the status and nothing more', () => {
  assert.equal(pick('merged', { unit: 'B-03', pr: 12, mergesThisHour: 5 }, 's', 'plain').text, 'B-03 merged PR #12.');
  assert.equal(pick('milestone-done', { title: 'Auth' }, 's', 'plain').text, 'Waypoint Auth reached.');
  assert.equal(pick('hired', { unit: 'B-02', name: 'Widget', chevrons: 1 }, 's', 'plain').text, 'Widget (B-02) reporting, 1 chevron.');
  assert.equal(pick('hired', { unit: 'B-02', name: 'Widget' }, 's', 'plain').text, 'Widget (B-02) reporting.');
});

test('every line is calm ASCII: no exclamation marks, no braces left unfilled, no war words', () => {
  const kinds: VoiceKind[] = ['merged', 'milestone-done', 'mission', 'bounty-paid', 'merge-attested', 'hired', 'recovered', 'all-clear', 'quiet'];
  const contexts = [{}, { unit: 'C-01', name: 'Dot', pr: 7, title: 'Ship it', mergesThisHour: 4, nth: 25, firstOfDay: true, streak: 6, comeback: true, quietMin: 120, hour: 23, chevrons: 2 }, { hour: 2, streak: 5 }, { nth: 5 }];
  for (const kind of kinds)
    for (const c of contexts)
      for (let i = 0; i < 30; i++)
        for (const mode of ['on', 'plain'] as const) {
          const t = pick(kind, c, `seed-${i}`, mode).text;
          assert.ok(/^[\x20-\x7e]+$/.test(t), `ASCII: ${t}`);
          assert.ok(!t.includes('!') && !/[{}]/.test(t), t);
          assert.ok(!/\b(war|attack|kill|battle|enemy|fire|destroy|weapon|strike|troops?)\b/i.test(t), t);
        }
});

test('attention gets one plain sentence, whatever the label says', () => {
  assert.equal(attentionLine('B-03', 'stuck', 'Tests or build failing').text, 'B-03 is stuck: tests or build failing. It needs you.');
  // A permission wait says so, and what for, rather than "waiting on your answer".
  assert.equal(attentionLine('A-02', 'needs-you', 'Wants permission: Bash').text, 'A-02 wants permission: Bash. It needs you.');
  assert.equal(attentionLine('A-02', 'needs-you', 'Needs an answer').text, 'A-02 is waiting on your answer. It needs you.');
  assert.ok(attentionLine('A-02', 'stuck', 'x').weight > pick('milestone-done', {}, 's').weight);
});

test('the gate: one line in 90 s, never two in a row about one unit, the weightier one held', () => {
  const g = new VoiceGate();
  const line = (unit: string | undefined, weight = 1) => ({ text: `${unit} line`, unit, weight });
  assert.ok(g.offer(line('A-01'), NOW), 'the first goes');
  assert.equal(g.offer(line('B-01'), NOW + MIN), null, 'too soon: held');
  assert.equal(g.offer(line('C-01', 0), NOW + MIN), null, 'a lighter one does not take the slot');
  assert.equal(g.due(NOW + MIN), null);
  assert.equal(g.due(NOW + VOICE_GAP_MS)?.unit, 'B-01', 'the held one goes once the gap is over');
  assert.equal(g.offer(line('B-01'), NOW + 2 * VOICE_GAP_MS + 1), null, 'not twice running about B-01');
  assert.equal(g.offer(line('D-01'), NOW + 2 * VOICE_GAP_MS + 2)?.unit, 'D-01');
  // A held line goes stale.
  g.offer(line('E-01'), NOW + 2 * VOICE_GAP_MS + 3);
  assert.equal(g.due(NOW + 2 * VOICE_GAP_MS + 3 + VOICE_STALE_MS + 1), null);
});

test('attention stops the wit: one plain sentence, silence while it lasts, then one recovery line', () => {
  const g = new VoiceGate();
  g.offer({ text: 'wit', unit: 'A-01', weight: 1 }, NOW);
  const call = attentionLine('B-03', 'stuck', 'Silent');
  assert.equal(g.attention(true, NOW + 1000, call), call, 'said at once, gap or no gap');
  assert.equal(g.attention(true, NOW + 2000, attentionLine('C-01', 'stuck', 'Silent')), null, 'one sentence, not one per unit');
  assert.ok(g.silent);
  assert.equal(g.offer({ text: 'merge', unit: 'D-01', weight: 4 }, NOW + 3 * VOICE_GAP_MS), null, 'no wit while someone waits');
  assert.equal(g.due(NOW + 4 * VOICE_GAP_MS), null, 'and nothing was held');
  g.attention(false, NOW + 5 * VOICE_GAP_MS);
  assert.ok(g.offer({ text: 'back', unit: 'B-03', weight: 1 }, NOW + 5 * VOICE_GAP_MS + 1), 'the recovery line goes straight away');
  assert.equal(g.offer({ text: 'more', unit: 'E-01', weight: 1 }, NOW + 5 * VOICE_GAP_MS + 2), null, 'and then the pace again');
});

test("a merge's context comes from the log: the hour, the day's first, the streak, the unit's count and comeback", () => {
  const log = [
    ev({ id: 'm1', at: NOW - 3 * 60 * MIN, worker: 'w1' }),
    ev({ id: 's1', kind: 'stuck', at: NOW - 2 * 60 * MIN, worker: 'w2' }),
    ev({ id: 'm2', at: NOW - 50 * MIN, worker: 'w2' }),
    ev({ id: 'm3', at: NOW - 20 * MIN, worker: 'w3' }),
    ev({ id: 'other', at: NOW - 10 * MIN, floor: 'f2' }),
  ];
  const e = ev({ id: 'now', at: NOW, worker: 'w2', pr: 9 });
  const c = mergeContext(e, log);
  assert.equal(c.mergesThisHour, 3);
  assert.equal(c.firstOfDay, false);
  assert.equal(c.streak, 3, 'three merges since anyone was stuck');
  assert.equal(c.nth, 2, "w2's second merge");
  assert.equal(c.comeback, false, 'it was stuck before its first merge, not since');
  assert.equal(c.pr, 9);
  const c2 = mergeContext(ev({ id: 'x', at: NOW, worker: 'w1' }), [...log, ev({ id: 's2', kind: 'stuck', at: NOW - 5 * MIN, worker: 'w1' })]);
  assert.equal(c2.comeback, true, 'stuck since its last merge, and merged anyway');
  assert.equal(c2.streak, 1);
  const first = mergeContext(ev({ id: 'y', at: new Date(2026, 9, 6, 0, 5).getTime() }), log);
  assert.equal(first.firstOfDay, true);
  assert.deepEqual(QUIET_MARKS, [40, 120]);
});
