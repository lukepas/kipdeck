// The arc and the room as the captain reads them: the Attention board's cards (features/tv/plan.ts),
// the wings folding an empty Queue or Services to a pill (shared/amphitheater.ts), the chrome round each
// board and the pull toward a unit out of view (features/arcchrome/logic.ts), one label a unit
// (features/workers/labels.ts), and the holo's route column (features/bridge/holo-route.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRIDS, HERO_ORDER, cardCell, heroKind, planHero } from '../src/client/features/tv/plan.js';
import { CHROME, CHROME_IDS, PULL, armOf, chromeBars, pullAt } from '../src/client/features/arcchrome/logic.js';
import { HERO_READABLE_PX, labelSource, pileWord, piles } from '../src/client/features/workers/labels.js';
import { COLUMN, columnRing, overlaps, routePoint, unitSlot } from '../src/client/features/bridge/holo-route.js';
import { ARC, PILL, heroPanel, wingHeights, wingMiddles, wingPanel } from '../src/shared/amphitheater.js';
import { BOARDS, MACHINE_MONITOR, TV } from '../src/shared/layout.js';
import type { AttentionLevel, Ranked } from '../src/shared/attention.js';

let n = 0;
function unit(level: AttentionLevel, extra: Record<string, unknown> = {}, snoozed = false): Ranked {
  const id = `u${++n}`;
  return { entry: { id, name: id, deskId: 'desk-1', tasked: true, status: level === 'parked' ? 'idle' : 'working', ...extra } as unknown as Ranked['entry'], att: { level, label: level, since: n, action: 'look', snoozed } };
}
const many = (level: AttentionLevel, k: number) => Array.from({ length: k }, () => unit(level));

test('the Attention board orders its cards stuck, needs you, to review, working, then done', () => {
  const crew = [unit('working'), unit('review'), unit('needs-you'), unit('parked'), unit('stuck')];
  const plan = planHero(crew);
  assert.deepEqual(plan.cards.map((c) => c.kind), ['stuck', 'needs-you', 'review', 'working', 'done']);
  assert.deepEqual(HERO_ORDER, ['stuck', 'needs-you', 'review', 'working', 'done']);
  assert.equal(plan.chips.length, 0);
});

test('done is its own kind; asleep and never-tasked units are not on the board', () => {
  assert.equal(heroKind(unit('parked')), 'done');
  assert.equal(heroKind(unit('parked', { status: 'exited' })), null);
  assert.equal(heroKind(unit('parked', { tasked: false })), null);
  assert.equal(heroKind(unit('review')), 'review');
});

test('with 20 units the waiting and stuck all have cards, and the working fold into one counted chip', () => {
  const crew = [...many('needs-you', 3), unit('stuck'), ...many('review', 2), ...many('working', 12), ...many('parked', 2)];
  const plan = planHero(crew);
  assert.equal(plan.grid.name, 'full');
  assert.equal(plan.cards.length, 6);
  assert.ok(plan.cards.every((c) => c.kind !== 'working'));
  assert.deepEqual(plan.chips, [
    { kind: 'working', n: 12 },
    { kind: 'done', n: 2 },
  ]);
  assert.equal(plan.top, 'needs-you', 'orange if anyone needs you');
});

test('more waiting than six cards steps down to denser cards rather than hiding one', () => {
  for (const [waiting, grid] of [
    [6, 'full'],
    [7, 'dense'],
    [10, 'dense'],
    [11, 'denser'],
    [15, 'denser'],
  ] as const) {
    const plan = planHero([...many('needs-you', waiting), ...many('working', 4)]);
    assert.equal(plan.grid.name, grid, `${waiting} waiting`);
    assert.equal(plan.cards.filter((c) => c.kind === 'needs-you').length, waiting);
  }
  // Past even the densest grid, the last are counted by kind, never dropped.
  const plan = planHero([...many('stuck', 2), ...many('needs-you', 16)]);
  assert.equal(plan.cards.length, 15);
  assert.deepEqual(plan.chips, [{ kind: 'needs-you', n: 3 }]);
  // Names get smaller as cards get denser, never the other way.
  for (let i = 1; i < GRIDS.length; i++) assert.ok(GRIDS[i].nameM <= GRIDS[i - 1].nameM);
});

test("the board's header counts what the top bar counts: snoozed ones left out", () => {
  const plan = planHero([unit('needs-you'), unit('needs-you', {}, true), unit('working')]);
  assert.equal(plan.counts['needs-you'], 1);
  assert.equal(plan.counts.working, 1);
  assert.equal(plan.top, 'needs-you');
  assert.equal(planHero([unit('stuck'), unit('review')]).top, 'stuck');
  assert.equal(planHero([]).top, null);
});

test('cards fill down the first column, then the next', () => {
  const full = GRIDS[0];
  assert.deepEqual([0, 1, 2, 3].map((i) => cardCell(full, i)), [
    { col: 0, row: 0 },
    { col: 0, row: 1 },
    { col: 0, row: 2 },
    { col: 1, row: 0 },
  ]);
});

test('an empty Queue or Services folds to a pill and the panel over it takes the room', () => {
  const open = wingHeights(false);
  const folded = wingHeights(true);
  assert.equal(open.upper, ARC.wing.height);
  assert.equal(folded.lower, PILL);
  assert.ok(folded.upper > open.upper * 1.7, 'Issues and Pull requests grow by most of a panel');
  // The column's height is the same either way: the gap stays, the upper keeps its top, the lower its foot.
  for (const h of [open, folded]) {
    assert.ok(Math.abs(h.upper + ARC.wing.gap + h.lower - (ARC.top - ARC.bottom)) < 1e-6);
    const mid = wingMiddles(h.upper, h.lower);
    assert.ok(Math.abs(mid.upper + h.upper / 2 - ARC.top) < 1e-3);
    assert.ok(Math.abs(mid.lower - h.lower / 2 - ARC.bottom) < 1e-3);
  }
  // As built, the middles are the wing panels' own.
  const mid = wingMiddles(open.upper, open.lower);
  assert.equal(mid.upper, wingPanel(-1, true).y);
  assert.equal(mid.lower, wingPanel(-1, false).y);
});

test("every board's chrome is a bezel and four corner brackets, outside its face, round its perimeter", () => {
  for (const [id, box] of [
    ['issues', BOARDS.issues],
    ['tv', TV],
    ['capacity', MACHINE_MONITOR],
    ['services', BOARDS.services],
  ] as const) {
    const bars = chromeBars(box);
    assert.equal(bars.length, 12, id);
    assert.equal(bars.filter((b) => b.bracket).length, 8);
    for (const b of bars) {
      assert.ok(b.s0 >= 0 && b.s0 < 1 + 1e-9, `${id}: ${b.s0} round the perimeter`);
      assert.ok(Math.abs(b.ds) <= 0.5, `${id}: a bar covers less than half the perimeter`);
      // Out from the face: no bar's middle is inside the face's rectangle (in the board's own plane).
      const u = (b.x - box.x) * Math.cos(box.rotY) - (b.z - box.z) * Math.sin(box.rotY);
      const v = b.y - box.y;
      assert.ok(Math.abs(u) > box.width / 2 || Math.abs(v) > box.height / 2, `${id}: a bar sits on the face`);
    }
    // The bezel is thin (about 2 px from the chair); the brackets thicker, their arms within bounds.
    assert.ok(CHROME.bezel <= 0.04);
    assert.ok(armOf(box) >= CHROME.arm.min && armOf(box) <= CHROME.arm.max);
  }
  assert.deepEqual([...CHROME_IDS], ['issues', 'queue', 'tv', 'capacity', 'pulls', 'services']);
});

test('the pull toward a unit out of view runs along the foot of the wing on its side, outward', () => {
  for (const side of [-1, 1] as const) {
    const wing = side < 0 ? BOARDS.issues : BOARDS.pulls;
    const a = pullAt(wing, ARC.bottom, side, 0, 0);
    const b = pullAt(wing, ARC.bottom, side, 0, 1);
    const c = pullAt(wing, ARC.bottom, side, PULL.count - 1, 0);
    assert.ok(Math.sign(a.x) === side && Math.abs(a.x) > heroPanel().width / 2, 'beside the Attention board, on its side');
    assert.ok(Math.abs(b.x) > Math.abs(a.x) && Math.abs(c.x) > Math.abs(a.x), 'stepping outward');
    assert.ok(a.y < ARC.bottom, 'under the arc, clear of every board');
  }
});

test('one label a unit: its edge mark, else its card on the board, else its callout', () => {
  const big = HERO_READABLE_PX + 1;
  assert.equal(labelSource({ pointed: true, hasRow: true, heroPx: big, near: false }), 'pointer');
  assert.equal(labelSource({ pointed: false, hasRow: true, heroPx: big, near: false }), 'row');
  assert.equal(labelSource({ pointed: false, hasRow: true, heroPx: 40, near: false }), 'world', 'the board too small to read');
  assert.equal(labelSource({ pointed: false, hasRow: false, heroPx: big, near: false }), 'world', 'only counted: its callout');
  assert.equal(labelSource({ pointed: false, hasRow: true, heroPx: big, near: true }), 'world', 'you are at it');
});

test('callouts piled on one another fold into one chip that counts them', () => {
  const box = (x: number, bottom = 300) => ({ x, bottom, w: 100, h: 30 });
  // Two piled, one apart.
  assert.deepEqual(piles([box(0), box(40), box(400)]), [[0, 1]]);
  // A chain: each on the next.
  assert.deepEqual(piles([box(0), box(60), box(120)]), [[0, 1, 2]]);
  // Touching at an edge isn't a pile.
  assert.deepEqual(piles([box(0), box(100)]), []);
  assert.equal(pileWord(['needs-you', 'stuck', 'review']), '3 waiting');
  assert.equal(pileWord(['working', 'working']), '2 working');
  assert.equal(pileWord(['working', 'needs-you']), '2 agents');
});

test("the holo's route column narrows as it rises and stays under the conn's line to the arc", () => {
  for (let i = 1; i < COLUMN.rings; i++) {
    assert.ok(columnRing(i).y > columnRing(i - 1).y);
    assert.ok(columnRing(i).radius < columnRing(i - 1).radius);
  }
  // The chair's eye (about 2.98 m up at z 10.9) to the capacity strip's foot: over the table that line
  // is at about 2.59 m. The column's top (over the 0.95 m tabletop) stays under it.
  const lineAtTable = 2.98 - (2.98 - ARC.bottom) * (10.9 / (10.9 - ARC.z));
  assert.ok(0.95 + COLUMN.y1 < lineAtTable, `${(0.95 + COLUMN.y1).toFixed(2)} m under ${lineAtTable.toFixed(2)} m`);
  // The course climbs steadily, starting on the conn's side.
  assert.ok(routePoint(0).z > 0);
  for (let t = 0.1; t <= 1; t += 0.1) assert.ok(routePoint(t).y > routePoint(t - 0.1).y);
  // A unit's marker parks close round its waypoint.
  const at = routePoint(0.5);
  for (let k = 0; k < 8; k++) {
    const s = unitSlot(at, k);
    assert.ok(Math.hypot(s.x - at.x, s.z - at.z) < 0.3);
  }
  assert.equal(overlaps({ left: 0, right: 10, top: 0, bottom: 10 }, [{ left: 5, right: 20, top: 5, bottom: 20 }]), true);
  assert.equal(overlaps({ left: 0, right: 10, top: 0, bottom: 10 }, [{ left: 10, right: 20, top: 0, bottom: 10 }]), false);
});
