import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLASS, VIEWPORT_GLASS, paintedBox } from '../src/client/world/office/materials.js';

// A box painted face by face (world/office/materials.ts, paintedBox): its faces are gathered by paint,
// so it draws once per paint rather than once per face, and keeps every triangle. And the flat glass,
// see-through and double sided, draws both sides in one pass.

test('a box with two paints over six faces is two groups, every triangle kept', () => {
  const edge = new THREE.MeshStandardMaterial({ color: '#26303c' });
  const under = new THREE.MeshStandardMaterial({ color: '#0a0f15' });
  const geo = new THREE.BoxGeometry(2, 1, 3);
  const before = geo.index!.count;
  const m = paintedBox(geo, [edge, edge, under, under, edge, edge]);
  assert.ok(Array.isArray(m.material));
  assert.deepEqual(m.material, [edge, under]);
  assert.equal(m.geometry.groups.length, 2);
  assert.equal(m.geometry.index!.count, before);
  const [a, b] = m.geometry.groups;
  assert.equal(a.count, 4 * 6, 'four faces of edge');
  assert.equal(b.count, 2 * 6, 'two faces of under');
  assert.equal(a.materialIndex, 0);
  assert.equal(b.materialIndex, 1);
  // The +y and -y faces (the third and fourth) are the ones painted under.
  const ys = new Set<number>();
  const pos = m.geometry.attributes.position;
  for (let i = b.start; i < b.start + b.count; i++) ys.add(Math.abs(pos.getY(m.geometry.index!.getX(i))));
  assert.deepEqual([...ys], [0.5]);
});

test('a box in one paint is a plain mesh with one material', () => {
  const wall = new THREE.MeshStandardMaterial({ color: '#1c2530' });
  const m = paintedBox(new THREE.BoxGeometry(1, 1, 1), Array(6).fill(wall));
  assert.equal(m.material, wall);
  assert.equal(m.geometry.groups.length, 1);
});

test('the flat glass draws both sides in one pass', () => {
  for (const g of [GLASS, VIEWPORT_GLASS]) {
    assert.equal(g.side, THREE.DoubleSide);
    assert.equal(g.transparent, true);
    assert.equal(g.forceSinglePass, true);
  }
});
