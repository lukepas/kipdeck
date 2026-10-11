// The inbox's first sight with every lab off: the empty pane shows the work (shared/empty-pane.ts),
// never the deck plan or the chain; Ctrl+K matches a label before a hint (home/palette-match.ts); the
// Deck is a row in the avatar menu, not a pill in the top bar; and Proof of Merge's surfaces wait
// until it is on and set up (shared/proof-ready.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { rankRoster } from '../src/shared/attention.js';
import { buildInbox } from '../src/shared/inbox.js';
import { emptyPane, moreWords, SHIPPED_SHOWN } from '../src/shared/empty-pane.js';
import { defaultLabs } from '../src/shared/labs.js';
import { proofReady } from '../src/shared/proof-ready.js';
import { matchCommands } from '../src/client/home/palette-match.js';
import type { RosterEntry, ShipRecord } from '../src/shared/protocol.js';

const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();
const MIN = 60_000;
const root = path.join(import.meta.dirname, '..');
const src = (f: string) => readFileSync(path.join(root, f), 'utf8');

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', provider: 'claude', status: 'working', acked: true, createdAt: NOW - 60 * MIN, tasked: true, workingSince: NOW - 2 * MIN, ...over };
}

function merged(i: number, at: number): ShipRecord {
  return { id: `s${i}`, at, kind: 'merged', floor: 'f1', project: 'api', workerId: `w${i}`, agent: 'Mochi', reviewer: 'Ana', task: `Task ${i}` } as ShipRecord;
}

const view = (roster: RosterEntry[]) => buildInbox(rankRoster(roster, NOW));

test('the empty pane names the oldest that needs you, how long it waited and how many more wait', () => {
  const roster = [
    entry({ id: 'a', status: 'needs_input', waitingSince: NOW - 3 * MIN }),
    entry({ id: 'b', status: 'needs_input', waitingSince: NOW - 9 * MIN }),
    entry({ id: 'c', status: 'done', acked: false, waitingSince: NOW - 20 * MIN }),
    entry({ id: 'd' }),
  ];
  const pane = emptyPane(view(roster), [], NOW, true);
  assert.equal(pane.kind, 'next');
  if (pane.kind !== 'next') return;
  assert.equal(pane.next.entry.id, 'b', 'the oldest wait first');
  assert.equal(pane.section, 'needs-you');
  assert.equal(pane.waitedMs, 9 * MIN);
  assert.equal(pane.more, 2, 'the other question and the review');
  assert.equal(pane.working, 1);
  assert.equal(moreWords(pane.more), 'Then 2 more waiting on you.');
  assert.equal(moreWords(0), '');
});

test('with nobody asking, the empty pane names the next change to review', () => {
  const pane = emptyPane(view([entry({ id: 'c', status: 'done', acked: false, waitingSince: NOW - 4 * MIN })]), [], NOW, true);
  assert.equal(pane.kind, 'next');
  if (pane.kind === 'next') {
    assert.equal(pane.section, 'review');
    assert.equal(pane.more, 0);
  }
});

test("with nobody waiting it is All clear with today's merges, newest first and at most five", () => {
  const records = [...Array.from({ length: 7 }, (_, i) => merged(i, NOW - (i + 1) * MIN)), merged(99, NOW - 30 * 60 * MIN), { ...merged(50, NOW - MIN), kind: 'sent-back' } as ShipRecord];
  const pane = emptyPane(view([entry()]), records, NOW, true);
  assert.equal(pane.kind, 'clear');
  if (pane.kind !== 'clear') return;
  assert.equal(pane.total, 7, "yesterday's merge and the send-back don't count");
  assert.equal(pane.shipped.length, SHIPPED_SHOWN);
  assert.deepEqual(pane.shipped.map((r) => r.task), ['Task 0', 'Task 1', 'Task 2', 'Task 3', 'Task 4']);
  assert.match(pane.line, /^7 merged/);
  assert.equal(pane.working, 1);
  const quiet = emptyPane(view([entry()]), [], NOW, true);
  assert.equal(quiet.kind === 'clear' && quiet.shipped.length, 0);
});

test('before the first agent the preview has the pane', () => {
  assert.deepEqual(emptyPane(view([]), [], NOW, false), { kind: 'start' });
});

test('the empty pane is the work: no deck plan or chain words unless the Deck lab is on', () => {
  const empty = src('src/client/home/empty.ts');
  const pane = src('src/client/home/pane.ts');
  assert.doesNotMatch(empty + pane, /ESCROW|ERC-8004/);
  // The plan is only loaded with the Deck lab on, after the work, and its Proof corner only once Proof of Merge is set up.
  assert.match(empty, /if \(!store\.lab\('bridge'\)\) \{\s*dropPlan\(\);\s*return null;/);
  assert.match(empty, /const proof = proofReady\(\);/);
  assert.match(src('src/client/lite-plot.ts'), /proof: proofReady\(\)/);
  assert.match(pane, /const next = emptyState\(actions\);[\s\S]*void placeDeckPlan\(empty\)/);
  // A rebuilt plan (Proof of Merge set up since) replaces the old one and stops its painting.
  assert.match(empty, /for \(const old of box\.querySelectorAll\('\.lite-plot'\)\) if \(old !== el\) old\.remove\(\);/);
  assert.match(src('src/client/lite-plot.ts'), /stop: \(\) => \{\s*clearInterval\(timer\);\s*for \(const off of offs\) off\(\);/);
});

test('the palette matches labels before hints: "labs" finds Labs before Rundown', () => {
  const items = [
    { label: 'Deploy agent', hint: 'N' },
    { label: 'Rundown', hint: "Labs: a project's parts" },
    { label: 'Task queue', hint: 'Labs: issues and tasks' },
    { label: 'Labs', hint: 'Switch on the Deck' },
    { label: 'Collaborators', hint: 'Who' },
  ];
  assert.deepEqual(matchCommands(items, 'labs').map((c) => c.label), ['Labs', 'Rundown', 'Task queue']);
  // A label that starts with the words beats one that only has them inside; otherwise the list's order.
  assert.deepEqual(matchCommands(items, 'la').map((c) => c.label), ['Labs', 'Collaborators', 'Rundown', 'Task queue']);
  assert.deepEqual(matchCommands(items, '  ').map((c) => c.label), items.map((c) => c.label));
  assert.deepEqual(matchCommands(items, 'DEPLOY').map((c) => c.label), ['Deploy agent']);
  assert.deepEqual(matchCommands(items, 'zzz'), []);
});

test('core items come first in the palette and the avatar menu, and Labs last', () => {
  const index = src('src/client/home/index.ts');
  const commands = index.slice(index.indexOf('const commands = (): Command[] => ['), index.indexOf('const palette = () =>'));
  const order = (text: string, words: string[]) => words.map((w) => text.indexOf(w));
  const inPalette = order(commands, ["label: 'Deploy agent'", "label: 'Numbers'", "label: 'Settings'", "label: 'Help and keys'", "label: 'Rundown'", '...deckCommands()', "label: 'Labs'"]);
  assert.ok(inPalette.every((at) => at >= 0), JSON.stringify(inPalette));
  assert.deepEqual([...inPalette].sort((a, b) => a - b), inPalette, 'core, then the labs, then Labs');
  const menu = index.slice(index.indexOf('const entries: MenuEntry[] = ['), index.indexOf('toggleMenu(avatar'));
  const inMenu = order(menu, ["label: 'Numbers'", "label: 'Signal'", "label: 'Settings'", "label: 'Help and keys'", "label: 'Sign out'", "{ group: 'Labs' }", '...boards', 'deckMenuEntry()', "label: 'Labs'"]);
  assert.ok(inMenu.every((at) => at >= 0), JSON.stringify(inMenu));
  assert.deepEqual([...inMenu].sort((a, b) => a - b), inMenu);
});

test('Enter the Deck is not in the top bar or over the list: only the menu, the palette and D', () => {
  const html = src('src/client/index.html');
  assert.doesNotMatch(html, /deck-cta|to-deck|Enter the Deck/);
  assert.match(src('src/client/home/deck-link.ts'), /label: 'Enter the Deck'/);
});

test('the Signal chip waits for a goal', () => {
  assert.match(src('src/client/home/signal.ts'), /const hide = !v \|\| v\.signal\.level === 'no-goal'/);
});

test('Proof of Merge shows only once it is on and set up', () => {
  const labsOn = { on: { ...defaultLabs(), proof: true }, forced: [] };
  const bounties = { f1: { enabled: true, network: 'mock', items: [], blink: false } };
  assert.equal(proofReady({ labs: undefined, bounties, reputation: undefined }), false, 'nothing heard yet');
  assert.equal(proofReady({ labs: { on: defaultLabs(), forced: [] }, bounties, reputation: undefined }), false, 'lab off, as it ships');
  assert.equal(proofReady({ labs: labsOn, bounties: {}, reputation: undefined }), false, 'on but not set up');
  assert.equal(proofReady({ labs: labsOn, bounties: { f1: { ...bounties.f1, enabled: false } }, reputation: undefined }), false, 'bounties switched off');
  assert.equal(proofReady({ labs: labsOn, bounties, reputation: undefined }), true, 'bounties on');
  assert.equal(proofReady({ labs: labsOn, bounties: {}, reputation: { enabled: true, agents: [], harnesses: [], owed: 0 } }), true, '--reputation');
  assert.equal(proofReady({ labs: { ...labsOn, forced: ['proof'] }, bounties: {}, reputation: undefined }), true, 'a chain flag holds it on');
  // The Deck's corner, its ledger row and the payout counter all ask the same rule.
  assert.match(src('src/client/features/proofcorner/index.ts'), /proof\.setShown\(proofReady\(\)\)/);
  assert.match(src('src/client/features/hud/index.ts'), /id: 'ledger',[^\n]*lab: 'proof', shown: proofReady/);
  assert.match(src('src/client/ui/counters.ts'), /const shown = proofReady\(\) && !!proof\.network;/);
});
