// A legible first screen: the README opens with what it is, the one command and the four sections;
// Idle says why each agent is there; the one-time section hints; and docs/voice.md names the five
// states the code has, not a "Done" state that doesn't exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attention, STATE_LABEL, type Attention } from '../src/shared/attention.js';
import { hintShown, parseHints, SECTION_HINT } from '../src/shared/hints.js';
import { ageLabel, buildInbox, idleBreakdown, idleKind, idleStatus, INBOX_SECTIONS, sectionOf } from '../src/shared/inbox.js';
import type { RosterEntry } from '../src/shared/protocol.js';
import { REPO_URL } from '../src/shared/copy.js';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const MIN = 60_000;
/** The README's one command: npx straight from the repository until the package is on npm. */
const INSTALL_COMMAND = `npx github:${new URL(REPO_URL).pathname.slice(1)}`;
const NOW = 1_800_000_000_000;

function agent(over: Partial<RosterEntry>): RosterEntry {
  return { id: 'a', kind: 'agent', floor: 'f', floorName: 'acme', status: 'idle', createdAt: NOW - 60 * MIN, tasked: true, ...over } as RosterEntry;
}

const att = (e: RosterEntry): Attention => attention(e, NOW);

test('an Idle row says why it is idle: no task, asleep, merged or snoozed', () => {
  const noTask = att(agent({ tasked: true, waitingSince: NOW - 20 * MIN }));
  const asleep = att(agent({ status: 'exited', exitCode: 0, waitingSince: NOW - 3 * 60 * MIN }));
  const merged = att(agent({ status: 'done', acked: true, pr: { number: 12, state: 'merged' } as RosterEntry['pr'], waitingSince: NOW - 20 * MIN }));
  const snoozed = att(agent({ status: 'working', workingSince: NOW - 2 * MIN, activityAt: NOW - MIN, snooze: { until: NOW + 30 * MIN, by: 'Tess', at: NOW - 5 * MIN } as RosterEntry['snooze'] }));
  for (const a of [noTask, asleep, merged, snoozed]) assert.equal(sectionOf(a), 'idle');
  assert.deepEqual([noTask, asleep, merged, snoozed].map(idleKind), ['no task', 'asleep', 'merged', 'snoozed']);
  // The row's clock leads with the reason.
  assert.equal(ageLabel('idle', noTask, NOW), 'no task 20m');
  assert.equal(ageLabel('idle', asleep, NOW), 'asleep 3h');
  assert.equal(ageLabel('idle', merged, NOW), 'merged 20m');
  assert.match(ageLabel('idle', snoozed, NOW), /^snoozed /);
  // Without the ranking (a caller that only has a time), it still says idle.
  assert.equal(ageLabel('idle', { since: NOW - 2 * 60 * MIN }, NOW), 'idle 2h');
  // The status line never just repeats "Idle" or "Asleep"; a merged PR and a snoozed agent keep the ranking's words.
  assert.equal(idleStatus(noTask, 'Idle'), 'Waiting for a task');
  assert.equal(idleStatus(asleep, 'Asleep'), 'Its session ended');
  assert.equal(idleStatus(merged, 'PR #12 merged'), 'PR #12 merged');
  assert.equal(idleStatus(snoozed, 'Working'), 'Working');
  // A never-tasked agent that's new is Idle with no task; after IDLE_NO_TASK_MS it's Stuck, not Idle.
  const fresh = att(agent({ tasked: false, createdAt: NOW - 2 * MIN }));
  assert.equal(sectionOf(fresh), 'idle');
  assert.equal(idleKind(fresh), 'no task');
});

test("the folded Idle header says what it holds, in the kinds' order, leaving out the empty ones", () => {
  const ranked = [
    agent({ id: 'a', status: 'exited', exitCode: 0 }),
    agent({ id: 'b', status: 'offline' }),
    agent({ id: 'c', status: 'done', acked: true, pr: { number: 3, state: 'merged' } as RosterEntry['pr'] }),
  ].map((entry) => ({ entry, att: attention(entry, NOW) }));
  const view = buildInbox(ranked);
  assert.equal(view.counts.idle, 3);
  assert.equal(idleBreakdown(view.sections.idle), '2 asleep, 1 merged');
  assert.equal(idleBreakdown([]), '');
});

test('the section hints: one per section, plain words, put away for good once seen, never in the demo', () => {
  assert.deepEqual(Object.keys(SECTION_HINT).sort(), [...INBOX_SECTIONS].sort());
  for (const [s, words] of Object.entries(SECTION_HINT)) {
    assert.match(words, /^[\x20-\x7e]+$/, `${s}: plain ASCII`);
    assert.doesNotMatch(words, /!/, `${s}: no exclamation mark`);
    assert.ok(words.length <= 110, `${s}: one short line`);
  }
  assert.match(SECTION_HINT.idle, /no task, asleep, merged or snoozed/);
  assert.equal(hintShown('review', 1, {}, false), true);
  assert.equal(hintShown('review', 0, {}, false), false, 'not over an empty section');
  assert.equal(hintShown('review', 1, { review: true }, false), false, 'put away');
  assert.equal(hintShown('review', 1, {}, true), false, 'the demo has its coach strip');
  assert.deepEqual(parseHints('{"review":true,"working":false,"other":true}'), { review: true });
  assert.deepEqual(parseHints('not json'), {});
  assert.deepEqual(parseHints(null), {});
  assert.deepEqual(parseHints('null'), {});
});

test('docs/voice.md names the five states the code has, and no "Done" state', () => {
  const rule = read('docs/voice.md').split('\n').find((l) => l.includes('**Status words never change**'));
  assert.ok(rule);
  for (const label of Object.values(STATE_LABEL)) assert.ok(rule.includes(label), `names ${label}`);
  assert.doesNotMatch(rule, /\bDone\b/);
});

test('the README opens in three lines: what it is, the one command, the four sections', () => {
  const lines = read('README.md').split('\n');
  const title = lines.indexOf('# Kipdeck');
  assert.ok(title >= 0);
  // The first paragraphs after the title, fences and all, up to the first picture.
  const top = lines.slice(title + 1, lines.findIndex((l, i) => i > title && l.startsWith('![')));
  const paras = top.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  assert.equal(paras.length, 3, paras.join('\n---\n'));
  assert.match(paras[0], /^The inbox for your AI coding agents\./);
  assert.equal(paras[1], '```bash\n' + INSTALL_COMMAND + '\n```');
  for (const s of ['Needs you', 'To review', 'Working', 'Idle']) assert.ok(paras[2].includes(`**${s}**`), s);
  // The picture right under them is the annotated inbox, and the file is there.
  const hero = lines.find((l, i) => i > title && l.startsWith('!['));
  assert.match(hero ?? '', /\(docs\/img\/inbox-annotated\.png\)$/);
  assert.ok(readFileSync(path.join(root, 'docs/img/inbox-annotated.png')).length > 10_000);
  // No bullet in the README's opening runs on: the longest is well under the old 170 words.
  const bullets = lines.slice(0, lines.indexOf('## Run it')).filter((l) => l.startsWith('- **'));
  for (const b of bullets) assert.ok(b.split(/\s+/).length <= 110, `${b.slice(0, 40)}... is ${b.split(/\s+/).length} words`);
});

test('the top bar keeps "Pause all" and "spent today" in words on a laptop screen', () => {
  const css = read('src/client/home/spend.css');
  const hidesAt = (sel: string) => [...css.matchAll(/@media \(max-width: (\d+)px\) \{([^}]*\}[^}]*)\}/g)].filter((m) => m[2].includes(sel) && /display: none/.test(m[2])).map((m) => Number(m[1]));
  for (const sel of ['.hb-fleet-label', '.hb-pulse .p-spend span']) {
    const widths = hidesAt(sel);
    assert.ok(widths.length > 0, sel);
    assert.ok(Math.max(...widths) <= 1240, `${sel} is hidden up to ${Math.max(...widths)}px`);
  }
  assert.match(read('src/client/home/spend.ts'), /'aria-label': 'Pause all'/, 'the mark alone still has a name');
});
