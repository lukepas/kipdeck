import * as THREE from 'three';
import { heightAt, POD_LETTERS, type PodLetter } from '../../../shared/layout';
import { POD_HUE_NONE } from '../../../shared/podhue';
import { fontsReady } from '../../world/toon';
import type { Fixture } from '../../world/office/fixture';
import { paintBar, paintLabel } from './draw';
import { LABEL, LABEL_SPOTS, LABEL_YAW } from './footprint';
import { OVERVIEW_PITCH } from '../../core/overview-frame';
import { rolls, type PodLabelText, type Tone } from './label';
import { makeZones } from './zone';

// Each pod's zone and ground label (see features/pods): its slice of the tier washed in its goal's hue,
// and, on the open deck beside its pod, a label lying flat and turned to the Overview's default yaw,
// with the goal and "1 needs you · 3 working". Its type is in world space, so it grows and shrinks with
// the Overview's zoom, and from up there it's drawn over anything in front of it. A label hides as the
// walking camera comes within 4 m of it (fading out over the last metre), so it isn't clutter at your
// feet; the zone always shows.
//
// From the Overview zoomed out a label grows (up to MAX_GROW) so its counts line never reads smaller
// than MIN_TEXT_PX on screen; every trip up frames it whole (index.ts, core/overview-frame.ts).
//
// Draw calls are the deck's budget (docs/design.md, Draw budgets): every pod's zone, its fill and its
// outline, is one mesh (zone.ts), and every label is one cell of one canvas, drawn as one mesh, so the
// four pods cost two draws however many there are.

/** The least height (px) the counts line's capitals take on screen from the Overview, and the most a label grows for it. */
export const MIN_TEXT_PX = 11;
export const MAX_GROW = 1.5;
/** The counts line's capitals against the label's depth (draw.ts: a 0.38 font, capitals about 0.72 of it). */
const CAPS = 0.38 * 0.72;

/**
 * How much a label grows from the Overview so its counts line is MIN_TEXT_PX tall: `pxPerM` the screen's
 * pixels a metre, `pitch` how steeply the camera looks down (the floor's depth comes out sin(pitch) as tall).
 */
export function labelGrow(pxPerM: number, pitch: number): number {
  const px = CAPS * LABEL.d * Math.sin(pitch) * pxPerM;
  return Math.min(MAX_GROW, Math.max(1, MIN_TEXT_PX / Math.max(1e-6, px)));
}

/** How long a changed count takes to roll in, and how near (m) the walking camera hides a label. */
export const ROLL_MS = 220;
export const HIDE_NEAR = { from: 5, to: 4 } as const;

/** What a pod shows: its goal's hue and its label's words. */
export interface PodView {
  hue: string;
  text: PodLabelText;
}

export interface PodDeck {
  /** Shows each pod's view: a new hue fades in, a label whose words changed is painted again (its changed counts rolling). */
  show(views: Record<PodLetter, PodView>, now: number, reduce: boolean): void;
  /** Moves the fades and rolls on to `now`. */
  tick(now: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The pods' zones and ground labels (see features/pods). */
    pods: PodDeck;
  }
}

/** How visible a label is to `camera` from `at`: the Overview's always sees it; walking, it fades out inside HIDE_NEAR. */
export function labelAlpha(camera: THREE.Camera, at: THREE.Vector3): number {
  if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return 1;
  const d = camera.position.distanceTo(at);
  return Math.min(1, Math.max(0, (d - HIDE_NEAR.to) / (HIDE_NEAR.from - HIDE_NEAR.to)));
}

/** One pod's label: its cell of the shared canvas, what it says, and its rolling numbers. */
interface Label {
  letter: PodLetter;
  cell: number;
  text?: PodLabelText;
  rolling: Map<Tone, number | undefined>;
  rollAt: number;
  /** Where it lies, for its fade as the walking camera nears. */
  at: THREE.Vector3;
  alpha: number;
}

/** The four pods' zones and labels. */
export const podPlates: Fixture<'pods'> = (site) => {
  const group = new THREE.Group();
  group.name = 'pods';
  const zones = makeZones(POD_LETTERS, POD_HUE_NONE);
  group.add(zones.group);

  // One canvas, a cell a label, top to bottom in POD_LETTERS's order.
  const n = POD_LETTERS.length;
  const W = Math.round(LABEL.w * LABEL.px);
  const H = Math.round(LABEL.d * LABEL.px);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H * n;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  // Each label's plane, turned and laid where it lies, its UVs on its own cell, its strength in its vertices' alpha.
  const labels: Label[] = [];
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  POD_LETTERS.forEach((letter, cell) => {
    const spot = LABEL_SPOTS[letter];
    const y = heightAt(spot.x, spot.z) + 0.012;
    // Its top away from the Overview's camera at its default yaw: it reads the right way up from there.
    const plane = new THREE.PlaneGeometry(LABEL.w, LABEL.d).rotateX(-Math.PI / 2).rotateY(LABEL_YAW).translate(spot.x, y, spot.z);
    const base = pos.length / 3;
    pos.push(...Array.from(plane.getAttribute('position').array));
    const u = plane.getAttribute('uv');
    for (let i = 0; i < u.count; i++) uv.push(u.getX(i), (u.getY(i) + (n - 1 - cell)) / n);
    for (const i of plane.getIndex()?.array ?? []) index.push(base + i);
    plane.dispose();
    labels.push({ letter, cell, rolling: new Map(), rollAt: -Infinity, at: new THREE.Vector3(spot.x, y, spot.z), alpha: 1 });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 4).fill(1), 4));
  geo.setIndex(index);
  const mat = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 20;
  mesh.name = 'pod-labels';
  // Lettering on the floor: the crosshair's ray passes through it.
  mesh.raycast = () => {};
  group.add(mesh);
  const alphas = geo.getAttribute('color') as THREE.BufferAttribute;
  const where = geo.getAttribute('position') as THREE.BufferAttribute;
  const flat = Float32Array.from(where.array as ArrayLike<number>);
  let grownBy = 1;
  /** Grows every label `k` times round its own middle (their corners from where they were built). */
  const grow = (k: number) => {
    grownBy = k;
    for (const l of labels) {
      for (let i = l.cell * 4; i < l.cell * 4 + 4; i++) {
        where.setXYZ(i, l.at.x + (flat[i * 3] - l.at.x) * k, flat[i * 3 + 1], l.at.z + (flat[i * 3 + 2] - l.at.z) * k);
      }
    }
    where.needsUpdate = true;
    geo.computeBoundingSphere();
  };
  // Worked out for whichever camera is drawing them: hidden at your feet while walking, and over
  // whatever stands in front of them from the Overview (a rail, a wall), the way a plan's lettering is.
  // A label's strength reaches its vertices on the next frame drawn, too soon to see.
  mesh.onBeforeRender = (_r, _s, camera) => {
    mat.depthTest = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
    const ortho = camera as THREE.OrthographicCamera;
    const k = ortho.isOrthographicCamera ? labelGrow(innerHeight / Math.max(1e-6, (ortho.top - ortho.bottom) / ortho.zoom), OVERVIEW_PITCH) : 1;
    if (Math.abs(k - grownBy) > 0.01) grow(k);
    for (const l of labels) {
      const a = labelAlpha(camera, l.at);
      if (Math.abs(a - l.alpha) < 0.004) continue;
      l.alpha = a;
      for (let i = l.cell * 4; i < l.cell * 4 + 4; i++) alphas.setW(i, a);
      alphas.needsUpdate = true;
    }
  };
  site.group.add(group);

  const hex = new THREE.Color();
  /** Paints label `l`'s cell, its numbers `k` of the way through their roll, and its bar in its zone's hue now. */
  function repaint(l: Label, k: number) {
    if (!l.text) return;
    g.save();
    g.translate(0, l.cell * H);
    paintLabel(g, W, H, l.text, l.rolling, k);
    paintBar(g, W, H, `#${hex.copy(zones.color(l.letter)).getHexString()}`);
    g.restore();
    texture.needsUpdate = true;
  }
  // Painted again once the type is in: the first time, it may still be on its way.
  void fontsReady().then(() => {
    for (const l of labels) repaint(l, 1);
  });

  const pods: PodDeck = {
    show(views, now, reduce) {
      for (const l of labels) {
        const v = views[l.letter];
        const was = zones.color(l.letter).getHex();
        zones.setHue(l.letter, v.hue, now, reduce);
        const hueMoved = zones.color(l.letter).getHex() !== was;
        if (l.text?.key === v.text.key) {
          if (hueMoved) repaint(l, 1);
          continue;
        }
        l.rolling = reduce ? new Map() : rolls(l.text?.segments, v.text.segments);
        l.rollAt = now;
        l.text = v.text;
        repaint(l, l.rolling.size ? 0 : 1);
      }
    },
    tick(now) {
      const before = labels.map((l) => zones.color(l.letter).getHex());
      zones.tick(now);
      for (const [i, l] of labels.entries()) {
        const hueMoved = zones.color(l.letter).getHex() !== before[i];
        if (!l.rolling.size) {
          if (hueMoved) repaint(l, 1);
          continue;
        }
        const k = (now - l.rollAt) / ROLL_MS;
        if (k >= 1) l.rolling = new Map();
        repaint(l, Math.min(1, k));
      }
    },
  };
  return { handle: { pods } };
};
