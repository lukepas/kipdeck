// The rundown's layouts (shared/rundown/treemap.ts, heatmap.ts, branches.ts): tiles that fill the box
// with areas in proportion, the heatmap's weeks and steps, and branch lanes off the default branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squarify, withFloor, inset } from '../src/shared/rundown/treemap.js';
import { heatmap, levelOf, WEEKS } from '../src/shared/rundown/heatmap.js';
import { laneLayout, MAX_LANES } from '../src/shared/rundown/branches.js';
import { sampleFacts } from './support/rundown-sample.js';

const area = (t: { w: number; h: number }) => t.w * t.h;

test('tiles fill the box, each in proportion to its value, inside it and not overlapping', () => {
  const values = [600, 300, 120, 60, 30, 6, 1];
  const box = { x: 0, y: 0, w: 1000, h: 560 };
  const tiles = squarify(values, (v) => v, box);
  assert.equal(tiles.length, values.length);
  const total = values.reduce((a, b) => a + b, 0);
  for (const t of tiles) {
    assert.ok(Math.abs(area(t) / (box.w * box.h) - t.item / total) < 1e-6, String(t.item));
    assert.ok(t.x >= -1e-6 && t.y >= -1e-6 && t.x + t.w <= box.w + 1e-6 && t.y + t.h <= box.h + 1e-6);
  }
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i];
      const b = tiles[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(ox <= 1e-6 || oy <= 1e-6, `${a.item} and ${b.item} overlap`);
    }
  // Squarified: the biggest is not a sliver.
  const big = tiles.find((t) => t.item === 600)!;
  assert.ok(Math.max(big.w / big.h, big.h / big.w) < 3);
});

test('a floor keeps empty parts on the map; nothing is laid out in an empty box', () => {
  assert.deepEqual(withFloor([0, 100], 0.02), [2, 100]);
  assert.deepEqual(withFloor([0, 0], 0.02), [1, 1]);
  assert.equal(squarify([1, 2], (v) => v, { x: 0, y: 0, w: 0, h: 10 }).length, 0);
  assert.deepEqual(inset({ x: 0, y: 0, w: 4, h: 2 }, 3), { x: 3, y: 3, w: 0, h: 0 });
});

test('the heatmap is 26 weeks of days ending this week, five steps, with totals and the streak', () => {
  const today = new Date(2026, 9, 7, 12);
  const heat = heatmap({ '2026-10-07': 4, '2026-10-06': 2, '2026-10-05': 1, '2026-09-01': 8, '2027-01-01': 50 }, today);
  assert.equal(heat.weeks.length, WEEKS);
  assert.ok(heat.weeks.every((w) => w.length === 7));
  const cells = heat.weeks.flat();
  assert.equal(cells.find((c) => c.date === '2026-10-07')?.count, 4);
  assert.ok(cells.filter((c) => c.future).every((c) => c.level === 0));
  assert.equal(heat.max, 8, 'a day after today does not set the scale');
  assert.deepEqual(heat.totals, { d7: 7, d30: 7, d182: 15 });
  assert.equal(heat.streak, 3);
  assert.equal(levelOf(0, 8), 0);
  assert.equal(levelOf(1, 8), 1);
  assert.equal(levelOf(8, 8), 4);
});

test('branch lanes: the default branch first and reaching every fork, unmerged before merged, the rest listed', () => {
  const f = sampleFacts().git!;
  const L = laneLayout(f.branches, 'main', f.worktrees, new Date('2026-10-07T12:00:00Z'));
  assert.equal(L.lanes[0].name, 'main');
  assert.equal(L.lanes[0].isDefault, true);
  const x = L.lanes.find((l) => l.name === 'feature/x')!;
  assert.ok(x.from <= x.to);
  assert.ok(L.lanes[0].to >= x.from);
  assert.deepEqual(x.worktree, { path: '/tmp/wt', owner: 'A-01' });
  const many = Array.from({ length: 20 }, (_, i) => ({ ...f.branches[1], name: `b${i}`, merged: i % 2 === 0 }));
  const M = laneLayout([f.branches[0], ...many], 'main', [], new Date('2026-10-07T12:00:00Z'));
  assert.equal(M.lanes.length, MAX_LANES);
  assert.equal(M.rest.length, 21 - MAX_LANES);
  assert.ok(M.lanes.slice(1, 10).every((l) => !l.merged));
});
