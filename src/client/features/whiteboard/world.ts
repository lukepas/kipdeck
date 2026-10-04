import * as THREE from 'three';
import { WHITEBOARD } from '../../../shared/layout';
import { mesh, textPlane } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, contactShadow, matte } from '../../world/office/materials';

// The whiteboard: a slim board on casters out on the open floor in the east aisle. Its face shows
// whatever everyone has drawn on it (see ui.ts), live, drawn light on the deck's slate.
/** The face's canvas, in pixels per meter. */
const PX = 512;
/** Clear space around a drawing on the face, in pixels. */
const PAD = 40;
const FONT = 'Archivo, system-ui, sans-serif';

export interface WhiteboardStand {
  group: THREE.Group;
  colliders: Collider[];
  /** Walk up and press E. */
  interactable: Interactable;
  /** Puts a drawing on the face (scaled to fit), or the "come and draw" note when there's none. */
  show(drawing: HTMLCanvasElement | null): void;
  /** How big a drawing fills the face, in pixels. */
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
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * PX);
  canvas.height = Math.round(height * PX);
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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

  const plaque = textPlane('WHITEBOARD', { face: 'display', size: 48, color: DECK.muted, track: 0.08 });
  plaque.scale.multiplyScalar(0.55);
  plaque.position.set(-width / 2 + 0.5, bottom + height + 0.2, 0.05);
  group.add(plaque);

  const colliders: Collider[] = [{ minX: x - post - 0.1, maxX: x + post + 0.1, minZ: z - 0.48, maxZ: z + 0.48, top: bottom + height + 0.35 }];
  const interactable: Interactable = { kind: 'whiteboard', x: x + Math.sin(rotY) * 1.7, z: z + Math.cos(rotY) * 1.7, radius: 2.3 };
  group.userData.interact = interactable;

  const show = (drawing: HTMLCanvasElement | null) => {
    const W = canvas.width;
    const H = canvas.height;
    g.fillStyle = DECK.console;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(38,49,61,0.5)';
    for (let gx = PX / 4; gx < W; gx += PX / 4) g.fillRect(gx, 0, 1, H);
    for (let gy = PX / 4; gy < H; gy += PX / 4) g.fillRect(0, gy, W, 1);
    if (drawing) {
      const s = Math.min((W - PAD * 2) / drawing.width, (H - PAD * 2) / drawing.height);
      const w = drawing.width * s;
      const h = drawing.height * s;
      // Drawn dark on white, shown light on the slate: the same picture in the deck's dark mode.
      g.filter = 'invert(1) hue-rotate(180deg)';
      g.drawImage(drawing, (W - w) / 2, (H - h) / 2, w, h);
      g.filter = 'none';
    } else {
      g.fillStyle = DECK.text;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `600 110px ${FONT}`;
      g.fillText('Planning board', W / 2, H / 2 - 60);
      g.fillStyle = DECK.muted;
      g.font = `500 56px ${FONT}`;
      g.fillText('Sketch the plan. Everyone on this deck sees it.', W / 2, H / 2 + 70);
    }
    texture.needsUpdate = true;
  };
  show(null);

  return { group, colliders, interactable, show, fit: { width: canvas.width - PAD * 2, height: canvas.height - PAD * 2 } };
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
