import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dayOf, LAUNCH_DIR, loadData, sync } from '../launch/tools/calendar.js';
import { kitFiles, launchDocs, lintFile, NOT_KITS } from '../launch/tools/lint.js';
import { Docs } from '../src/server/docs.js';
import { resolveDocLink } from '../src/shared/docs.js';

// The real kits in launch/, checked the way a submission would fail: a stale calendar, a field over
// its limit, a broken link, a deadline in the calendar that its kit never mentions.

const REPO = path.resolve(LAUNCH_DIR, '..');
const read = (file: string) => readFileSync(path.join(LAUNCH_DIR, file), 'utf8');

test('every kit, the README, the disclosure and the templates pass the linter', () => {
  const docs = launchDocs();
  assert.ok(docs.length >= 13, `found ${docs.length}`);
  const problems = docs.flatMap((f) => lintFile(f, read(f)).map((i) => `${f}:${i.line}: ${i.message}`));
  assert.deepEqual(problems, []);
});

test('calendar.ics and the README timeline are what deadlines.json generates', () => {
  assert.deepEqual(sync(LAUNCH_DIR, true), [], 'run: npx tsx launch/tools/calendar.ts');
});

test('the calendar has one event per entry, each with the fields calendar apps need', () => {
  const ics = read('calendar.ics');
  const events = ics.replace(/\r\n /g, '').split('BEGIN:VEVENT').slice(1);
  const data = loadData();
  assert.equal(events.length, data.events.length);
  const uids = events.map((e) => /\r\nUID:([^\r]+)/.exec(e)?.[1]);
  assert.equal(new Set(uids).size, uids.length);
  for (const e of events) for (const key of ['DTSTAMP:', 'DTSTART', 'DTEND', 'SUMMARY:']) assert.ok(e.includes(`\r\n${key}`), `${key} in ${e.slice(0, 80)}`);
});

test('every entry points at a kit that exists and names its date; every kit has an entry', () => {
  const data = loadData();
  const kits = new Set(kitFiles());
  for (const e of data.events) {
    assert.ok(existsSync(path.join(LAUNCH_DIR, e.kit)), `${e.id}: ${e.kit}`);
    if (e.kind === 'deadline' || e.kind === 'result') assert.ok(read(e.kit).includes(dayOf(e)), `${e.kit} never mentions ${e.id} on ${dayOf(e)}`);
  }
  // Sponsors and the rolling grants have tasks rather than deadlines, but still a date.
  for (const kit of kits) assert.ok(data.events.some((e) => e.kit === kit), `no calendar entry for ${kit}`);
  assert.ok(data.events.some((e) => e.kit === 'disclosure.md'));
});

test('every deadline shows its time zone in its kit', () => {
  for (const e of loadData().events.filter((x) => x.kind === 'deadline' && x.at)) {
    const time = e.at!.slice(11, 16);
    const kit = read(e.kit);
    assert.ok(kit.includes(time), `${e.kit} does not state ${time}`);
    assert.ok(/UTC[+-]\d/.test(kit), `${e.kit} does not give a UTC offset`);
  }
});

test('the upstream credit is in every kit', () => {
  for (const kit of kitFiles()) {
    const text = read(kit);
    assert.ok(text.includes('webdevcody'), `${kit} does not credit webdevcody`);
    assert.ok(/MIT/.test(text), `${kit} does not mention the MIT license`);
  }
});

test('relative links in the launch docs resolve to files in the repo', () => {
  for (const doc of launchDocs()) {
    const rel = `launch/${doc}`;
    for (const m of read(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^https:\/\//.test(href)) continue;
      assert.ok(!/^http:/.test(href), `${rel}: insecure link ${href}`);
      const target = resolveDocLink(rel, href);
      assert.ok(target, `${rel}: unresolvable link ${href}`);
      assert.ok(existsSync(path.join(REPO, target.path)), `${rel}: broken link ${href}`);
    }
  }
});

test('the office bookshelf lists the kits with their titles, so they can be read inside the office', async () => {
  const { files } = await new Docs(REPO).list();
  const shelf = new Map(files.map((f) => [f.path, f.title]));
  assert.equal(shelf.get('launch/README.md'), 'Launch kits');
  assert.equal(shelf.get('launch/meta-vr-start.md'), 'Meta VR Start Developer Competition 2026');
  for (const kit of kitFiles()) assert.ok(shelf.get(`launch/${kit}`), `${kit} missing from the shelf or untitled`);
  assert.ok(NOT_KITS.has('README.md'));
});
