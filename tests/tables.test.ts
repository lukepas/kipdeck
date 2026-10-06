// The deck's tables (features/boards/table.ts) and what the panels put in them: the Proof corner's
// ledger, the Review bay's board and door, the planning board and the docs rack's index. A table's
// columns share its width and every cell stays inside its column; rows that don't fit are counted in
// "+N more"; each panel's rows come out in the order that puts what needs a person first, with a
// state's hue only on that state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { columnsAt, headH, moreH, rowsThatFit, table, withAlpha, type Column } from '../src/client/features/boards/table.js';
import { ledgerView, paintLedger, phaseChip } from '../src/client/features/proofcorner/ledger.js';
import { checksChip, inboxRows, outline, seatRows } from '../src/client/features/boards/review-rows.js';
import { planView } from '../src/client/features/whiteboard/face.js';
import { docsView, sizeText } from '../src/client/features/bookshelf/index-screen.js';
import { PANEL } from '../src/client/features/boards/world.js';
import { DECK } from '../src/client/world/office/materials.js';
import { ACTION_LABEL } from '../src/shared/attention.js';
import type { BountiesState, BountyView, Meeting, Mission, ReputationState } from '../src/shared/protocol.js';
import type { ReviewItem } from '../src/shared/review.js';

/** A canvas stand-in: every glyph 0.55 of the font's size wide, and a record of the text drawn. */
function canvasSpy() {
  const texts: { text: string; x: number; align: string; width: number; font: string; color: string }[] = [];
  const size = (font: string) => Number(/(\d+)px/.exec(font)?.[1] ?? 10);
  const noop = () => {};
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '10px x',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    filter: 'none',
    measureText(t: string) {
      return { width: t.length * size(this.font) * 0.55 };
    },
    fillText(t: string, x: number) {
      texts.push({ text: t, x, align: this.textAlign, width: this.measureText(t).width, font: this.font, color: String(this.fillStyle) });
    },
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    rect: noop,
    roundRect: noop,
    clearRect: noop,
    drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    setLineDash: noop,
  };
  return { g: ctx as unknown as CanvasRenderingContext2D, texts };
}

/** Where a drawn text's left and right edges are. */
const span = (t: { x: number; width: number; align: string }) => {
  const left = t.align === 'right' ? t.x - t.width : t.align === 'center' ? t.x - t.width / 2 : t.x;
  return [left, left + t.width] as const;
};

const NOW = Date.UTC(2026, 9, 6, 12);
const H = 3_600_000;

test('the columns share the width by weight, the gaps taken out first', () => {
  const cols: Column[] = [{ label: 'a', w: 1 }, { label: 'b', w: 3 }, { label: 'c', w: 1 }];
  const at = columnsAt(cols, 1000, 40);
  const gap = 40 * 0.6;
  assert.equal(at.length, 3);
  assert.ok(Math.abs(at[2].x + at[2].w - 1000) < 1e-6, 'the last column ends at the width');
  assert.ok(Math.abs(at[1].w - 3 * at[0].w) < 1e-6, 'by weight');
  assert.ok(Math.abs(at[1].x - (at[0].x + at[0].w + gap)) < 1e-6, 'a gap between');
});

test('a table shows every row when they fit, else as many as leave room for "+N more"', () => {
  const size = 30;
  const rowH = 50;
  assert.equal(rowsThatFit(4, headH(size) + 4 * rowH, size, rowH), 4);
  const h = headH(size) + 4 * rowH;
  const n = rowsThatFit(9, h, size, rowH);
  assert.ok(n < 4 && headH(size) + n * rowH + moreH(size) <= h, `${n} rows and the more line fit in ${h}`);
  assert.equal(rowsThatFit(3, 10, size, rowH), 0, 'never fewer than none');
});

test('a table writes its header in capitals, keeps each cell inside its column and counts the rest', () => {
  const { g, texts } = canvasSpy();
  const columns: Column[] = [{ label: 'Issue', w: 0.8, mono: true }, { label: 'Title', w: 2 }, { label: 'Amount', w: 1.2, align: 'right', mono: true }, { label: 'State', w: 1.2 }];
  const rows = Array.from({ length: 8 }, (_, i) => ({ cells: [`#${40 + i}`, 'A very long title that will never fit in its column on the board', '1234.50 USDC', { chip: phaseChip('awaiting-approval') }] }));
  const x = 20;
  const w = 900;
  const drawn = table(g, { x, y: 0, w, h: 400, size: 30, rowH: 50, columns, rows });
  assert.ok(drawn > 0 && drawn < rows.length);
  const said = texts.map((t) => t.text);
  for (const c of columns) assert.ok(said.includes(c.label.toUpperCase()), `${c.label} in the header`);
  assert.ok(said.includes(`+${rows.length - drawn} more`));
  assert.ok(said.some((t) => t.endsWith('...')), 'the long title is cut with an ellipsis');
  for (const t of texts) {
    const [l, r] = span(t);
    assert.ok(l >= x - 1 && r <= x + w + 1, `"${t.text}" stays inside the table`);
  }
});

test("a chip's fill takes its hue at a low alpha", () => {
  assert.equal(withAlpha('#FF4D5E', 0.2), 'rgba(255,77,94,0.2)');
});

function bounty(issue: number, usdc: number, phase: BountyView['phase'], extra: Partial<BountyView> = {}): BountyView {
  return { issue, nonce: 1, pda: `p${issue}`, amount: String(usdc * 1e6), decimals: 6, symbol: 'USDC', funders: 1, expiry: NOW + 5 * 24 * H, phase, txs: [{ kind: 'funded', sig: 's', at: NOW - 30 * H }], ...extra };
}
const BOUNTIES: BountiesState = {
  enabled: true,
  network: 'solana-devnet',
  blink: false,
  items: [
    bounty(48, 10, 'expired', { txs: [{ kind: 'funded', sig: 'x', at: NOW - 80 * H }] }),
    bounty(42, 25, 'open'),
    bounty(41, 50, 'released', { workerName: 'Dot', txs: [{ kind: 'paid', sig: 'p', at: NOW - 2 * H }] }),
    bounty(43, 40, 'claimed', { claimPr: 78, workerName: 'Byte' }),
    bounty(45, 5, 'blocked', { claimPr: 80 }),
    bounty(44, 50, 'awaiting-approval', { claimPr: 77, workerName: 'Widget' }),
  ],
};

test("the ledger puts what waits for a person first, the live ones next and the settled last, and totals what's held", () => {
  const v = ledgerView(BOUNTIES, undefined, NOW);
  assert.ok(v.on);
  assert.equal(v.network, 'devnet');
  assert.deepEqual(v.bounties.map((r) => r.cells[0]), ['#44', '#45', '#43', '#42', '#41', '#48']);
  // Approve, blocked, claimed and open are still in escrow: 50 + 5 + 40 + 25.
  assert.deepEqual(v.held, { count: 4, total: '120.00 USDC' });
  assert.equal(v.paid, 1);
  // What's next: a claim's PR, an open one's time left, a settled one's age.
  assert.equal(v.bounties[2].cells[4], 'PR #78');
  assert.equal(v.bounties[3].cells[4], '5 d left');
  assert.equal(v.bounties[4].cells[4], '2h ago');
  assert.ok(v.bounties[4].quiet && v.bounties[5].quiet && !v.bounties[0].quiet);
  assert.equal(ledgerView({ ...BOUNTIES, enabled: false }, undefined, NOW).on, false);
});

test("the ledger's chips keep each hue to its owner: amber to approve, red when blocked, violet for the chain, green once paid", () => {
  assert.equal(phaseChip('awaiting-approval').hue, PANEL.review);
  assert.equal(phaseChip('awaiting-approval').glyph, 'review');
  assert.equal(phaseChip('blocked').hue, PANEL.stuck);
  assert.equal(phaseChip('blocked').glyph, 'stuck');
  assert.equal(phaseChip('claimed').hue, PANEL.proof);
  assert.equal(phaseChip('paying').hue, PANEL.proof);
  assert.equal(phaseChip('released').hue, PANEL.settled);
  for (const p of ['open', 'claimed', 'awaiting-approval', 'blocked', 'paying', 'released', 'refunded', 'cancelled', 'expired'] as const) assert.notEqual(phaseChip(p).hue, PANEL.signal, `${p} is never needs-you orange`);
});

test("the ledger ranks the agents' records by merges and paints both tables inside the screen", () => {
  const stats = (merged: number, mergeRate: number | null) => ({ key: 'k', by: 'agent' as const, harness: 'claude', merged, selfMerged: 0, reverted: 1, closedUnmerged: 0, mergeRate, revertRate: null, score: null, medianTimeToMerge: null });
  const rep: ReputationState = {
    enabled: true,
    owed: 2,
    harnesses: [],
    agents: [
      { key: 'b', harness: 'codex', operator: 'o', label: 'codex', stats: stats(3, null), workers: [] },
      { key: 'a', harness: 'claude', operator: 'o', label: 'claude', agentId: '214', stats: stats(12, 0.857), workers: ['w'] },
    ],
  };
  const v = ledgerView(BOUNTIES, rep, NOW);
  assert.deepEqual(v.agents.map((r) => r.cells[0]), ['claude', 'codex']);
  assert.deepEqual(v.agents[0].cells.slice(1), ['#214', '12', '86%', '1']);
  assert.equal(v.agents[1].cells[3], '--', 'no rate under the minimum of samples');
  assert.ok(v.agents[1].quiet, 'an agent with no unit on the roster steps back');
  const { g, texts } = canvasSpy();
  const W = 1760;
  const Ht = 384;
  paintLedger({ g, W, H: Ht, canvas: null as never, texture: { needsUpdate: false } as never }, v);
  const said = texts.map((t) => t.text);
  for (const s of ['PROOF', '#44', '50.00 USDC', 'APPROVE', 'claude', '2 owed']) assert.ok(said.some((t) => t.includes(s)), `${s} on the ledger`);
  for (const t of texts) {
    const [l, r] = span(t);
    assert.ok(l >= 0 && r <= W, `"${t.text}" stays on the ledger`);
  }
});

function item(over: Partial<ReviewItem>): ReviewItem {
  return { key: 'k', floor: 'deck', floorName: 'Deck', since: NOW - 30 * 60_000, reason: 'done 30 min ago', action: 'review', snoozed: false, ...over };
}

test("the Review bay lists this deck's review inbox, not another deck's or the snoozed, with what to do next", () => {
  const entry = { id: 'w1', deskId: 'desk-6', name: 'Widget', task: { name: 'Fix flaky checkout e2e', summary: '' } } as unknown as ReviewItem['entry'];
  const items = [
    item({ key: 'w:w1', entry, checks: 'fail' }),
    item({ key: 'pr', pull: { number: 79, title: 'Port settings to the form kit' } as ReviewItem['pull'], action: 'merge', checks: 'pass' }),
    item({ key: 'b', payout: { floor: 'deck', floorName: 'Deck', issue: 44, amount: '50.00 USDC', kind: 'approve' }, action: 'approve-payout' }),
    item({ key: 'other', floor: 'other' }),
    item({ key: 'snoozed', snoozed: true }),
  ];
  const rows = inboxRows(items, 'deck', NOW);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.cells[2]), [ACTION_LABEL.review, ACTION_LABEL.merge, ACTION_LABEL['approve-payout']]);
  assert.equal(rows[0].cells[1], 'Fix flaky checkout e2e');
  assert.equal(rows[0].hue, PANEL.stuck, 'failing checks: the red stripe');
  assert.equal(rows[2].hue, PANEL.proof, 'a payout is the chain');
  assert.deepEqual(rows[0].cells[4], { text: '30m', mono: true });
  assert.equal(checksChip('fail')?.hue, PANEL.stuck);
  assert.equal(checksChip('none'), null);
});

test("a meeting's seats say where each turn stands, and its outline is the output's headings", () => {
  const m = {
    status: 'running',
    seats: [{ role: 'Lead', deskId: 'm1', workerName: 'Echo', tokens: 48_200 }, { role: 'Security', deskId: 'm2', workerName: 'Flux' }],
    turns: [{ seat: 1, doing: 'checking the CSP', file: 'a', state: 'working' }],
  } as unknown as Meeting;
  const rows = seatRows(m);
  assert.equal(rows[0].cells[2], 'next round');
  assert.ok(rows[0].quiet, 'a seat with no part this step steps back');
  assert.deepEqual(rows[1].cells[3], { chip: { text: 'on it', hue: PANEL.working, glyph: 'working' } });
  assert.equal((rows[0].cells[4] as { text: string }).text, '48k');
  const done = seatRows({ ...m, status: 'done', turns: [] } as Meeting);
  assert.ok(done.every((r) => (r.cells[3] as { chip: { text: string } }).chip.text === 'done'));
  assert.deepEqual(outline('# Review\nwords\n## **Security**\n### `CSP`\n#not a heading\n## Verdict', 3), [
    { text: 'Review', depth: 1 },
    { text: 'Security', depth: 2 },
    { text: 'CSP', depth: 3 },
  ]);
});

test("the planning board's milestones say where each stands, its issues closed of all, its units, spend and due date", () => {
  const mission: Mission = {
    statement: 'Ship the auth rewrite',
    active: 'b',
    milestones: [
      { id: 'a', title: 'Session store', issues: [], done: true, totals: { usd: 0, tokens: 0, workedMs: 0, workers: 0 } },
      { id: 'b', title: 'Auth rewrite', issues: [41, 42, 43], done: false, due: '2026-10-01', totals: { usd: 1.5, tokens: 0, workedMs: 0, workers: 1 } },
      { id: 'c', title: 'Bounties', issues: [44], done: false, due: '2026-12-24', totals: { usd: 0, tokens: 0, workedMs: 0, workers: 0 } },
    ],
  };
  const issues = { items: [42, 44].map((number) => ({ number, title: '', state: 'OPEN' })), fetchedAt: NOW, loading: false } as never;
  const roster = [{ goal: 'b', usd: 0.25 }, { goal: 'b' }] as never;
  const queue = { maxWorkers: 2, tasks: [{ id: 'q2', title: 'Later', status: 'queued' }, { id: 'q1', issue: 43, title: '#43 Rate limits', status: 'running' }] } as never;
  const v = planView(mission, issues, roster, queue, NOW);
  assert.equal(v.done, 1);
  assert.equal(v.total, 3);
  const [a, b, c] = v.milestones;
  assert.equal((a.cells[0] as { chip: { text: string } }).chip.text, 'done');
  assert.deepEqual((b.cells[0] as { chip: { hue: string } }).chip.hue, DECK.ship, 'the one the team is on is ship-cyan');
  const [closed, units, spent, due] = b.cells.slice(2).map((c) => (c as { text: string }).text);
  assert.deepEqual([closed, units, spent], ['2/3', '2', '$1.75']);
  assert.match(due, /^[45]d late$/, 'gone by: how many days late, in any time zone');
  assert.deepEqual(c.cells.slice(2).map((c) => (c as { text: string }).text), ['0/1', '--', '--', 'Dec 24']);
  // The queue: what's running first, then what waits.
  assert.deepEqual(v.queue.map((r) => r.cells[1]), ['Rate limits', 'Later']);
  assert.equal(v.queued, 1);
});

test("the docs rack's index lists the latest changed first, with its folder, age and size", () => {
  assert.equal(docsView(null).status, 'loading');
  assert.equal(docsView(new Error('no')).status, 'error');
  const v = docsView({ more: false, files: [{ path: 'README.md', title: 'Acme', size: 900, mtime: NOW - 3 * H }, { path: 'docs/api/limits.md', size: 14_000, mtime: NOW - 60_000 }] }, NOW);
  assert.equal(v.count, 2);
  assert.deepEqual(v.rows[0].cells.map((c) => (typeof c === 'string' ? c : (c as { text: string }).text)), ['limits', 'docs/api', '1m', '14 kB']);
  assert.deepEqual(v.rows[1].cells.map((c) => (typeof c === 'string' ? c : (c as { text: string }).text)), ['Acme', '/', '3h', '900 B']);
  assert.equal(sizeText(1023), '1023 B');
});
