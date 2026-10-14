// The replay demo (docs/demo.md#the-replay-demo): the tape's pure parts (where a pass is, moving the
// recorded times to now, answering a page's requests, what it keeps following), the scrubber that keeps
// secrets and this computer's names off a published tape, and the committed tape itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Follows, REPLAY_ALSO_ANSWERS, answer, isPhone, shiftTimes, tapePosition, terminalAt, type Tape } from '../src/shared/replay.js';
import { DEMO_COMMAND, READ_ONLY_ALLOWS, READ_ONLY_QUIET, demoNote } from '../src/shared/demo.js';
import { cityOnInReplay } from '../src/client/features/replay/logic.js';
import { route } from './support/replay-host.js';
import { leaks, scrub } from '../deploy/replay/scrub.mjs';
import type { ServerMsg } from '../src/shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.UTC(2026, 9, 12, 9, 0, 0);

function tape(answers: { at: number; msg: unknown }[] = [], stream: { at: number; msg: unknown }[] = []): Tape {
  return { version: 1, recordedAt: T0, loopFrom: 1000, loopTo: 11_000, welcome: { t: 'toast', text: 'hi', level: 'info' }, whoami: {}, stream, answers } as Tape;
}

test('a page plays the tape from its start once, then loops from the first round to the second', () => {
  const t = tape();
  assert.deepEqual(tapePosition(t, 0), { pass: 0, at: 0, began: 0, start: 0 });
  assert.deepEqual(tapePosition(t, 10_999), { pass: 0, at: 10_999, began: 0, start: 0 });
  assert.deepEqual(tapePosition(t, 11_000), { pass: 1, at: 1000, began: 11_000, start: 1000 });
  assert.deepEqual(tapePosition(t, 25_000), { pass: 2, at: 5000, began: 21_000, start: 1000 });
});

test('the recorded times move to now, and nothing else does', () => {
  const t = tape();
  const msg = { since: T0 - 12 * 60_000, at: T0 + 5000, iso: new Date(T0).toISOString(), cols: 120, id: '1760259600000x', old: Date.UTC(2020, 0, 1), list: [T0], nested: { when: T0 } };
  const moved = shiftTimes(msg, 3_600_000, t);
  assert.equal(moved.since, T0 - 12 * 60_000 + 3_600_000);
  assert.equal(moved.at, T0 + 5000 + 3_600_000);
  assert.equal(moved.iso, new Date(T0 + 3_600_000).toISOString());
  assert.equal(moved.cols, 120);
  assert.equal(moved.id, msg.id);
  assert.equal(moved.old, msg.old, 'a time far from the recording is not one of its own');
  assert.deepEqual(moved.list, [T0 + 3_600_000]);
  assert.equal(moved.nested.when, T0 + 3_600_000);
  assert.equal(shiftTimes(msg, 0, t), msg);
});

test("a terminal is its last snapshot with what was written after it, as it stood at that moment", () => {
  const t = tape([
    { at: 100, msg: { t: 'term.data', workerId: 'w1', data: 'before' } },
    { at: 200, msg: { t: 'term.snapshot', workerId: 'w1', data: 'A', cols: 80, rows: 24 } },
    { at: 300, msg: { t: 'term.data', workerId: 'w1', data: 'B' } },
    { at: 350, msg: { t: 'term.data', workerId: 'w2', data: 'other' } },
    { at: 400, msg: { t: 'term.data', workerId: 'w1', data: 'C' } },
  ]);
  assert.equal(terminalAt(t, 'w1', 150), undefined);
  assert.equal(terminalAt(t, 'w1', 350)?.data, 'AB');
  assert.deepEqual(answer(t, { t: 'worker.attach', workerId: 'w1' }, 1000), [{ t: 'term.snapshot', workerId: 'w1', data: 'ABC', cols: 80, rows: 24 }]);
});

test("a page's requests are answered with the tape's latest answer for them at that moment", () => {
  const changes = (n: number) => ({ t: 'changes', state: { workerId: 'w1', dir: '', base: 'main', ahead: n, files: [], more: 0, at: T0 } });
  const t = tape([
    { at: 100, msg: changes(1) },
    { at: 150, msg: { t: 'changes.diff', workerId: 'w1', path: 'a.js', diff: 'old', truncated: false } },
    { at: 200, msg: changes(2) },
    { at: 250, msg: { t: 'changes.diff', workerId: 'w1', path: 'a.js', diff: 'new', truncated: false } },
    { at: 300, msg: { t: 'brief', brief: { workerId: 'w1', task: 'x' } } },
    { at: 400, msg: { t: 'inbox.log', records: [], key: 'k' } },
  ]);
  const one = (m: ServerMsg[]) => (assert.equal(m.length, 1), m[0] as any);
  assert.equal(one(answer(t, { t: 'changes.watch', workerId: 'w1' }, 150)).state.ahead, 1);
  assert.equal(one(answer(t, { t: 'changes.watch', workerId: 'w1' }, 210)).state.ahead, 2);
  assert.equal(one(answer(t, { t: 'changes.diff', workerId: 'w1', path: 'a.js' }, 260)).diff, 'new');
  assert.match(one(answer(t, { t: 'changes.diff', workerId: 'w1', path: 'b.js' }, 260)).error, /Not in this recording/);
  assert.deepEqual(answer(t, { t: 'brief.get', workerId: 'w1' }, 250), []);
  assert.equal(one(answer(t, { t: 'brief.get', workerId: 'w1' }, 300)).brief.task, 'x');
  assert.equal(one(answer(t, { t: 'inbox.log' }, 500)).key, 'k');
  assert.deepEqual(answer(t, { t: 'doing', what: 'x' }, 500), []);
});

test('a page keeps getting what it follows: its terminals, its changes and the states it asked for', () => {
  const f = new Follows();
  const data = { t: 'term.data', workerId: 'w1', data: 'x' } as ServerMsg;
  const changes = { t: 'changes', state: { workerId: 'w1' } } as ServerMsg;
  const spend = { t: 'spend', state: {} } as ServerMsg;
  assert.equal(f.wants(data, new Set()), false);
  f.note({ t: 'worker.attach', workerId: 'w1' });
  f.note({ t: 'changes.watch', workerId: 'w1' });
  f.note({ t: 'spend.get' });
  assert.equal(f.wants(data, new Set()), true);
  assert.equal(f.wants(changes, new Set()), true);
  assert.equal(f.wants(spend, new Set()), true);
  assert.equal(f.wants(spend, new Set(['spend'])), false, 'a state the stream carries comes through the stream');
  f.note({ t: 'worker.detach', workerId: 'w1' });
  f.note({ t: 'changes.unwatch', workerId: 'w1' });
  assert.equal(f.wants(data, new Set()), false);
  assert.equal(f.wants(changes, new Set()), false);
});

test("every request the replay answers is one the read-only demo takes", () => {
  for (const t of ['worker.attach', 'worker.worktree', 'changes.watch', 'changes.diff', 'brief.get', 'inbox.log', 'pace.get', 'timeline.get', 'team.get', 'approvals.get', 'spend.get']) assert.ok(READ_ONLY_ALLOWS.has(t), t);
});

test('beyond those, only the Deck\'s city and the Signal peek, which the hosted demo drops without a word', () => {
  assert.deepEqual([...REPLAY_ALSO_ANSWERS].sort(), ['rundown.unwatch', 'rundown.watch', 'signal.peek']);
  for (const t of REPLAY_ALSO_ANSWERS) assert.ok(READ_ONLY_QUIET.has(t) && !READ_ONLY_ALLOWS.has(t), t);
});

test("the city's rundown and Signal's gist are answered from the tape, and the watched floor's rundown keeps coming", () => {
  const state = (floor: string, generatedAt: string) => ({ t: 'rundown.state', floor, rundown: { generatedAt, parts: [] }, computing: false });
  const t = tape([
    { at: 100, msg: state('acme-shop', 'one') },
    { at: 120, msg: { t: 'signal.gist', gist: { floor: 'acme-shop', goal: null, burn: null, rundown: { source: 'inferred' } } } },
    { at: 150, msg: state('other', 'x') },
    { at: 300, msg: state('acme-shop', 'two') },
  ]);
  const one = (m: ServerMsg[]) => (assert.equal(m.length, 1), m[0] as any);
  assert.deepEqual(answer(t, { t: 'rundown.watch', floor: 'acme-shop' }, 50), [], 'nothing before the first map');
  assert.equal(one(answer(t, { t: 'rundown.watch', floor: 'acme-shop' }, 200)).rundown.generatedAt, 'one');
  assert.equal(one(answer(t, { t: 'rundown.watch', floor: 'acme-shop' }, 400)).rundown.generatedAt, 'two');
  assert.equal(one(answer(t, { t: 'signal.peek', floor: 'acme-shop' }, 400)).gist.rundown.source, 'inferred');
  assert.deepEqual(answer(t, { t: 'signal.peek', floor: 'other' }, 400), []);

  const f = new Follows();
  const later = state('acme-shop', 'two') as ServerMsg;
  assert.equal(f.wants(later, new Set()), false);
  f.note({ t: 'rundown.watch', floor: 'acme-shop' });
  assert.equal(f.wants(later, new Set()), true);
  assert.equal(f.wants(state('other', 'x') as ServerMsg, new Set()), false, 'one floor at a time');
  f.note({ t: 'rundown.unwatch' });
  assert.equal(f.wants(later, new Set()), false);
});

test('a phone is a touch screen with a short side of 640 px or less, either way up; it gets the inbox, not the Deck', () => {
  assert.equal(isPhone({ coarse: true, width: 390, height: 844 }), true);
  assert.equal(isPhone({ coarse: true, width: 844, height: 390 }), true);
  assert.equal(isPhone({ coarse: true, width: 820, height: 1180 }), false, 'a tablet');
  assert.equal(isPhone({ coarse: false, width: 500, height: 700 }), false, 'a narrow desktop window');
});

test('the city is up in the replay whatever the visitor saved, and as they left it everywhere else', () => {
  assert.equal(cityOnInReplay({ readOnly: true, replay: true, project: 'acme-shop' }, false), true);
  assert.equal(cityOnInReplay({ readOnly: true, project: 'acme-shop' }, false), false);
  assert.equal(cityOnInReplay(undefined, false), false);
  assert.equal(cityOnInReplay(undefined, true), true);
});

test('the replay host sends /deck and /bridge to the Deck in demo mode, and keeps a demo=0 the visitor chose', () => {
  const rules = JSON.parse(readFileSync(path.join(ROOT, 'deploy/replay/vercel.json'), 'utf8'));
  const at = (u: string) => route(new URL(u, 'http://x'), rules);
  assert.deepEqual(at('/deck'), { redirect: '/deck?demo=1' });
  assert.deepEqual(at('/bridge'), { redirect: '/deck?demo=1' });
  assert.deepEqual(at('/deck?demo=1'), { file: '/bridge.html' });
  assert.deepEqual(at('/deck?demo=0'), { file: '/bridge.html' });
  assert.deepEqual(at('/'), { file: '/index.html' });
  assert.deepEqual(at('/replay/tape.json'), { file: '/replay/tape.json' });
});

test("the replay's note says it's a recording with nothing live, and gives the command to run it", () => {
  const note = demoNote({ readOnly: true, replay: true, project: 'acme-shop' });
  assert.match(note.text, /recording/i);
  assert.match(note.text, /nothing runs behind this page/);
  assert.equal(note.command, DEMO_COMMAND);
  assert.match(note.short, /^Recorded/);
});

test('the scrubber turns the recording folders into the hosted demo\'s and refuses secrets and local names', () => {
  assert.equal(scrub('/tmp/x/office/acme-shop and /tmp/x', [['/tmp/x', '/home/demo'], ['/tmp/x/office', '/home/demo/office']]), '/home/demo/office/acme-shop and /home/demo');
  assert.deepEqual(leaks('{"cwd":"/home/demo/office/acme-shop"}'), []);
  const bad = [
    `token ghp_${'a'.repeat(36)}`,
    `key sk-ant-${'b'.repeat(30)}`,
    'AKIAABCDEFGHIJKLMNOP',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    '/Users/someone/code',
    '/var/folders/xy/T/kipdeck',
    '/home/alice/.config',
  ];
  for (const s of bad) assert.ok(leaks(s).length > 0, s);
  assert.deepEqual(leaks('made by jdoe', ['jdoe']).length, 1);
});

test('the committed tape loops one whole round and publishes nothing it should not', { skip: !existsSync(path.join(ROOT, 'deploy/replay/tape.json')) && 'no tape: npm run record:replay' }, () => {
  const text = readFileSync(path.join(ROOT, 'deploy/replay/tape.json'), 'utf8');
  assert.deepEqual(leaks(text), []);
  const t = JSON.parse(text) as Tape;
  assert.equal(t.version, 1);
  assert.equal(t.welcome.t, 'welcome');
  assert.ok(t.welcome.t === 'welcome' && t.welcome.demo?.readOnly, 'recorded from the read-only demo');
  assert.ok(t.loopFrom >= 0 && t.loopTo - t.loopFrom > 60_000, `a round is over a minute (${t.loopTo - t.loopFrom} ms)`);
  for (const list of [t.stream, t.answers]) for (let i = 1; i < list.length; i++) assert.ok(list[i].at >= list[i - 1].at, 'in order');
  const kinds = new Set(t.stream.map((e) => e.msg.t));
  for (const k of ['worker.update', 'inbox.record']) assert.ok(kinds.has(k as ServerMsg['t']), `the stream has ${k}`);
  const asked = new Set(t.answers.map((e) => e.msg.t));
  for (const k of ['term.snapshot', 'term.data', 'changes', 'changes.diff', 'brief', 'inbox.log']) assert.ok(asked.has(k as ServerMsg['t']), `the answers have ${k}`);
  // The question the reviewer answers and a merge, in the loop.
  const statuses = t.stream.filter((e) => e.at >= t.loopFrom && e.msg.t === 'worker.update').map((e) => (e.msg as Extract<ServerMsg, { t: 'worker.update' }>).worker.status);
  assert.ok(statuses.includes('needs_input'), 'an agent asks');
  assert.ok(t.stream.some((e) => e.at >= t.loopFrom && e.msg.t === 'inbox.record'), 'a change is merged');
  assert.ok(text.length < 3_000_000, `the tape is small enough to load fast (${text.length} bytes)`);
  // The Deck: its lab and Rundown's are on, and the city's map and Signal's gist of it are there from the loop's start.
  assert.ok(t.welcome.t === 'welcome' && t.welcome.labs?.on.bridge && t.welcome.labs.on.rundown, 'the Deck and Rundown labs are on');
  const floor = t.welcome.t === 'welcome' ? t.welcome.floor : undefined;
  const map = answer(t, { t: 'rundown.watch', floor: floor! }, t.loopFrom + 2000)[0] as Extract<ServerMsg, { t: 'rundown.state' }> | undefined;
  assert.ok(map?.rundown && map.rundown.parts.length > 0, 'the demo project has a map with parts by the loop\'s start');
  const gist = answer(t, { t: 'signal.peek', floor: floor! }, t.loopFrom + 2000)[0] as Extract<ServerMsg, { t: 'signal.gist' }> | undefined;
  assert.ok(gist?.gist.rundown, "Signal's gist reads that map");
});
