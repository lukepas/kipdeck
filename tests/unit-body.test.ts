import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { unitGeometries } from '../src/client/world/character/unit-body.js';
import { shellGeometry as laptopShell } from '../src/client/features/workers/laptop.js';

// A unit drawn in few pieces (world/character/unit-body.ts): its shell one skinned mesh over three
// bones (the figure, and each arm's pivot), its band, visor and hairline one mesh tagged by part.
// And a laptop's bezel and plinth, one skinned mesh over its lid's hinge (features/workers/laptop.ts).

/** How many vertices are bound to each bone, every one wholly to one. */
function bones(geo: THREE.BufferGeometry): Map<number, number> {
  const index = geo.attributes.skinIndex;
  const weight = geo.attributes.skinWeight;
  assert.ok(index && weight, 'skinned');
  assert.equal(index.count, geo.attributes.position.count);
  const out = new Map<number, number>();
  for (let i = 0; i < index.count; i++) {
    assert.equal(weight.getX(i), 1);
    assert.equal(weight.getY(i) + weight.getZ(i) + weight.getW(i), 0);
    out.set(index.getX(i), (out.get(index.getX(i)) ?? 0) + 1);
  }
  return out;
}

test("a unit's shell is bound to the figure and its two arms, the arms alike", () => {
  const { shell } = unitGeometries();
  const by = bones(shell);
  assert.deepEqual([...by.keys()].sort(), [0, 1, 2]);
  assert.equal(by.get(1), by.get(2));
  assert.ok(by.get(0)! > by.get(1)!);
  // The arms hang at the shoulders either side, below them: bone 1 to the left, bone 2 to the right.
  const pos = shell.attributes.position;
  const idx = shell.attributes.skinIndex;
  for (let i = 0; i < pos.count; i++) {
    if (idx.getX(i) === 1) assert.ok(pos.getX(i) < -0.15 && pos.getY(i) < 0.95);
    if (idx.getX(i) === 2) assert.ok(pos.getX(i) > 0.15 && pos.getY(i) < 0.95);
  }
});

test("a unit's lights are one mesh, each vertex tagged band, visor or hairline", () => {
  const { lights } = unitGeometries();
  const part = lights.attributes.part;
  assert.ok(part);
  const seen = new Set<number>();
  for (let i = 0; i < part.count; i++) seen.add(part.getX(i));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test("a laptop's shell is its plinth on the laptop and its bezel on the lid's hinge", () => {
  const by = bones(laptopShell());
  assert.deepEqual([...by.keys()].sort(), [0, 1]);
  assert.equal(by.get(0), by.get(1), 'two boxes');
});
