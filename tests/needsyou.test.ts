import test from 'node:test';
import assert from 'node:assert/strict';
import { bannerText, Fresh, needingYou, Reminders, REMIND_EVERY, waitKey } from '../src/client/features/needsyou/logic.js';
import { rankRoster } from '../src/shared/attention.js';
import type { RosterEntry, WorkerStatus } from '../src/shared/protocol.js';

const NOW = 10 * 60 * 60_000;

function entry(id: string, status: WorkerStatus, more: Partial<RosterEntry> = {}): RosterEntry {
  return { id, floor: 'f1', floorName: 'Main', deskId: `desk-${id}`, name: id, color: '#fff', kind: 'agent', status, acked: false, createdAt: NOW - 60 * 60_000, tasked: true, activityAt: NOW, ...more };
}

const ranked = (...entries: RosterEntry[]) => rankRoster(entries, NOW);
const viewers = (...who: string[]) => ({ viewers: who });

test('who needs you is the ranking\'s needs-you level, longest first, without the snoozed ones or a lost worktree', () => {
  const asking = needingYou(
    ranked(
      entry('late', 'needs_input', { waitingSince: NOW - 60_000 }),
      entry('early', 'needs_input', { waitingSince: NOW - 5 * 60_000 }),
      entry('snoozed', 'needs_input', { waitingSince: NOW - 9 * 60_000, snooze: { until: 'change' } }),
      entry('lost', 'needs_input', { waitingSince: NOW - 9 * 60_000, lost: true }),
      entry('done', 'done', { waitingSince: NOW - 9 * 60_000 }),
      entry('busy', 'working'),
    ),
  );
  assert.deepEqual(asking.map((e) => e.id), ['early', 'late']);
});

test('a worker that starts needing you is new; one already asking when the page first saw it is not', () => {
  const fresh = new Fresh();
  // The page comes up with one asking already: the banner shows it, but nothing rings.
  assert.deepEqual(fresh.take(ranked(entry('old', 'needs_input'), entry('busy', 'working'))), []);
  assert.deepEqual(fresh.take(ranked(entry('old', 'needs_input'), entry('busy', 'needs_input'))).map((e) => e.id), ['busy']);
  // Still asking: it rang already.
  assert.deepEqual(fresh.take(ranked(entry('old', 'needs_input'), entry('busy', 'needs_input'))), []);
  // Answered, and asks something else.
  fresh.take(ranked(entry('old', 'needs_input'), entry('busy', 'working')));
  assert.deepEqual(fresh.take(ranked(entry('old', 'needs_input'), entry('busy', 'needs_input'))).map((e) => e.id), ['busy']);
  // Finishing isn't asking, and a snoozed one asking stays quiet.
  assert.deepEqual(fresh.take(ranked(entry('old', 'done'), entry('busy', 'needs_input'))), []);
  fresh.take(ranked(entry('quiet', 'working')));
  assert.deepEqual(fresh.take(ranked(entry('quiet', 'needs_input', { snooze: { until: NOW + 60_000 } }))), []);
});

test('workers on a floor you come back to are new to the page again, so arriving rings nothing', () => {
  const fresh = new Fresh();
  fresh.take(ranked(entry('a', 'working')));
  // Off to another floor, where b works, and a starts asking meanwhile.
  fresh.take(ranked(entry('b', 'working')));
  assert.deepEqual(fresh.take(ranked(entry('a', 'needs_input'))), []);
});

test('the banner names whoever has waited longest (on your floor first), what it asks, where and for how long, and counts the rest', () => {
  const a = entry('Byte', 'needs_input', { activity: 'Wants permission: Bash: npm test', waitingSince: NOW - 4 * 60_000 });
  const b = entry('Pixel', 'needs_input', { activity: 'Which one?', waitingSince: NOW - 30_000 });
  const away = entry('Nib', 'needs_input', { floor: 'f2', floorName: 'Docs', activity: 'Which file?', waitingSince: NOW - 65 * 60_000 });
  assert.deepEqual(bannerText([a], NOW, 'f1'), { id: 'Byte', floor: 'f1', deskId: 'desk-Byte', title: 'Byte needs you', detail: 'Wants permission: Bash: npm test · 4 min', more: '', key: 'Byte|Byte needs you|Wants permission: Bash: npm test · 4 min|' });
  assert.equal(bannerText([a, b], NOW, 'f1')?.more, '+1 more');
  // In its first minute there's no time to give.
  assert.equal(bannerText([b], NOW, 'f1')?.detail, 'Which one?');
  // Someone on your floor comes before a longer wait upstairs, as N goes; with nobody here, the floor's named.
  assert.equal(bannerText([away, b], NOW, 'f1')?.id, 'Pixel');
  assert.equal(bannerText([away], NOW, 'f1')?.detail, 'Which file? · on Docs · 1 h 5 min');
  // Nothing known of what it asks: what its task says it's on, or just its name.
  assert.equal(bannerText([entry('Nib', 'needs_input', { waitingSince: NOW })], NOW, 'f1')?.detail, '');
  assert.equal(bannerText([entry('Nib', 'needs_input', { waitingSince: NOW, task: { name: 'Docs', summary: 'Writing the docs' } })], NOW, 'f1')?.detail, 'Writing the docs');
  // A long question is cut short, and its line breaks go.
  const long = bannerText([entry('Nib', 'needs_input', { waitingSince: NOW, activity: `Shall I\n${'x'.repeat(200)}` })], NOW, 'f1')!;
  assert.equal(long.detail.length, 90);
  assert.match(long.detail, /^Shall I x+…$/);
  assert.equal(bannerText([], NOW, 'f1'), null);
});

test('each wait of a worker has a key of its own, so a banner put away comes back when it asks again', () => {
  assert.notEqual(waitKey(entry('a', 'needs_input', { waitingSince: 100 })), waitKey(entry('a', 'needs_input', { waitingSince: 200 })));
  assert.equal(waitKey(entry('a', 'needs_input', { waitingSince: 100 })), waitKey(entry('a', 'needs_input', { waitingSince: 100, activity: 'other' })));
});

test('the reminder rings every half minute while someone asks with nobody at its terminal', () => {
  const r = new Reminders();
  const asking = [viewers()];
  // The alarm rang as it started asking.
  r.rang(1_000);
  assert.equal(r.due(asking, 2_000), false);
  assert.equal(r.due(asking, 1_000 + REMIND_EVERY - 1), false);
  assert.equal(r.due(asking, 1_000 + REMIND_EVERY), true);
  // Once per wait, not on every look after it.
  assert.equal(r.due(asking, 1_000 + REMIND_EVERY + 1_000), false);
  assert.equal(r.due(asking, 1_000 + 2 * REMIND_EVERY), true);
});

test('no reminder while someone has its terminal open, or with nobody asking; the wait starts over after', () => {
  const r = new Reminders();
  r.rang(0);
  const watched = [viewers('you')];
  assert.equal(r.due(watched, REMIND_EVERY * 3), false);
  assert.equal(r.due([], REMIND_EVERY * 3), false);
  // They close it without answering: a whole wait from there before it rings.
  const asking = [viewers()];
  assert.equal(r.due(asking, REMIND_EVERY * 3 + 1_000), false);
  assert.equal(r.due(asking, REMIND_EVERY * 4), false);
  assert.equal(r.due(asking, REMIND_EVERY * 4 + 1_000), true);
  // One of two is being answered: the other still wants a reminder.
  assert.equal(r.due([...watched, viewers()], REMIND_EVERY * 5 + 1_000), true);
});

test('arriving on a floor where someone is asking starts its wait over, however long ago the alarm last rang', () => {
  const r = new Reminders();
  r.rang(0);
  r.quiet();
  const asking = [viewers()];
  assert.equal(r.due(asking, REMIND_EVERY * 10), false);
  assert.equal(r.due(asking, REMIND_EVERY * 11 - 1), false);
  assert.equal(r.due(asking, REMIND_EVERY * 11), true);
});

test('a page that comes up with someone asking already waits a whole turn before the first reminder', () => {
  const r = new Reminders();
  const asking = [viewers()];
  assert.equal(r.due(asking, 500_000), false);
  assert.equal(r.due(asking, 500_000 + REMIND_EVERY - 1), false);
  assert.equal(r.due(asking, 500_000 + REMIND_EVERY), true);
});

test('the banner is the one needs-you signal that stays up, and nothing on screen keeps pulsing for it', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/client/features/needsyou/ui.css', import.meta.url), 'utf8');
  // The banner comes in once; the chip and the N button only change tone (styles/hud.css, the mission chip's own).
  assert.doesNotMatch(css, /infinite/);
  assert.doesNotMatch(css, /data-action=mission|#waiting/);
  const floorwatch = readFileSync(new URL('../src/client/core/floorwatch.ts', import.meta.url), 'utf8');
  // Another floor's worker is on the banner already: no toast or ding of the elevator's as well.
  assert.doesNotMatch(floorwatch, /toast\(|ding\(/);
});
