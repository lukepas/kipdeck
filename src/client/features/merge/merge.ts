/**
 * The deck's static meshes drawn as a few: every mesh that stands still, shares its material with
 * others and is opaque goes into one merged mesh per material (and per shadow flags, draw order and
 * layers), so the frame draws a few hundred meshes fewer, and the shadow pass with it. Nothing about
 * the scene graph changes for the rest of the office: each original stays where it was, on a layer no
 * camera draws (MERGED_LAYER), so code that moves, hides or reads it still finds it, and a click on the
 * merged mesh lands on the original it came from (its raycast maps each triangle back).
 *
 * A merged original that later moves, hides, changes material or geometry (a door opening, a fixture
 * put away) is split off on the next check: its triangles in the merged mesh are collapsed to nothing
 * and it goes back on its own layers, drawn on its own as before. So merging is always safe, and the
 * worst a mover costs is the frame it moved in.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The layer the merged originals sit on: no camera ever turns it on. */
export const MERGED_LAYER = 7;

/** A part smaller than this (m, its longest side) casts no shadow of its own: a bolt's shadow costs a shadow draw and shows nothing. */
export const SMALL_PART = 0.3;

interface Source {
  mesh: THREE.Mesh;
  /** It and its ancestors up to the root, for the visibility check. */
  chain: THREE.Object3D[];
  matrix: Float32Array;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  version: number;
  cast: boolean;
  /** Its layers before it was merged. */
  mask: number;
  /** Its vertices in the merged geometry. */
  start: number;
  count: number;
  bucket: Bucket;
  live: boolean;
}

interface Bucket {
  mesh: THREE.Mesh;
  sources: Source[];
  /** Each source's first vertex, in order, to find the source of a triangle by. */
  starts: number[];
}

export interface Merged {
  /** The merged meshes, one per material and flags. */
  readonly meshes: readonly THREE.Mesh[];
  /** How many originals each merged mesh stands in for, all told, and how many still do. */
  readonly merged: number;
  live(): number;
  /** Splits off whatever has moved, hidden or changed since it was merged. Returns how many were. */
  check(): number;
  /** Puts every original back and takes the merged meshes away. */
  undo(): void;
}

export interface MergeOptions {
  /** Subtrees left alone: what moves (units in their seats, the droid). */
  skip?: Iterable<THREE.Object3D>;
  /** Whether `mesh` may be merged at all, after the built-in checks. */
  allow?(mesh: THREE.Mesh): boolean;
}

const baseRender = THREE.Object3D.prototype.onBeforeRender;

/** Whether `o` and everything over it up to `root` is visible. */
function shownUnder(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    if (!n.visible) return false;
    if (n === root) return true;
  }
  return false;
}

/** Whether `mesh` can be drawn as part of a merged one: one opaque material, plain geometry, nothing drawn its own way. */
export function mergeable(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const m = mesh.material;
  if (!m || Array.isArray(m) || m.transparent || m.userData.noMerge || mesh.userData.noMerge) return false;
  if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshLambertMaterial)) return false;
  if (mesh.onBeforeRender !== baseRender) return false;
  const g = mesh.geometry;
  // Groups are fine: a box's six are only for six materials, and it has one.
  if (!g?.attributes.position || Object.keys(g.morphAttributes).length) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  return true;
}

/** The attributes the merged geometry of `material` keeps: position and normal always, uv for a map. */
function wanted(material: THREE.Material): string[] {
  const m = material as THREE.MeshStandardMaterial;
  const out = ['position', 'normal'];
  if (m.map || m.alphaMap || m.normalMap || m.roughnessMap || m.emissiveMap || m.aoMap || m.bumpMap) out.push('uv');
  if (m.vertexColors) out.push('color');
  return out;
}

/** The longest side of `mesh` in the world (m). */
function sizeOf(mesh: THREE.Mesh, box = new THREE.Box3()): number {
  const g = mesh.geometry;
  g.boundingBox ?? g.computeBoundingBox();
  box.copy(g.boundingBox!).applyMatrix4(mesh.matrixWorld);
  return Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
}

/** `geo` baked into `m` as a plain triangle list with only `keep`, wound the right way round even if `m` mirrors it. */
function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4, keep: string[]): THREE.BufferGeometry | null {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  for (const name of keep) if (!g.attributes[name]) return null;
  g.applyMatrix4(m);
  if (m.determinant() < 0) {
    for (const name of keep) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      const tmp: number[] = [];
      for (let i = 0; i + 2 < a.count; i += 3) {
        for (let k = 0; k < a.itemSize; k++) tmp[k] = a.array[(i + 1) * a.itemSize + k] as number;
        for (let k = 0; k < a.itemSize; k++) a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        for (let k = 0; k < a.itemSize; k++) a.array[(i + 2) * a.itemSize + k] = tmp[k];
      }
    }
  }
  return g;
}

/**
 * Merges the static meshes under `root` (see the top of this file). `still` is a snapshot from
 * `snapshot()` some frames earlier: only meshes that haven't moved or hidden since are merged, so what
 * animates all the time never is.
 */
export function mergeStatic(root: THREE.Object3D, opts: MergeOptions = {}, still?: Map<THREE.Mesh, Float32Array>): Merged {
  root.updateMatrixWorld(true);
  const skip = new Set(opts.skip ?? []);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[]; cast: boolean; receive: boolean; order: number; mask: number }>();
  const box = new THREE.Box3();
  const visit = (o: THREE.Object3D) => {
    if (skip.has(o) || !o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mergeable(mesh) && (!opts.allow || opts.allow(mesh)) && (!still || sameMatrix(still.get(mesh), mesh.matrixWorld))) {
      if (mesh.castShadow && sizeOf(mesh, box) < SMALL_PART) mesh.castShadow = false;
      const material = mesh.material as THREE.Material;
      const key = `${material.uuid}|${+mesh.castShadow}${+mesh.receiveShadow}|${mesh.renderOrder}|${mesh.layers.mask}|${wanted(material).join(',')}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { material, meshes: [], cast: mesh.castShadow, receive: mesh.receiveShadow, order: mesh.renderOrder, mask: mesh.layers.mask }));
      group.meshes.push(mesh);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);

  const buckets: Bucket[] = [];
  const all: Source[] = [];
  const m = new THREE.Matrix4();
  for (const group of groups.values()) {
    if (group.meshes.length < 2) continue;
    const keep = wanted(group.material);
    const geos: THREE.BufferGeometry[] = [];
    const sources: Source[] = [];
    let start = 0;
    for (const mesh of group.meshes) {
      const g = bake(mesh.geometry, m.multiplyMatrices(inv, mesh.matrixWorld), keep);
      if (!g) continue;
      const count = g.attributes.position.count;
      const chain: THREE.Object3D[] = [];
      for (let n: THREE.Object3D | null = mesh; n && n !== root.parent; n = n.parent) chain.push(n);
      sources.push({ mesh, chain, matrix: new Float32Array(mesh.matrixWorld.elements), material: group.material, geometry: mesh.geometry, version: (mesh.geometry.attributes.position as THREE.BufferAttribute).version, cast: mesh.castShadow, mask: mesh.layers.mask, start, count, bucket: null!, live: true });
      geos.push(g);
      start += count;
    }
    if (sources.length < 2) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, group.material);
    mesh.name = `merged:${group.material.name || group.material.type}:${sources.length}`;
    mesh.castShadow = group.cast;
    mesh.receiveShadow = group.receive;
    mesh.renderOrder = group.order;
    mesh.layers.mask = group.mask;
    mesh.matrixAutoUpdate = false;
    mesh.userData.noMerge = true;
    const bucket: Bucket = { mesh, sources, starts: sources.map((s) => s.start) };
    for (const s of sources) {
      s.bucket = bucket;
      s.mesh.layers.set(MERGED_LAYER);
    }
    // A hit on the merged mesh is a hit on the original whose triangle it is.
    mesh.raycast = (raycaster, hits) => {
      const from = hits.length;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, hits);
      for (let i = hits.length - 1; i >= from; i--) {
        const s = sourceAt(bucket, (hits[i].faceIndex ?? 0) * 3);
        if (s?.live) hits[i].object = s.mesh;
        else hits.splice(i, 1);
      }
    };
    root.add(mesh);
    buckets.push(bucket);
    all.push(...sources);
  }

  /** Collapses `s`'s triangles in its merged mesh and puts it back on its own layers. */
  function split(s: Source) {
    s.live = false;
    const pos = s.bucket.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const x = a[s.start * 3];
    const y = a[s.start * 3 + 1];
    const z = a[s.start * 3 + 2];
    for (let i = s.start; i < s.start + s.count; i++) {
      a[i * 3] = x;
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = z;
    }
    pos.addUpdateRange(s.start * 3, s.count * 3);
    pos.needsUpdate = true;
    s.mesh.layers.mask = s.mask;
  }

  let left = all.length;
  return {
    meshes: buckets.map((b) => b.mesh),
    merged: all.length,
    live: () => left,
    check() {
      let n = 0;
      for (const s of all) {
        if (!s.live) continue;
        const mesh = s.mesh;
        const moved =
          mesh.material !== s.material ||
          mesh.geometry !== s.geometry ||
          (mesh.geometry.attributes.position as THREE.BufferAttribute).version !== s.version ||
          mesh.castShadow !== s.cast ||
          !shownUnder(mesh, root) ||
          !sameMatrix(s.matrix, mesh.matrixWorld);
        if (!moved) continue;
        split(s);
        n++;
      }
      left -= n;
      return n;
    },
    undo() {
      for (const s of all) if (s.live) s.mesh.layers.mask = s.mask;
      for (const b of buckets) {
        b.mesh.removeFromParent();
        b.mesh.geometry.dispose();
      }
      left = 0;
    },
  };
}

/** The source whose vertices include `vertex`. */
function sourceAt(b: Bucket, vertex: number): Source | undefined {
  let lo = 0;
  let hi = b.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (b.starts[mid] <= vertex) lo = mid;
    else hi = mid - 1;
  }
  return b.sources[lo];
}

/** Every mesh under `root` and where it is now, to merge against later (see mergeStatic's `still`). */
export function snapshot(root: THREE.Object3D): Map<THREE.Mesh, Float32Array> {
  root.updateMatrixWorld(true);
  const out = new Map<THREE.Mesh, Float32Array>();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && shownUnder(o, root)) out.set(o as THREE.Mesh, new Float32Array(o.matrixWorld.elements));
  });
  return out;
}

function sameMatrix(a: Float32Array | undefined, b: THREE.Matrix4): boolean {
  if (!a) return false;
  const e = b.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - e[i]) > 1e-5) return false;
  return true;
}
