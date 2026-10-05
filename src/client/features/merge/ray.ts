/**
 * A ray against a big static mesh, a chunk at a time. three tests every triangle of a mesh whose
 * bounding box the ray starts inside, and the hull's viewport frames (30,000 triangles round the whole
 * deck) are always round the eye: the aim (input/pointer.ts), which runs every frame, spent more time
 * on them than on drawing. Cut into runs of consecutive triangles with a box each (made once, in the
 * world, since the mesh stands still), only the runs whose box the ray meets within its reach are tested.
 */
import * as THREE from 'three';

/** Triangles per run: a generated mesh lays its triangles out piece by piece, so a run is a small patch of it. */
const RUN = 128;
/** A mesh with fewer triangles than this is tested whole, as three does. */
export const BIG_MESH = 1024;

export interface Runs {
  boxes: THREE.Box3[];
  /** Each run's first index (or vertex, unindexed) and how many. */
  ranges: [number, number][];
}

/** Cuts `mesh`'s triangles into runs with a world box each. */
export function runsOf(mesh: THREE.Mesh): Runs {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const index = g.index;
  const n = index ? index.count : pos.count;
  const boxes: THREE.Box3[] = [];
  const ranges: [number, number][] = [];
  const v = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  for (let start = 0; start < n; start += RUN * 3) {
    const count = Math.min(RUN * 3, n - start);
    const box = new THREE.Box3();
    for (let i = start; i < start + count; i++) box.expandByPoint(v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld));
    boxes.push(box);
    ranges.push([start, count]);
  }
  return { boxes, ranges };
}

const hitAt = new THREE.Vector3();
const range = { start: 0, count: Infinity };

/** Casts `raycaster` at `mesh` through its `runs` (see runsOf), adding what it hits to `hits`. */
export function raycastRuns(mesh: THREE.Mesh, runs: Runs, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  const ray = raycaster.ray;
  const far2 = raycaster.far * raycaster.far;
  const g = mesh.geometry;
  const was = g.drawRange;
  range.start = was.start;
  range.count = was.count;
  let local: THREE.Ray | null = null;
  for (let i = 0; i < runs.boxes.length; i++) {
    const box = runs.boxes[i];
    if (!box.containsPoint(ray.origin)) {
      if (!ray.intersectBox(box, hitAt) || ray.origin.distanceToSquared(hitAt) > far2) continue;
    }
    local ??= ray.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
    g.drawRange.start = runs.ranges[i][0];
    g.drawRange.count = runs.ranges[i][1];
    (mesh as unknown as { _computeIntersections(r: THREE.Raycaster, h: THREE.Intersection[], ray: THREE.Ray): void })._computeIntersections(raycaster, hits, local);
  }
  g.drawRange.start = range.start;
  g.drawRange.count = range.count;
}
