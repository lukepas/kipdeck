// Anonymous usage numbers (src/server/telemetry.ts): off unless turned on, nothing recorded while off,
// never on where DO_NOT_TRACK (or the like) says so, only minutes and a random id in what's recorded,
// and sent only to an address someone set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Telemetry, telemetryForbidden } from '../src/server/telemetry.js';
import type { RosterEntry, ShipRecord } from '../src/shared/protocol.js';

const MIN = 60_000;
const T0 = new Date(2026, 9, 7, 9, 0, 0).getTime();
const dir = () => mkdtempSync(path.join(tmpdir(), 'telemetry-'));

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'secret-project', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', provider: 'claude', status: 'working', acked: true, createdAt: T0, tasked: true, workingSince: T0, activity: 'reading private/keys.txt', ...over };
}
const merged = { id: 'r1', at: T0, kind: 'merged', floor: 'f1', project: 'secret-project', workerId: 'w1', agent: 'Mochi', reviewer: 'Ada', task: 'Rotate the private key' } as ShipRecord;

test('off as it ships: nothing recorded, nothing sent, however much happens', () => {
  let now = T0;
  const d = dir();
  const t = new Telemetry(d, { now: () => now, endpoint: 'https://telemetry.example/v1' });
  assert.equal(t.on, false);
  now += 5 * MIN;
  t.sweep([entry({ status: 'needs_input', waitingSince: now })], []);
  now += 5 * MIN;
  t.sweep([entry()], [merged]);
  assert.deepEqual(t.pending(), []);
  assert.equal(existsSync(path.join(d, 'telemetry-outbox.jsonl')), false);
  assert.deepEqual(t.state(), { on: false, allowed: true });
});

test('DO_NOT_TRACK, MERGELINE_TELEMETRY=0 and --no-telemetry keep it off, even against --telemetry', () => {
  assert.match(telemetryForbidden({ DO_NOT_TRACK: '1' }, []) ?? '', /DO_NOT_TRACK/);
  assert.match(telemetryForbidden({ MERGELINE_TELEMETRY: '0' }, []) ?? '', /MERGELINE_TELEMETRY=0/);
  assert.match(telemetryForbidden({}, ['--no-telemetry']) ?? '', /--no-telemetry/);
  assert.equal(telemetryForbidden({ DO_NOT_TRACK: '0' }, []), undefined);
  const t = new Telemetry(dir(), { forbidden: 'DO_NOT_TRACK is set', forced: true });
  assert.equal(t.on, false);
  assert.match(t.set(true, 'Ada') ?? '', /can't be turned on here: DO_NOT_TRACK/);
  assert.deepEqual(t.state(), { on: false, allowed: false, why: 'DO_NOT_TRACK is set' });
});

test('on: the first agent, answer and merge once each, and every wait in Needs you, in minutes and nothing else', () => {
  let now = T0;
  const t = new Telemetry(dir(), { now: () => now });
  assert.equal(t.set(true, 'Ada'), undefined);
  now += 3 * MIN;
  t.sweep([entry()], []);
  now += 1 * MIN;
  t.sweep([entry({ status: 'needs_input', waitingSince: now })], []);
  now += 12 * MIN;
  t.sweep([entry({ status: 'needs_input', waitingSince: now - 12 * MIN })], []);
  // Answered: back at work.
  t.sweep([entry()], []);
  now += 2 * MIN;
  t.sweep([entry()], [merged]);
  t.sweep([entry()], [merged]);
  // Stopped while it waited: not an answer, not a wait.
  t.sweep([entry({ id: 'w2', status: 'needs_input', waitingSince: now })], []);
  t.sweep([], []);
  const got = t.pending();
  assert.deepEqual(
    got.map((r) => [r.event, r.minutes]),
    [
      ['first_agent', 3],
      ['wait', 12],
      ['first_answer', 16],
      ['first_merge', 18],
    ],
  );
  for (const r of got) {
    assert.deepEqual(Object.keys(r).sort(), ['day', 'event', 'id', 'minutes', 'os', 'v', 'version']);
    assert.match(r.id, /^[0-9a-f]{16}$/);
    assert.equal(r.day, new Date(T0).toISOString().slice(0, 10));
  }
  const raw = JSON.stringify(got);
  for (const secret of ['secret-project', 'Mochi', 'Ada', 'private', 'Rotate']) assert.ok(!raw.includes(secret), `no ${secret} in what's recorded`);
});

test('off again forgets the id and empties the outbox; on again is a new id', () => {
  const d = dir();
  const t = new Telemetry(d);
  t.set(true, 'Ada');
  t.sweep([entry()], []);
  const first = t.pending()[0].id;
  t.set(false, 'Ada');
  assert.deepEqual(t.pending(), []);
  assert.equal(JSON.parse(readFileSync(path.join(d, 'telemetry.json'), 'utf8')).id, undefined);
  t.set(true, 'Ada');
  t.sweep([entry()], []);
  assert.notEqual(t.pending()[0].id, first);
  // It remembers being on across a restart, and --telemetry turns it on.
  assert.equal(new Telemetry(d).on, true);
  assert.equal(new Telemetry(dir(), { forced: true }).on, true);
});

test('sent only to the address someone set, and what was sent leaves the outbox', async () => {
  const got: unknown[] = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      got.push(JSON.parse(body));
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  try {
    const t = new Telemetry(dir(), { endpoint: `http://127.0.0.1:${port}/v1`, guard: { allow: () => true } });
    t.set(true, 'Ada');
    t.sweep([entry()], []);
    await t.flush();
    assert.equal(got.length, 1);
    assert.deepEqual((got[0] as { events: { event: string }[] }).events.map((e) => e.event), ['first_agent']);
    assert.deepEqual(t.pending(), []);
  } finally {
    srv.close();
  }
});
