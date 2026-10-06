import * as THREE from 'three';
import { WHITEBOARD } from '../../../shared/layout';
import { mesh, textPlane } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, contactShadow, ink as wallInk, matte } from '../../world/office/materials';
import { screen } from '../boards/screen';
import { FACE_UNITS, paintPlan, planFar, sketchBox, type PlanView } from './face';
import { paintFar } from '../boards/far';

// The planning board: a slim board on casters out on the open floor in the east aisle. Its face shows
// the floor's plan as tables and whatever everyone has drawn on it (see ui.ts), live, beside them
// (face.ts).

export interface WhiteboardStand {
  group: THREE.Group;
  colliders: Collider[];
  /** Walk up and press E. */
  interactable: Interactable;
  /** Puts a drawing on the face (scaled to fit its box), or the queue's table when there's none. */
  show(drawing: HTMLCanvasElement | null): void;
  /** The plan's tables (face.ts). */
  setPlan(plan: PlanView): void;
  /** From across the deck its headline counts instead of its tables (boards/far.ts). */
  setFar(far: boolean): void;
  /** Its face, for how far it is from you. */
  face: THREE.Object3D;
  /** How big a drawing fills its box on the face, in pixels. */
  fit: { width: number; height: number };
}

export function buildWhiteboard(): WhiteboardStand {
  const { x, z, rotY, width, height, bottom } = WHITEBOARD;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  const alu = matte(DECK.steel, { metalness: 0.3, roughness: 0.6 });
  const ink = matte(DECK.wallReveal);
  const mid = bottom + height / 2;
  const post = width / 2 + 0.1;

  // The writing surface in a slim steel frame; the back is a plain slate panel.
  group.add(mesh(box(width + 0.1, height + 0.1, 0.06), ink, 0, mid, 0));
  const face2d = screen(width, height, FACE_UNITS);
  const texture = face2d.texture;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  face.position.set(0, mid, 0.032);
  group.add(face);

  // Two posts on feet with a caster at each end, and a bar across the bottom.
  for (const sx of [-post, post]) {
    group.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, bottom + height + 0.2, 10), alu, sx, (bottom + height + 0.2) / 2 + 0.1, 0));
    group.add(mesh(box(0.09, 0.06, 0.95), alu, sx, 0.13, 0));
    for (const sz of [-0.42, 0.42]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12), ink, sx, 0.055, sz, false);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
    }
    group.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), alu, sx, bottom + height + 0.3, 0, false));
  }
  group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, post * 2, 8).rotateZ(Math.PI / 2), alu, 0, 0.3, 0, false));

  // A slim tray under the face.
  group.add(mesh(box(width * 0.55, 0.03, 0.1), alu, 0, bottom - 0.08, 0.07, false));
  group.add(contactShadow(width + 0.8, 1.6));

  const plaque = textPlane('PLANNING BOARD', { face: 'display', size: 48, color: DECK.muted, track: 0.08 });
  plaque.scale.multiplyScalar(0.55);
  wallInk(plaque.material);
  // Its left edge on the face's: the sign is as wide as its words, so it is placed by its own width.
  plaque.geometry.computeBoundingBox();
  const signW = (plaque.geometry.boundingBox!.max.x - plaque.geometry.boundingBox!.min.x) * plaque.scale.x;
  plaque.position.set(-width / 2 + 0.05 + signW / 2, bottom + height + 0.2, 0.05);
  group.add(plaque);

  const colliders: Collider[] = [{ minX: x - post - 0.1, maxX: x + post + 0.1, minZ: z - 0.48, maxZ: z + 0.48, top: bottom + height + 0.35 }];
  const interactable: Interactable = { kind: 'whiteboard', x: x + Math.sin(rotY) * 1.7, z: z + Math.cos(rotY) * 1.7, radius: 2.3 };
  group.userData.interact = interactable;

  let drawing: HTMLCanvasElement | null = null;
  let plan: PlanView = { statement: '', done: 0, total: 0, milestones: [], queue: [], queued: 0 };
  let far = true;
  const paint = () => (far ? paintFar(face2d, FACE_UNITS, planFar(plan)) : paintPlan(face2d, plan, drawing));
  const show = (d: HTMLCanvasElement | null) => {
    drawing = d;
    paint();
  };
  const setPlan = (p: PlanView) => {
    plan = p;
    paint();
  };
  const setFar = (f: boolean) => {
    if (f === far) return;
    far = f;
    paint();
  };
  paint();
  const sketch = sketchBox(face2d.W, face2d.H);
  const px = face2d.canvas.width / face2d.W;

  return { group, colliders, interactable, show, setPlan, setFar, face, fit: { width: Math.round(sketch.w * px), height: Math.round(sketch.h * px) } };
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The rolling whiteboard everyone draws on together. */
    whiteboard: WhiteboardStand;
  }
}

/** The whiteboard, out on the floor in the east aisle. */
export const whiteboard: Fixture<'whiteboard'> = () => {
  const built = buildWhiteboard();
  return { group: built.group, colliders: built.colliders, interactables: [built.interactable], handle: { whiteboard: built } };
};
