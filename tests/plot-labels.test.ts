// The plan's zone names (src/client/shared/plot.ts planLabels): none may sit on another. Each name's
// box is estimated from its length at the plan's 0.5 m type, wide enough for the display face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planLabels, type PlanLabel } from '../src/client/shared/plot.js';

const CHAR = 0.42;
const HEIGHT = 0.45;

function box(l: PlanLabel) {
  const w = l.text.length * CHAR;
  const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
  return { x0, x1: x0 + w, y0: l.y - HEIGHT, y1: l.y };
}

test('no two zone names on the plan overlap', () => {
  const labels = planLabels();
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = box(labels[i]);
      const b = box(labels[j]);
      const hit = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      assert.equal(hit, false, `${labels[i].text} overlaps ${labels[j].text}`);
    }
  }
});

test('every board on the situation arc and the capacity strip is named once', () => {
  const names = planLabels().map((l) => l.text);
  for (const n of ['ISSUES', 'QUEUE', 'PRS', 'SERVICES', 'ATTENTION', 'CAPACITY', 'PROOF']) {
    assert.equal(names.filter((x) => x === n).length, 1, n);
  }
});
