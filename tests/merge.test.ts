import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHECK_FRAMES, MERGED_LAYER, SMALL_PART, mergeStatic, snapshot } from '../src/client/features/merge/merge.js';

// The static merge (features/merge): meshes that share an opaque material and stand still are drawn as
// one, their originals stay in the scene graph on a layer no camera draws, a click on the merged mesh
// lands on the original, and an original that moves or hides is split back off.

const steel = new THREE.MeshStandardMaterial({ color: '#3a4756' });

function deck() {
  const root = new THREE.Group();
  const console1 = new THREE.Group();
  console1.userData.interact = { kind: 'desk', x: 0, z: 0, radius: 1 };
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), steel);
  a.castShadow = true;
  console1.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), steel);
  b.position.set(4, 0, 0);
  b.castShadow = true;
  const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), steel);
  c.position.set(-4, 0, 0);
  c.castShadow = true;
  root.add(console1, b, c);
  return { root, a, b, c, console1 };
}

test('meshes sharing a material are drawn as one, and their originals go on a layer no camera sees', () => {
  const { root, a, b, c } = deck();
  const m = mergeStatic(root);
  assert.equal(m.meshes.length, 1);
  assert.equal(m.merged, 3);
  for (const o of [a, b, c]) assert.equal(o.layers.mask, 1 << MERGED_LAYER);
  const merged = m.meshes[0];
  assert.equal(merged.material, steel);
  assert.equal(merged.castShadow, true);
  assert.equal(merged.geometry.attributes.position.count, 3 * 36);
  // The second box sits 4 m along x in the merged geometry.
  merged.geometry.computeBoundingBox();
  assert.ok(Math.abs(merged.geometry.boundingBox!.max.x - 4.5) < 1e-6);
});

test('a click on the merged mesh lands on the original it came from', () => {
  const { root, a, b, console1 } = deck();
  mergeStatic(root);
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(root, true)[0];
  assert.equal(hit.object, a);
  assert.equal(hit.object.parent, console1);
  const ray2 = new THREE.Raycaster(new THREE.Vector3(4, 0, 5), new THREE.Vector3(0, 0, -1));
  assert.equal(ray2.intersectObject(root, true)[0].object, b);
});

test('an original that moves or hides is split back off, drawn on its own again', () => {
  const { root, a, b, c } = deck();
  const m = mergeStatic(root);
  assert.equal(m.check(), 0);
  b.position.x = 6;
  c.visible = false;
  root.updateMatrixWorld(true);
  let split = 0;
  for (let i = 0; i < CHECK_FRAMES; i++) split += m.check();
  assert.equal(split, 2);
  assert.equal(m.live(), 1);
  assert.equal(b.layers.mask, 1);
  assert.equal(c.layers.mask, 1);
  assert.equal(a.layers.mask, 1 << MERGED_LAYER);
  // Its triangles in the merged mesh are collapsed to a point: nothing left there to draw or click.
  const ray = new THREE.Raycaster(new THREE.Vector3(4, 0, 5), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObject(m.meshes[0], false);
  assert.equal(hits.length, 0);
  m.undo();
  assert.equal(a.layers.mask, 1);
  assert.equal(root.children.includes(m.meshes[0]), false);
});

test('see-through, one-of-a-kind, skipped and moving meshes are left alone', () => {
  const root = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), glass), new THREE.Mesh(new THREE.BoxGeometry(), glass));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const seat = new THREE.Group();
  seat.add(new THREE.Mesh(new THREE.BoxGeometry(), steel), new THREE.Mesh(new THREE.BoxGeometry(), steel));
  root.add(seat);
  const turning = new THREE.Group();
  turning.add(new THREE.Mesh(new THREE.BoxGeometry(), steel), new THREE.Mesh(new THREE.BoxGeometry(), steel));
  root.add(turning);
  const still = snapshot(root);
  turning.rotation.y = 0.3;
  const m = mergeStatic(root, { skip: [seat] }, still);
  assert.equal(m.meshes.length, 0);
});

test('a small part casts no shadow of its own', () => {
  const root = new THREE.Group();
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(SMALL_PART / 2, SMALL_PART / 2, SMALL_PART / 2), steel);
  const bolt2 = bolt.clone();
  bolt.castShadow = bolt2.castShadow = true;
  bolt2.position.x = 2;
  root.add(bolt, bolt2);
  const m = mergeStatic(root);
  assert.equal(bolt.castShadow, false);
  assert.equal(m.meshes[0].castShadow, false);
});

test('a mirrored original keeps its faces turned outward', () => {
  const root = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), steel);
  const b = new THREE.Mesh(new THREE.BoxGeometry(), steel);
  b.scale.x = -1;
  b.position.x = 3;
  root.add(a, b);
  const m = mergeStatic(root);
  const pos = m.meshes[0].geometry.attributes.position;
  const nrm = m.meshes[0].geometry.attributes.normal;
  const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, 36 + k));
  const face = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
  const n = new THREE.Vector3().fromBufferAttribute(nrm, 36);
  assert.ok(face.dot(n) > 0.99, `winding ${face.toArray()} against normal ${n.toArray()}`);
});

test('a big original is tested a run at a time, and hits the same as tested whole', () => {
  const root = new THREE.Group();
  // A ring of 4,000 triangles round the eye, as the hull's frames are.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.5, 20, 100), steel);
  ring.rotation.x = Math.PI / 2;
  const other = new THREE.Mesh(new THREE.BoxGeometry(), steel);
  other.position.set(0, -5, 0);
  root.add(ring, other);
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
  const whole = ray.intersectObject(ring, false).map((h) => +h.distance.toFixed(4));
  mergeStatic(root);
  const runs = ray.intersectObject(root, true).filter((h) => h.object === ring).map((h) => +h.distance.toFixed(4));
  assert.deepEqual(runs, whole);
  assert.equal(whole.length, 1);
  // Out of reach, nothing.
  ray.far = 5;
  assert.equal(ray.intersectObject(root, true).length, 0);
});
