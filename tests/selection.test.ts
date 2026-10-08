import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ATTENTION_LEVELS } from '../src/shared/attention.js';
import { buttonsFor, classifyPress, CLICK_MS, CLICK_SLOP_PX, easeOutCubic, elapsed } from '../src/client/features/selection/logic.js';

const client = path.join(import.meta.dirname, '../src/client');

test('a quick press that barely moved is a click; a long or moved one is a drag', () => {
  const down = { x: 100, y: 100, t: 1000 };
  assert.equal(classifyPress(down, { x: 100, y: 100, t: 1050 }), 'click');
  assert.equal(classifyPress(down, { x: 103, y: 103, t: 1200 }), 'click', 'under 5px of travel');
  assert.equal(classifyPress(down, { x: 100 + CLICK_SLOP_PX, y: 100, t: 1010 }), 'drag', '5px is a drag');
  assert.equal(classifyPress(down, { x: 140, y: 90, t: 1100 }), 'drag', 'a pan');
  assert.equal(classifyPress(down, { x: 100, y: 100, t: 1000 + CLICK_MS }), 'drag', 'held 300 ms');
  assert.equal(classifyPress(down, { x: 101, y: 100, t: 1000 + CLICK_MS - 1 }), 'click');
});

test('the inspector offers the one button each state asks for', () => {
  const labels = (l: Parameters<typeof buttonsFor>[0]) => buttonsFor(l).map((b) => `${b.label}:${b.action}${b.primary ? '!' : ''}`);
  assert.deepEqual(labels('needs-you'), ['Answer:answer!']);
  assert.deepEqual(labels('review'), ['Review changes:review!']);
  assert.deepEqual(labels('stuck'), ['Open terminal:terminal!']);
  assert.deepEqual(labels('working'), ['Terminal:terminal', 'Changes:changes']);
  for (const level of ATTENTION_LEVELS) {
    const bs = buttonsFor(level);
    assert.ok(bs.length >= 1, `${level} has a button`);
    assert.ok(bs.filter((b) => b.primary).length <= 1, `${level} has at most one primary`);
  }
});

test('the card clock counts seconds while it is short', () => {
  assert.equal(elapsed(-5), '0s');
  assert.equal(elapsed(42_000), '42s');
  assert.equal(elapsed(4 * 60_000 + 7_000), '4m');
  assert.equal(elapsed(2 * 3_600_000 + 5 * 60_000), '2h');
  assert.equal(elapsed(76 * 3_600_000), '3d');
});

test('the lock-on eases out and stays inside 0..1', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(2), 1);
  assert.equal(easeOutCubic(-1), 0);
  assert.ok(easeOutCubic(0.5) > 0.5, 'fast in');
});

test('selection is its own feature: installed ahead of the Overview, linked to the rail without touching its callers', async () => {
  const main = readFileSync(path.join(client, 'main.ts'), 'utf8');
  const sel = main.indexOf('installSelection(ctx');
  assert.ok(sel > 0 && sel < main.indexOf('installOverview(ctx'), 'its Esc guard comes before the Overview\'s');
  const rail = readFileSync(path.join(client, 'ui/workers-panel.ts'), 'utf8');
  assert.match(rail, /export function linkRail\(/);
  assert.match(rail, /ondblclick: \(\) => link && onOpen\(w\.id\)/, 'double-click still opens the terminal');
  // The reticle is white: never a state's hue, nor the ship-cyan of the heartbeat meters round it.
  const reticle = readFileSync(path.join(client, 'features/selection/reticle.ts'), 'utf8');
  const { RING_COLOR } = await import('../src/client/features/selection/reticle.js');
  assert.equal(RING_COLOR, 0xffffff);
  assert.doesNotMatch(reticle, /DECK\.(ship|signal|stuck|review|working)/);
});

test("the selection reticle's marks stay clear of the heartbeat's quiet meter under the same unit", async () => {
  const { RETICLE_BANDS } = await import('../src/client/features/selection/reticle.js');
  const { HEARTBEAT } = await import('../src/client/features/heartbeat/logic.js');
  // The meter is 0.06 m wide (features/heartbeat/world.ts ARC_W), centred on its radius.
  const meter = [HEARTBEAT.meterR - 0.03, HEARTBEAT.meterR + 0.03];
  for (const [name, [lo, hi]] of Object.entries(RETICLE_BANDS)) {
    assert.ok(hi <= meter[0] || lo >= meter[1], `the reticle's ${name} (${lo}-${hi} m) overlaps the quiet meter (${meter[0]}-${meter[1]} m)`);
  }
});

test('switching units fast leaves only the newest content at full strength: what was fading goes at once', async () => {
  // A stand-in for the card's body and its children: enough DOM for switchOut().
  class El {
    parent: Body | null = null;
    cls = new Set<string>();
    classList = { add: (c: string) => this.cls.add(c), contains: (c: string) => this.cls.has(c) };
    addEventListener() {}
    remove() {
      if (this.parent) this.parent.kids = this.parent.kids.filter((k) => k !== this);
    }
  }
  class Body {
    kids: El[] = [];
    get children() {
      return this.kids;
    }
    append(e: El) {
      e.parent = this;
      this.kids.push(e);
    }
    querySelectorAll(sel: string) {
      return sel.includes('sel-out') ? this.kids.filter((k) => k.cls.has('sel-out')) : [];
    }
  }
  const g = globalThis as unknown as { window?: unknown };
  const had = 'window' in g;
  if (!had) g.window = { setTimeout: () => 0 };
  try {
    const { switchOut } = await import('../src/client/features/selection/inspector.js');
    const body = new Body();
    const show = () => {
      switchOut(body as unknown as HTMLElement);
      body.append(new El());
    };
    body.append(new El());
    // A, then B, then A again, all within the 120 ms fade.
    show();
    show();
    show();
    assert.equal(body.kids.filter((k) => !k.cls.has('sel-out')).length, 1, 'one child at full strength');
    assert.ok(body.kids.length <= 2, 'what was already fading went at once');
  } finally {
    if (!had) delete g.window;
  }
});
