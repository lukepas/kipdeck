import * as THREE from 'three';
import { heightAt, POD_LETTERS, type PodLetter } from '../../../shared/layout';
import { POD_HUE_NONE } from '../../../shared/podhue';
import { fontsReady } from '../../world/toon';
import type { Fixture } from '../../world/office/fixture';
import { BAR, paintLabel } from './draw';
import { LABEL, LABEL_SPOTS, LABEL_YAW } from './footprint';
import { rolls, type PodLabelText, type Tone } from './label';
import { makeZone, type Zone } from './zone';

// Each pod's zone and ground label (see features/pods): its slice of the tier washed in its goal's hue,
// and, on the open deck beside the amphitheatre, a label lying flat and turned to the Overview's
// default yaw, with the goal and "1 needs you · 3 working". Its type is in world space, so it grows
// and shrinks with the Overview's zoom, and from up there it's drawn over anything in front of it.
// A label hides as the walking camera comes within 4 m of it
// (fading out over the last metre), so it isn't clutter at your feet; the zone always shows.

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

interface Label {
  mesh: THREE.Mesh;
  bar: THREE.Mesh;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  text?: PodLabelText;
  rolling: Map<Tone, number | undefined>;
  rollAt: number;
  zone: Zone;
}

function makeLabel(letter: PodLetter, zone: Zone): Label {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(LABEL.w * LABEL.px);
  canvas.height = Math.round(LABEL.d * LABEL.px);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(LABEL.w, LABEL.d).rotateX(-Math.PI / 2), mat);
  const spot = LABEL_SPOTS[letter];
  mesh.position.set(spot.x, heightAt(spot.x, spot.z) + 0.012, spot.z);
  // Its top away from the Overview's camera at its default yaw: it reads the right way up from there.
  mesh.rotation.y = LABEL_YAW;
  mesh.renderOrder = 20;
  mesh.name = `pod-label-${letter}`;
  // The goal's hue, a bar down the label's left, following the zone's fade.
  const bw = LABEL.w * BAR;
  const barMat = new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(bw, LABEL.d * 0.72).rotateX(-Math.PI / 2), barMat);
  bar.position.set(-LABEL.w / 2 + bw / 2 + LABEL.d * 0.08, 0.002, 0);
  bar.renderOrder = 21;
  mesh.add(bar);
  // Worked out for whichever camera is drawing it: hidden at your feet while walking, and over
  // whatever stands in front of it from the Overview (a rail, a wall), the way a plan's lettering is.
  const world = new THREE.Vector3();
  mesh.onBeforeRender = (_r, _s, camera) => {
    const a = labelAlpha(camera, mesh.getWorldPosition(world));
    const over = !(camera as THREE.PerspectiveCamera).isPerspectiveCamera;
    for (const m of [mat, barMat]) {
      m.opacity = a;
      m.depthTest = !over;
    }
  };
  return { mesh, bar, canvas, texture, rolling: new Map(), rollAt: -Infinity, zone };
}

function repaint(l: Label, k: number) {
  if (!l.text) return;
  paintLabel(l.canvas.getContext('2d')!, l.canvas.width, l.canvas.height, l.text, l.rolling, k);
  l.texture.needsUpdate = true;
}

/** The four pods' zones and labels. */
export const podPlates: Fixture<'pods'> = (site) => {
  const labels = new Map<PodLetter, Label>();
  const group = new THREE.Group();
  group.name = 'pods';
  for (const letter of POD_LETTERS) {
    const zone = makeZone(letter, POD_HUE_NONE);
    const label = makeLabel(letter, zone);
    group.add(zone.group, label.mesh);
    labels.set(letter, label);
  }
  site.group.add(group);
  // Painted again once the type is in: the first time, it may still be on its way.
  void fontsReady().then(() => {
    for (const l of labels.values()) repaint(l, 1);
  });

  const pods: PodDeck = {
    show(views, now, reduce) {
      for (const [letter, l] of labels) {
        const v = views[letter];
        l.zone.setHue(v.hue, now, reduce);
        (l.bar.material as THREE.MeshBasicMaterial).color.copy(l.zone.color);
        if (l.text?.key === v.text.key) continue;
        l.rolling = reduce ? new Map() : rolls(l.text?.segments, v.text.segments);
        l.rollAt = now;
        l.text = v.text;
        repaint(l, l.rolling.size ? 0 : 1);
      }
    },
    tick(now) {
      for (const l of labels.values()) {
        l.zone.tick(now);
        (l.bar.material as THREE.MeshBasicMaterial).color.copy(l.zone.color);
        if (!l.rolling.size) continue;
        const k = (now - l.rollAt) / ROLL_MS;
        if (k >= 1) l.rolling = new Map();
        repaint(l, Math.min(1, k));
      }
    },
  };
  return { handle: { pods } };
};
